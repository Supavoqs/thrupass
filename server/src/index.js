const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { validateScan } = require('./validate');
const { GATES } = require('./gates');
const { sign, hashPassword, verifyPassword } = require('./crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Landing page at "/", Client kiosk at "/client", attendee app at "/app" —
// all served from this same host/process as the API, alongside it.
app.use(express.static(path.join(__dirname, '..', 'public')));

function eventView(event) {
  if (!event) return null;
  return {
    id: event.id,
    name: event.name,
    startDate: event.start_date,
    endDate: event.end_date,
    location: event.location,
    tiers: JSON.parse(event.tiers),
    zones: JSON.parse(event.zones),
  };
}

function accountView(accountId) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) return null;
  const ticket = db
    .prepare('SELECT * FROM tickets WHERE account_id = ? ORDER BY rowid DESC LIMIT 1')
    .get(accountId);
  const tag = db.prepare('SELECT * FROM tags WHERE account_id = ?').get(accountId);
  let ticketView = null;
  if (ticket) {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(ticket.event_id);
    ticketView = {
      id: ticket.id,
      event: eventView(event),
      tier: ticket.tier,
      zones: JSON.parse(ticket.zones),
      status: ticket.status,
    };
  }
  return {
    id: account.id,
    holder: account.holder,
    email: account.email,
    balanceCents: account.balance_cents,
    ticket: ticketView,
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
  db.prepare('INSERT INTO cash_events (account_id, type, amount_cents, ts) VALUES (?, ?, ?, ?)').run(
    id,
    'load',
    amount_cents,
    Date.now()
  );
  const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  res.json({ id, balanceCents: updated.balance_cents });
});

// ---- Cash-out: attendee reimbursement, or staff-initiated payout ----
app.post('/accounts/:id/cashout', (req, res) => {
  const { id } = req.params;
  const { amount_cents } = req.body;
  if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
    return res.status(400).json({ error: 'invalid_amount' });
  }
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'account_not_found' });
  if (amount_cents > account.balance_cents) {
    return res.status(400).json({ error: 'insufficient_balance' });
  }

  db.prepare('UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?').run(amount_cents, id);
  db.prepare('INSERT INTO cash_events (account_id, type, amount_cents, ts) VALUES (?, ?, ?, ?)').run(
    id,
    'payout',
    amount_cents,
    Date.now()
  );
  const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  res.json({ id, balanceCents: updated.balance_cents });
});

// ---- Recent cash activity for an account ----
app.get('/accounts/:id/cash-events', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM cash_events WHERE account_id = ? ORDER BY id DESC LIMIT 10')
    .all(req.params.id);
  res.json(rows.map((r) => ({ type: r.type, amountCents: r.amount_cents, ts: r.ts })));
});

// ---- Host account signup (gates the Client kiosk's admin tabs) ----
app.post('/hosts', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name_required' });
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'valid_email_required' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'password_too_short' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM hosts WHERE email = ?').get(normalizedEmail);
  if (existing) return res.status(409).json({ error: 'email_already_registered' });

  const id = `host_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare('INSERT INTO hosts (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    name.trim(),
    normalizedEmail,
    hashPassword(password),
    Date.now()
  );
  res.status(201).json({ id, name: name.trim(), email: normalizedEmail });
});

// ---- Host login ----
app.post('/hosts/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });

  const host = db.prepare('SELECT * FROM hosts WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!host || !verifyPassword(password, host.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  res.json({ id: host.id, name: host.name, email: host.email });
});

// ---- Create event (organizer/admin) ----
app.post('/events', (req, res) => {
  const { name, startDate, endDate, location, tiers, zones } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name_required' });
  }
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'dates_required' });
  }
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return res.status(400).json({ error: 'tiers_required' });
  }
  if (!Array.isArray(zones) || zones.length === 0) {
    return res.status(400).json({ error: 'zones_required' });
  }

  const id = `evt_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(
    'INSERT INTO events (id, name, start_date, end_date, location, tiers, zones, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name.trim(), startDate, endDate, location || null, JSON.stringify(tiers), JSON.stringify(zones), Date.now());

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  res.status(201).json(eventView(event));
});

// ---- List events (for event/tier pickers in Client + attendee app) ----
app.get('/events', (req, res) => {
  const rows = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all();
  res.json(rows.map(eventView));
});

// ---- Create account (attendee self-signup or staff walk-up registration),
// optionally issuing a ticket for a given event + tier in the same step ----
app.post('/accounts', (req, res) => {
  const { holder, email, eventId, tier, zones } = req.body;
  if (!holder || typeof holder !== 'string' || !holder.trim()) {
    return res.status(400).json({ error: 'holder_required' });
  }

  let event = null;
  if (eventId) {
    event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) return res.status(404).json({ error: 'event_not_found' });
    if (!tier || !JSON.parse(event.tiers).includes(tier)) {
      return res.status(400).json({ error: 'invalid_tier' });
    }
  }

  const id = `acc_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare('INSERT INTO accounts (id, holder, email, balance_cents) VALUES (?, ?, ?, ?)').run(
    id,
    holder.trim(),
    email ? String(email).trim() : null,
    0
  );

  if (event) {
    const ticketZones = Array.isArray(zones) && zones.length ? zones : JSON.parse(event.zones);
    const ticketId = `tkt_${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(
      'INSERT INTO tickets (id, account_id, event_id, tier, zones, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(ticketId, id, event.id, tier, JSON.stringify(ticketZones), 'active');
  }

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
