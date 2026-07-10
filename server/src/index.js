const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { validateScan } = require('./validate');
const { GATES } = require('./gates');
const { sign, hashPassword, verifyPassword } = require('./crypto');
const peach = require('./peachPayments');

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://thrupass.co.za';

const app = express();
app.use(cors());
// Retain the exact raw request bytes alongside the parsed body — Peach
// Payments webhook signatures are computed over the raw payload, and
// re-serializing req.body could produce different bytes (key order,
// whitespace) than what Peach originally signed.
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// Landing page at "/", Client kiosk at "/client", attendee app at "/app" —
// all served from this same host/process as the API, alongside it. HTML
// files must always be revalidated: each deploy replaces the JS/CSS bundles
// with new content-hashed filenames, and a cached stale index.html pointing
// at a now-deleted bundle file is a blank-page bug waiting to happen.
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

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
    addOns: JSON.parse(event.addons || '[]'),
  };
}

function accountView(accountId) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) return null;
  const ticket = db
    .prepare('SELECT * FROM tickets WHERE account_id = ? ORDER BY rowid DESC LIMIT 1')
    .get(accountId);
  const tag = db.prepare("SELECT * FROM tags WHERE account_id = ? AND state = 'active'").get(accountId);
  let ticketView = null;
  if (ticket) {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(ticket.event_id);
    ticketView = {
      id: ticket.id,
      event: eventView(event),
      tier: ticket.tier,
      zones: JSON.parse(ticket.zones),
      addOns: JSON.parse(ticket.addons || '[]'),
      priceCents: ticket.price_cents || 0,
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

  // Retire any wristband(s) this account previously held before attaching
  // the new one — otherwise a lost/replaced wristband would stay active
  // and both would grant access to the same account.
  db.prepare("UPDATE tags SET state = 'retired' WHERE account_id = ? AND uid != ?").run(account_id, uid);

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

// ---- Resolve a wristband's QR/tag UID to its linked account — used by the
// Bar Tab's QR scanner so staff never need to know or type an account ID. ----
app.get('/tags/:uid', (req, res) => {
  const tag = db.prepare('SELECT * FROM tags WHERE uid = ?').get(req.params.uid);
  if (!tag) return res.status(404).json({ error: 'tag_not_found' });
  if (!tag.account_id || tag.state !== 'active') {
    return res.status(404).json({ error: 'tag_unlinked' });
  }
  res.json(accountView(tag.account_id));
});

// ---- Blocklist ----
app.post('/tags/:uid/block', (req, res) => {
  const { uid } = req.params;
  const tag = db.prepare('SELECT * FROM tags WHERE uid = ?').get(uid);
  if (!tag) return res.status(404).json({ error: 'tag_not_found' });
  db.prepare('UPDATE tags SET state = ? WHERE uid = ?').run('blocked', uid);
  res.json({ uid, state: 'blocked' });
});

// ---- Cashless top-up: starts a real Peach Payments card charge. The
// balance is credited only once Peach confirms payment (see the webhook
// handler below) — never here, since the shopper hasn't paid anything yet
// at the point a checkout is merely created. ----
app.post('/accounts/:id/topup/checkout', async (req, res) => {
  const { id } = req.params;
  const { amount_cents } = req.body;
  if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
    return res.status(400).json({ error: 'invalid_amount' });
  }
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'account_not_found' });

  const topupId = `top_${crypto.randomBytes(4).toString('hex')}`;
  try {
    const checkout = await peach.createCheckout({
      amountCents: amount_cents,
      currency: 'ZAR',
      merchantTransactionId: topupId,
      shopperResultUrl: `${PUBLIC_BASE_URL}/payments/return.html?topupId=${topupId}`,
    });
    db.prepare(
      'INSERT INTO topups (id, account_id, checkout_id, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(topupId, id, checkout.checkoutId, amount_cents, 'pending', Date.now());
    res.status(201).json({ topupId, checkoutId: checkout.checkoutId, redirectUrl: checkout.redirectUrl });
  } catch (err) {
    console.error('Peach checkout creation failed:', err.details || err.message);
    res.status(502).json({ error: 'payment_provider_unavailable' });
  }
});

