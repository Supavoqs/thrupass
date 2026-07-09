const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { validateScan } = require('./validate');
const { GATES } = require('./gates');
const { sign } = require('./crypto');

const app = express();
app.use(cors());
app.use(express.json());

function accountView(accountId) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) return null;
  const ticket = db
    .prepare('SELECT * FROM tickets WHERE account_id = ? ORDER BY rowid DESC LIMIT 1')
    .get(accountId);
  const tag = db.prepare('SELECT * FROM tags WHERE account_id = ?').get(accountId);
  return {
    id: account.id,
    holder: account.holder,
    email: account.email,
    balanceCents: account.balance_cents,
    ticket: ticket
      ? {
          id: ticket.id,
          eventName: ticket.event_name,
          tier: ticket.tier,
          zones: JSON.parse(ticket.zones),
          status: ticket.status,
        }
      : null,
    tag: tag ? { uid: tag.uid, state: tag.state } : null,
  };
}

// ---- Provision & encode/link ----
app.post('/tags/:uid/link', (req, res) => {
  const { uid } = req.params;
  const { account_id } = req.body;
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id);
  if (!account) return res.status(404).json({ error: 'account_not_found' });

  const existing = db.prepare('SELECT * FROM tags WHERE uid = ?').get(uid);
  if (existing) {
    db.prepare('UPDATE tags SET account_id = ?, state = ? WHERE uid = ?').run(account_id, 'active', uid);
  } else {
    db.prepare('INSERT INTO tags (uid, account_id, state) VALUES (?, ?, ?)').run(uid, account_id, 'active');
  }
  res.json({ uid, account_id, state: 'active' });
});

// ---- Tap / read + validate + decide ----
app.post('/gates/:id/scan', (req, res) => {
  const gateId = req.params.id;
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'uid_required' });

  const decision = validateScan(uid, gateId);
  const ts = Date.now();

  db.prepare(
    'INSERT INTO scan_events (tag_uid, gate_id, ts, result, reason, read_ms) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uid, gateId, ts, decision.result, decision.reason, decision.readMs);

  res.json({
    result: decision.result,
    reason: decision.reason,
    readMs: decision.readMs,
    ts,
    gate: GATES[gateId] || null,
    account: decision.account
      ? { id: decision.account.id, holder: decision.account.holder }
      : null,
    ticket: decision.ticket
      ? { id: decision.ticket.id, tier: decision.ticket.tier, zones: decision.zones }
      : null,
  });
});

// ---- Offline allowlist snapshot (signed, cached by readers) ----
app.get('/gates/:id/allowlist', (req, res) => {
  const rows = db
    .prepare(
      `SELECT tags.uid, tags.state, accounts.id as account_id, tickets.tier, tickets.zones, tickets.status
       FROM tags
       LEFT JOIN accounts ON accounts.id = tags.account_id
       LEFT JOIN tickets ON tickets.account_id = tags.account_id`
    )
    .all()
    .map((r) => ({
      uid: r.uid,
      state: r.state,
      accountId: r.account_id,
      tier: r.tier,
      zones: r.zones ? JSON.parse(r.zones) : [],
      ticketStatus: r.status,
    }));

  const snapshot = { gateId: req.params.id, generatedAt: Date.now(), entries: rows };
  res.json(sign(snapshot));
});

// ---- Blocklist ----
app.post('/tags/:uid/block', (req, res) => {
  const { uid } = req.params;
  const tag = db.prepare('SELECT * FROM tags WHERE uid = ?').get(uid);
  if (!tag) return res.status(404).json({ error: 'tag_not_found' });
  db.prepare('UPDATE tags SET state = ? WHERE uid = ?').run('blocked', uid);
  res.json({ uid, state: 'blocked' });
});

// ---- Cashless top-up (clears against account ledger, never the tag) ----
app.post('/accounts/:id/topup', (req, res) => {
  const { id } = req.params;
  const { amount_cents } = req.body;
  if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
    return res.status(400).json({ error: 'invalid_amount' });
  }
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'account_not_found' });

  db.prepare('UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?').run(amount_cents, id);
  const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  res.json({ id, balanceCents: updated.balance_cents });
});

// ---- Create account (attendee self-signup or staff walk-up registration) ----
app.post('/accounts', (req, res) => {
  const { holder, email } = req.body;
  if (!holder || typeof holder !== 'string' || !holder.trim()) {
    return res.status(400).json({ error: 'holder_required' });
  }
  const id = `acc_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare('INSERT INTO accounts (id, holder, email, balance_cents) VALUES (?, ?, ?, ?)').run(
    id,
    holder.trim(),
    email ? String(email).trim() : null,
    0
  );
  res.status(201).json(accountView(id));
});

// ---- Wallet view for the attendee app ----
app.get('/accounts/:id', (req, res) => {
  const view = accountView(req.params.id);
  if (!view) return res.status(404).json({ error: 'account_not_found' });
  res.json(view);
});

// ---- Gate reader dashboard feed ----
app.get('/gates/:id/recent', (req, res) => {
  const gateId = req.params.id;
  const rows = db
    .prepare(
      `SELECT scan_events.*, accounts.holder as holder
       FROM scan_events
       LEFT JOIN tags ON tags.uid = scan_events.tag_uid
       LEFT JOIN accounts ON accounts.id = tags.account_id
       WHERE scan_events.gate_id = ?
       ORDER BY scan_events.id DESC
       LIMIT 10`
    )
    .all(gateId);
  res.json(
    rows.map((r) => ({
      ts: r.ts,
      holder: r.holder || 'Unknown tag',
      result: r.result,
      reason: r.reason,
    }))
  );
});

// ---- Latest full decision at a gate, for readers/apps to poll and react live ----
app.get('/gates/:id/last-scan', (req, res) => {
  const gateId = req.params.id;
  const row = db
    .prepare(
      `SELECT scan_events.*, accounts.id as account_id, accounts.holder as holder,
              tickets.id as ticket_id, tickets.tier as tier, tickets.zones as zones
       FROM scan_events
       LEFT JOIN tags ON tags.uid = scan_events.tag_uid
       LEFT JOIN accounts ON accounts.id = tags.account_id
       LEFT JOIN tickets ON tickets.account_id = tags.account_id
       WHERE scan_events.gate_id = ?
       ORDER BY scan_events.id DESC
       LIMIT 1`
    )
    .get(gateId);

  if (!row) return res.json(null);

  res.json({
    uid: row.tag_uid,
    result: row.result,
    reason: row.reason,
    readMs: row.read_ms,
    ts: row.ts,
    gate: GATES[gateId] || null,
    account: row.account_id ? { id: row.account_id, holder: row.holder } : null,
    ticket: row.ticket_id ? { id: row.ticket_id, tier: row.tier, zones: JSON.parse(row.zones) } : null,
  });
});

app.get('/gates/:id/stats', (req, res) => {
  const gateId = req.params.id;
  const total = db
    .prepare(`SELECT COUNT(*) as c FROM scan_events WHERE gate_id = ?`)
    .get(gateId).c;
  const sinceMinuteAgo = db
    .prepare(`SELECT COUNT(*) as c FROM scan_events WHERE gate_id = ? AND ts > ?`)
    .get(gateId, Date.now() - 60_000).c;
  res.json({ total, perMinute: sinceMinuteAgo });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Thru Pass server listening on :${PORT}`);
});