// ---- Poll a top-up's status — used by the payment-return page and the
// attendee app while the shopper is off completing payment on Peach. ----
app.get('/topups/:topupId', (req, res) => {
  const topup = db.prepare('SELECT * FROM topups WHERE id = ?').get(req.params.topupId);
  if (!topup) return res.status(404).json({ error: 'topup_not_found' });
  res.json({ id: topup.id, status: topup.status, amountCents: topup.amount_cents });
});

// ---- Peach Payments webhook: the authoritative confirmation of payment.
// Verifies the HMAC signature before trusting anything in the body, and
// credits the account exactly once (idempotent on topup.status). ----
app.post('/webhooks/peach', async (req, res) => {
  const timestamp = req.get('x-webhook-timestamp');
  const signature = req.get('x-webhook-signature');
  const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';

  if (!peach.verifyWebhookSignature({ timestamp, signature, rawBody })) {
    return res.status(401).json({ error: 'invalid_signature' });
  }

  const payload = req.body;
  const topupId = payload.merchantTransactionId;
  const resultCode = payload.result && payload.result.code;

  const topup = db.prepare('SELECT * FROM topups WHERE id = ?').get(topupId);
  if (!topup) {
    console.warn('Peach webhook for unknown topup id:', topupId);
    return res.status(200).json({ received: true });
  }
  if (topup.status !== 'pending') {
    return res.status(200).json({ received: true }); // already settled — idempotent
  }

  if (peach.isSuccessResultCode(resultCode)) {
    db.prepare('UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?').run(
      topup.amount_cents,
      topup.account_id
    );
    db.prepare('INSERT INTO cash_events (account_id, type, amount_cents, ts) VALUES (?, ?, ?, ?)').run(
      topup.account_id,
      'load',
      topup.amount_cents,
      Date.now()
    );
    db.prepare("UPDATE topups SET status = 'completed', completed_at = ? WHERE id = ?").run(Date.now(), topup.id);
  } else {
    db.prepare("UPDATE topups SET status = 'failed' WHERE id = ?").run(topup.id);
  }

  res.status(200).json({ received: true });
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

const DRINK_TYPES = ['BEERS', 'CIDERS', 'SPIRITS'];
const DRINK_MAX_COLUMNS = { BEERS: 'beers_max', CIDERS: 'ciders_max', SPIRITS: 'spirits_max' };
const DEFAULT_DRINK_MAX = 3;

function barTabEventView(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    maxByDrink: { BEERS: row.beers_max, CIDERS: row.ciders_max, SPIRITS: row.spirits_max },
    createdAt: row.created_at,
  };
}

// ---- Create a Bar Tab Event — step 1 of the Client kiosk's "Create Bar Tab
// Event" flow: just a name, to get an id to configure drink maxes against
// next. Starts with the default cap of 3 per drink type. ----
app.post('/bar-tab-events', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name_required' });
  }
  const id = `bte_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(
    'INSERT INTO bar_tab_events (id, name, beers_max, ciders_max, spirits_max, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name.trim(), DEFAULT_DRINK_MAX, DEFAULT_DRINK_MAX, DEFAULT_DRINK_MAX, Date.now());
  res.status(201).json(barTabEventView(db.prepare('SELECT * FROM bar_tab_events WHERE id = ?').get(id)));
});

// ---- Step 2 — set the per-drink-type serving cap. This is the "final save"
// that unlocks the event's QR code on the Client kiosk. ----
app.patch('/bar-tab-events/:id', (req, res) => {
  const { id } = req.params;
  const { beersMax, cidersMax, spiritsMax } = req.body;
  const existing = db.prepare('SELECT * FROM bar_tab_events WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'bar_tab_event_not_found' });

  for (const value of [beersMax, cidersMax, spiritsMax]) {
    if (!Number.isInteger(value) || value < 1) {
      return res.status(400).json({ error: 'invalid_max' });
    }
  }
  db.prepare('UPDATE bar_tab_events SET beers_max = ?, ciders_max = ?, spirits_max = ? WHERE id = ?').run(
    beersMax,
    cidersMax,
    spiritsMax,
    id
  );
  res.json(barTabEventView(db.prepare('SELECT * FROM bar_tab_events WHERE id = ?').get(id)));
});

// ---- List Bar Tab Events so staff can reopen one instead of recreating it
// every shift ----
app.get('/bar-tab-events', (req, res) => {
  const rows = db.prepare('SELECT * FROM bar_tab_events ORDER BY created_at DESC').all();
  res.json(rows.map(barTabEventView));
});

// ---- Fetch one — used by the Client kiosk (resuming a bar tab event) and
// the attendee app's read-only bar tab menu (reached via the QR code) ----
app.get('/bar-tab-events/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM bar_tab_events WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'bar_tab_event_not_found' });
  res.json(barTabEventView(row));
});

function drinkTabView(accountId, barTabEventId) {
  const rows = db
    .prepare('SELECT drink_type, COUNT(*) AS count FROM drink_orders WHERE account_id = ? AND bar_tab_event_id = ? GROUP BY drink_type')
    .all(accountId, barTabEventId);
  const counts = { BEERS: 0, CIDERS: 0, SPIRITS: 0 };
  rows.forEach((r) => { counts[r.drink_type] = r.count; });
  const total = counts.BEERS + counts.CIDERS + counts.SPIRITS;
  const event = db.prepare('SELECT * FROM bar_tab_events WHERE id = ?').get(barTabEventId);
  const maxByDrink = event
    ? { BEERS: event.beers_max, CIDERS: event.ciders_max, SPIRITS: event.spirits_max }
    : { BEERS: DEFAULT_DRINK_MAX, CIDERS: DEFAULT_DRINK_MAX, SPIRITS: DEFAULT_DRINK_MAX };
  return { accountId, barTabEventId, counts, total, maxByDrink };
}

// ---- Bar tab: look up a patron's running drink count at a specific bar tab
// event (each bar tab event has its own allowance) ----
app.get('/accounts/:id/drinks', (req, res) => {
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'account_not_found' });
  const barTabEventId = req.query.barTabEventId;
  const event = barTabEventId && db.prepare('SELECT id FROM bar_tab_events WHERE id = ?').get(barTabEventId);
  if (!event) return res.status(404).json({ error: 'bar_tab_event_not_found' });
  res.json(drinkTabView(req.params.id, barTabEventId));
});

// ---- Bar tab: log one drink against a patron's tab at a specific bar tab
// event, capped at that event's configured max for the drink type ----
app.post('/accounts/:id/drinks', (req, res) => {
  const { id } = req.params;
  const { drink_type, bar_tab_event_id } = req.body;
  if (!DRINK_TYPES.includes(drink_type)) {
    return res.status(400).json({ error: 'invalid_drink_type' });
  }
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'account_not_found' });

  const event = db.prepare('SELECT * FROM bar_tab_events WHERE id = ?').get(bar_tab_event_id);
  if (!event) return res.status(404).json({ error: 'bar_tab_event_not_found' });

  const max = event[DRINK_MAX_COLUMNS[drink_type]];
  const { count } = db
    .prepare('SELECT COUNT(*) AS count FROM drink_orders WHERE account_id = ? AND drink_type = ? AND bar_tab_event_id = ?')
    .get(id, drink_type, bar_tab_event_id);
  if (count >= max) {
    return res.status(400).json({ error: 'drink_limit_reached' });
  }

  db.prepare('INSERT INTO drink_orders (account_id, drink_type, bar_tab_event_id, ts) VALUES (?, ?, ?, ?)').run(
    id,
    drink_type,
    bar_tab_event_id,
    Date.now()
  );
  res.status(201).json(drinkTabView(id, bar_tab_event_id));
});

function hostView(host) {
  return { id: host.id, name: host.name, email: host.email, status: host.status };
}

// Whichever host approves other hosts' signups must themselves be approved.
function requireApprovedHost(approverId) {
  if (!approverId) return null;
  const approver = db.prepare('SELECT * FROM hosts WHERE id = ?').get(approverId);
  return approver && approver.status === 'approved' ? approver : null;
}

// ---- Host account signup (gates the Client kiosk's admin tabs). The very
// first host ever created is auto-approved (so there's someone able to
// approve everyone after); every host after that starts 'pending' until an
// approved host approves them from the Client app's Approvals tab. ----
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

  const isFirstHost = db.prepare('SELECT COUNT(*) AS c FROM hosts').get().c === 0;
  const id = `host_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare('INSERT INTO hosts (id, name, email, password_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    name.trim(),
    normalizedEmail,
    hashPassword(password),
    isFirstHost ? 'approved' : 'pending',
    Date.now()
  );
  res.status(201).json(hostView({ id, name: name.trim(), email: normalizedEmail, status: isFirstHost ? 'approved' : 'pending' }));
});

// ---- Host login ----
app.post('/hosts/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });

  const host = db.prepare('SELECT * FROM hosts WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!host || !verifyPassword(password, host.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  if (host.status !== 'approved') {
    return res.status(403).json({ error: 'pending_approval' });
  }
  res.json(hostView(host));
});

// ---- Pending host requests (visible to already-approved hosts only) ----
app.get('/hosts/pending', (req, res) => {
  if (!requireApprovedHost(req.query.approverId)) {
    return res.status(403).json({ error: 'not_authorized' });
  }
  const rows = db.prepare("SELECT * FROM hosts WHERE status = 'pending' ORDER BY created_at ASC").all();
  res.json(rows.map(hostView));
});

app.post('/hosts/:id/approve', (req, res) => {
  if (!requireApprovedHost(req.body.approverId)) {
    return res.status(403).json({ error: 'not_authorized' });
  }
  const host = db.prepare('SELECT * FROM hosts WHERE id = ?').get(req.params.id);
  if (!host) return res.status(404).json({ error: 'host_not_found' });
  db.prepare("UPDATE hosts SET status = 'approved' WHERE id = ?").run(req.params.id);
  res.json(hostView({ ...host, status: 'approved' }));
});

app.post('/hosts/:id/reject', (req, res) => {
  if (!requireApprovedHost(req.body.approverId)) {
    return res.status(403).json({ error: 'not_authorized' });
  }
  const host = db.prepare('SELECT * FROM hosts WHERE id = ?').get(req.params.id);
  if (!host) return res.status(404).json({ error: 'host_not_found' });
  db.prepare('DELETE FROM hosts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Fixed option sets offered when creating an event, matching the Client
// kiosk's chip pickers (mirrors the Bar Tab's fixed BEERS/CIDERS/SPIRITS
// pattern) rather than free text. Prices are fixed platform-wide (not
// per-event) — keep these numbers in sync with the matching constants in
// gate-reader/src/panels/CreateEventPanel.jsx and
// app/src/screens/CreateAccountScreen.jsx.
const EVENT_ADD_ON_OPTIONS = ['COOLER', 'PARKING'];
const TIER_PRICES_CENTS = { GA: 25000, VIP: 40000, VVIP: 80000 };
const ADD_ON_PRICES_CENTS = { COOLER: 10000, PARKING: 5000 };

// ---- Create event (organizer/admin) ----
app.post('/events', (req, res) => {
  const { name, startDate, endDate, location, tiers, zones, addOns } = req.body;
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
  const eventAddOns = Array.isArray(addOns) ? addOns.filter((a) => EVENT_ADD_ON_OPTIONS.includes(a)) : [];

  const id = `evt_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(
    'INSERT INTO events (id, name, start_date, end_date, location, tiers, zones, addons, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    name.trim(),
    startDate,
    endDate,
    location || null,
    JSON.stringify(tiers),
    JSON.stringify(zones),
    JSON.stringify(eventAddOns),
    Date.now()
  );

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
  const { holder, email, password, eventId, tier, zones, addOns } = req.body;
  if (!holder || typeof holder !== 'string' || !holder.trim()) {
    return res.status(400).json({ error: 'holder_required' });
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'valid_email_required' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'password_too_short' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(normalizedEmail);
  if (existing) return res.status(409).json({ error: 'email_already_registered' });

  let event = null;
  if (eventId) {
    event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) return res.status(404).json({ error: 'event_not_found' });
    if (!tier || !JSON.parse(event.tiers).includes(tier)) {
      return res.status(400).json({ error: 'invalid_tier' });
    }
  }

  const id = `acc_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare('INSERT INTO accounts (id, holder, email, password_hash, balance_cents) VALUES (?, ?, ?, ?, ?)').run(
    id,
    holder.trim(),
    normalizedEmail,
    hashPassword(password),
    0
  );

  if (event) {
    const ticketZones = Array.isArray(zones) && zones.length ? zones : JSON.parse(event.zones);
    const availableAddOns = JSON.parse(event.addons || '[]');
    const ticketAddOns = Array.isArray(addOns) ? addOns.filter((a) => availableAddOns.includes(a)) : [];
    const priceCents =
      (TIER_PRICES_CENTS[tier] || 0) + ticketAddOns.reduce((sum, a) => sum + (ADD_ON_PRICES_CENTS[a] || 0), 0);
    const ticketId = `tkt_${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(
      'INSERT INTO tickets (id, account_id, event_id, tier, zones, addons, price_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(ticketId, id, event.id, tier, JSON.stringify(ticketZones), JSON.stringify(ticketAddOns), priceCents, 'active');
  }

  res.status(201).json(accountView(id));
});

// ---- Attendee login ----
app.post('/accounts/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });

  const account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!account || !account.password_hash || !verifyPassword(password, account.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  res.json(accountView(account.id));
});

// ---- Staff lookup by email — used when pre-linking a wristband QR code to
// an attendee's account ahead of the event (registered before /accounts/:id
// so "lookup" is never matched as an :id). ----
app.get('/accounts/lookup', (req, res) => {
  const email = req.query.email;
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'valid_email_required' });
  const account = db.prepare('SELECT id FROM accounts WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!account) return res.status(404).json({ error: 'account_not_found' });
  res.json(accountView(account.id));
});

// ---- Wallet view for the attendee app ----
app.get('/accounts/:id', (req, res) => {
  const view = accountView(req.params.id);
  if (!view) return res.status(404).json({ error: 'account_not_found' });
  res.json(view);
});

// ---- Buy/assign a ticket for an existing account, e.g. from Browse Other
// Events — replaces any previous ticket, since an attendee holds one active
// event ticket at a time (mirrors ticket issuance in POST /accounts). ----
app.post('/accounts/:id/ticket', (req, res) => {
  const { id } = req.params;
  const { eventId, tier, addOns } = req.body;
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'account_not_found' });

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event_not_found' });
  if (!tier || !JSON.parse(event.tiers).includes(tier)) {
    return res.status(400).json({ error: 'invalid_tier' });
  }

  const availableAddOns = JSON.parse(event.addons || '[]');
  const ticketAddOns = Array.isArray(addOns) ? addOns.filter((a) => availableAddOns.includes(a)) : [];
  const priceCents =
    (TIER_PRICES_CENTS[tier] || 0) + ticketAddOns.reduce((sum, a) => sum + (ADD_ON_PRICES_CENTS[a] || 0), 0);

  db.prepare('DELETE FROM tickets WHERE account_id = ?').run(id);

  const ticketId = `tkt_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(
    'INSERT INTO tickets (id, account_id, event_id, tier, zones, addons, price_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(ticketId, id, event.id, tier, event.zones, JSON.stringify(ticketAddOns), priceCents, 'active');

  res.json(accountView(id));
});

// ---- Remove the attendee's current event ticket (keeps the account and
// wallet balance intact — only the ticket record is deleted) ----
app.delete('/accounts/:id/ticket', (req, res) => {
  const { id } = req.params;
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'account_not_found' });

  const ticket = db.prepare('SELECT * FROM tickets WHERE account_id = ? ORDER BY rowid DESC LIMIT 1').get(id);
  if (!ticket) return res.status(404).json({ error: 'no_ticket' });

  db.prepare('DELETE FROM tickets WHERE id = ?').run(ticket.id);
  res.json(accountView(id));
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
