const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { validateScan } = require('./validate');
const { GATES } = require('./gates');
const { sign, hashPassword, verifyPassword } = require('./crypto');
const ozow = require('./ozowPayments');
const mailer = require('./mailer');
const QRCode = require('qrcode');

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://thrupass.co.za';

const app = express();
app.use(cors());
// 10mb limit (not the 100kb default) to fit a base64-encoded event image in
// the same JSON body as the rest of the Create Event payload.
app.use(express.json({ limit: '10mb' }));
// Ozow's notification webhook POSTs application/x-www-form-urlencoded.
app.use(express.urlencoded({ extended: false }));

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
    prices: eventPrices(event),
    image: event.image || null,
  };
}

// A little over 3MB of raw image data once base64-decoded — plenty for a
// poster/banner image, small enough not to bloat the database.
const MAX_EVENT_IMAGE_BASE64_LENGTH = 4_500_000;

function sanitizeEventImage(image) {
  if (image === undefined || image === null || image === '') return { value: null };
  if (typeof image !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(image)) {
    return { error: true };
  }
  if (image.length > MAX_EVENT_IMAGE_BASE64_LENGTH) return { error: true };
  return { value: image };
}

function accountView(accountId) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) return null;
  const ticket = db
    .prepare('SELECT * FROM tickets WHERE account_id = ? ORDER BY rowid DESC LIMIT 1')
    .get(accountId);
  const tag = db.prepare("SELECT * FROM tags WHERE account_id = ? AND state = 'active' AND kind = 'wristband'").get(accountId);
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
      qrUrl: ticket.status === 'active' ? ticketQrUrl(ticket.id) : null,
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

// ---- Cashless top-up: starts a real Ozow EFT payment. The balance is
// credited only once Ozow confirms payment (see the webhook handler
// below) — never here, since the shopper hasn't paid anything yet at the
// point a checkout is merely created. ----
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
    const checkout = await ozow.createCheckout({
      amountCents: amount_cents,
      currency: 'ZAR',
      externalReference: topupId,
      shopperResultUrl: `${PUBLIC_BASE_URL}/payments/return.html?topupId=${topupId}`,
    });
    db.prepare(
      'INSERT INTO topups (id, account_id, checkout_id, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(topupId, id, checkout.checkoutId, amount_cents, 'pending', Date.now());
    res.status(201).json({ topupId, checkoutId: checkout.checkoutId, redirectUrl: checkout.redirectUrl });
  } catch (err) {
    console.error('Ozow checkout creation failed:', err.details || err.message);
    res.status(502).json({ error: 'payment_provider_unavailable' });
  }
});

// Applies a settled (non-pending) Ozow status to a topup — shared by the
// webhook handler and the poll-status endpoint below, both of which reach
// the same conclusion via the same authoritative Ozow status check.
function settleTopup(topup, success) {
  if (topup.status !== 'pending') return; // already settled — idempotent
  if (success) {
    db.prepare('UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?').run(topup.amount_cents, topup.account_id);
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
}

// ---- Poll a top-up's status — used by the payment-return page and the
// attendee app while the shopper is off completing payment on Ozow. Also
// proactively reconciles with Ozow's own status if still pending locally,
// so this works even if the webhook hasn't landed yet. ----
app.get('/topups/:topupId', async (req, res) => {
  let topup = db.prepare('SELECT * FROM topups WHERE id = ?').get(req.params.topupId);
  if (!topup) return res.status(404).json({ error: 'topup_not_found' });

  if (topup.status === 'pending') {
    try {
      const statusData = await ozow.getCheckoutStatus(topup.checkout_id);
      if (ozow.isTerminalStatus(statusData.status)) {
        settleTopup(topup, ozow.isSuccessStatus(statusData.status));
        topup = db.prepare('SELECT * FROM topups WHERE id = ?').get(req.params.topupId);
      }
    } catch (err) {
      console.error('Ozow status check failed while polling topup:', err.details || err.message);
    }
  }

  res.json({ id: topup.id, status: topup.status, amountCents: topup.amount_cents });
});

// Applies a settled (non-pending) Ozow status to a ticket checkout —
// shared by the webhook handler and the poll-status endpoint below.
function settleTicketCheckout(checkout, success) {
  if (checkout.status !== 'pending') return; // already settled — idempotent
  if (success) {
    // The ticket already exists as a reservation from Reserve Ticket — just
    // mark it paid rather than replacing it, so its id is stable across the
    // reserve → pay flow.
    const reserved = db
      .prepare("SELECT * FROM tickets WHERE account_id = ? AND status = 'reserved'")
      .get(checkout.account_id);
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(checkout.event_id);
    if (reserved && reserved.event_id === checkout.event_id && reserved.tier === checkout.tier) {
      db.prepare("UPDATE tickets SET status = 'active' WHERE id = ?").run(reserved.id);
      activateTicketQr(reserved.id, checkout.account_id, event, checkout.tier);
    } else {
      issueTicket(checkout.account_id, event, checkout.tier, JSON.parse(checkout.addons || '[]'), checkout.amount_cents, 'active');
    }
    db.prepare("UPDATE ticket_checkouts SET status = 'completed', completed_at = ? WHERE id = ?").run(Date.now(), checkout.id);
  } else {
    db.prepare("UPDATE ticket_checkouts SET status = 'failed' WHERE id = ?").run(checkout.id);
  }
}

// ---- Ozow notification webhook (sent to the notifyUrl we pass on every
// PostPaymentRequest — no dashboard registration needed): a "go check now"
// signal, not an authoritative payload in itself — after verifying the
// SHA512 hash, it looks up which of our own checkout ids (top_/tco_ prefix)
// the notification refers to, then always re-confirms via Ozow's own
// GetTransactionByReference API before crediting anything. Handles both
// top-ups (credits the balance) and ticket checkouts (issues the ticket) —
// idempotent on each record's own status. ----
app.post('/webhooks/ozow', async (req, res) => {
  if (!ozow.verifyWebhookSignature({ body: req.body })) {
    return res.status(401).json({ error: 'invalid_signature' });
  }

  const externalReference = ozow.extractExternalReference(req.body);
  if (!externalReference) {
    console.warn('Ozow webhook with no recognizable merchantReference');
    return res.status(200).json({ received: true });
  }

  if (externalReference.startsWith('tco_')) {
    const checkout = db.prepare('SELECT * FROM ticket_checkouts WHERE id = ?').get(externalReference);
    if (!checkout) {
      console.warn('Ozow webhook for unknown ticket checkout id:', externalReference);
      return res.status(200).json({ received: true });
    }
    if (checkout.status === 'pending') {
      try {
        const statusData = await ozow.getCheckoutStatus(checkout.checkout_id);
        if (ozow.isTerminalStatus(statusData.status)) {
          settleTicketCheckout(checkout, ozow.isSuccessStatus(statusData.status));
        }
      } catch (err) {
        console.error('Ozow status check failed while settling ticket checkout:', err.details || err.message);
      }
    }
    return res.status(200).json({ received: true });
  }

  const topup = db.prepare('SELECT * FROM topups WHERE id = ?').get(externalReference);
  if (!topup) {
    console.warn('Ozow webhook for unknown topup id:', externalReference);
    return res.status(200).json({ received: true });
  }
  if (topup.status === 'pending') {
    try {
      const statusData = await ozow.getCheckoutStatus(topup.checkout_id);
      if (ozow.isTerminalStatus(statusData.status)) {
        settleTopup(topup, ozow.isSuccessStatus(statusData.status));
      }
    } catch (err) {
      console.error('Ozow status check failed while settling topup:', err.details || err.message);
    }
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

function barTabQrUrl(barTabEventId, accountId) {
  return `${PUBLIC_BASE_URL}/bt/${barTabEventId}/${accountId}`;
}

// Each attendee gets a unique QR tying them to their specific Bar Tab Event
// RSVP — same "virtual tag" trick as the ticket QR (its content is the
// attendee's own bar-tab info-page URL, stored as a row in the shared `tags`
// table with kind = 'bar_tab_qr'), so bar staff scan it through the exact
// same wristband-scanner flow already wired up in the Client kiosk, no
// changes needed there. Idempotent — safe to call every time the attendee
// reopens their Bar Tab Menu, which also re-activates it if a later wristband
// link retired it.
function issueBarTabQrTag(barTabEventId, accountId) {
  const uid = barTabQrUrl(barTabEventId, accountId);
  const existing = db.prepare('SELECT * FROM tags WHERE uid = ?').get(uid);
  if (existing) {
    db.prepare("UPDATE tags SET account_id = ?, state = 'active' WHERE uid = ?").run(accountId, uid);
  } else {
    db.prepare("INSERT INTO tags (uid, account_id, state, kind) VALUES (?, ?, 'active', 'bar_tab_qr')").run(uid, accountId);
  }
  return uid;
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

// ---- Log an attendee as identified for this Bar Tab Event — called by the
// app when it opens the bar tab menu (whether they just registered, logged
// in, or already had a session), so staff get a guest list. Deduped per
// account per event via the UNIQUE constraint. ----
app.post('/bar-tab-events/:id/rsvp', (req, res) => {
  const { id } = req.params;
  const { account_id } = req.body;
  const event = db.prepare('SELECT id FROM bar_tab_events WHERE id = ?').get(id);
  if (!event) return res.status(404).json({ error: 'bar_tab_event_not_found' });
  const account = db.prepare('SELECT holder FROM accounts WHERE id = ?').get(account_id);
  if (!account) return res.status(404).json({ error: 'account_not_found' });

  db.prepare(
    'INSERT OR IGNORE INTO bar_tab_rsvps (bar_tab_event_id, account_id, holder, ts) VALUES (?, ?, ?, ?)'
  ).run(id, account_id, account.holder, Date.now());

  const qrUrl = issueBarTabQrTag(id, account_id);
  res.status(201).json({ ok: true, holder: account.holder, qrUrl });
});

// ---- Guest list for staff — everyone who has been identified against this
// Bar Tab Event ----
app.get('/bar-tab-events/:id/rsvps', (req, res) => {
  const rows = db
    .prepare('SELECT holder, ts FROM bar_tab_rsvps WHERE bar_tab_event_id = ? ORDER BY ts DESC')
    .all(req.params.id);
  res.json(rows.map((r) => ({ holder: r.holder, ts: r.ts })));
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

function vendorView(vendor) {
  if (!vendor) return null;
  const items = db.prepare('SELECT * FROM vendor_items WHERE vendor_id = ? ORDER BY rowid ASC').all(vendor.id);
  return {
    id: vendor.id,
    name: vendor.name,
    commissionPct: vendor.commission_pct,
    bankingFeePct: vendor.banking_fee_pct,
    createdAt: vendor.created_at,
    items: items.map((i) => ({ id: i.id, name: i.name, priceCents: i.price_cents, active: !!i.active })),
  };
}

function getPlatformPricing() {
  return db.prepare('SELECT * FROM platform_pricing WHERE id = ?').get('default');
}

// ---- Create a vendor/stall — starts with an empty menu, seeded with Thru
// Pass's current platform commission/banking-fee rates (editable per-vendor
// afterwards from the vendor's own settlement settings). Same "give it a
// name, configure it next" pattern as Bar Tab Events. ----
app.post('/vendors', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name_required' });
  }
  const pricing = getPlatformPricing();
  const id = `vnd_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare('INSERT INTO vendors (id, name, commission_pct, banking_fee_pct, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    name.trim(),
    pricing.vendor_commission_pct,
    pricing.vendor_banking_fee_pct,
    Date.now()
  );
  res.status(201).json(vendorView(db.prepare('SELECT * FROM vendors WHERE id = ?').get(id)));
});

// ---- List vendors so staff can resume one instead of recreating it ----
app.get('/vendors', (req, res) => {
  const rows = db.prepare('SELECT * FROM vendors ORDER BY created_at DESC').all();
  res.json(rows.map(vendorView));
});

app.get('/vendors/:id', (req, res) => {
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'vendor_not_found' });
  res.json(vendorView(vendor));
});

// ---- Settlement config — Thru Pass's commission/banking-fee cut, deducted
// from this vendor's gross sales at settlement time. Seeded from the
// platform-wide Pricing tab at vendor creation; overridable per-vendor
// here if a particular vendor negotiates a different rate. ----
app.patch('/vendors/:id', (req, res) => {
  const { commissionPct, bankingFeePct } = req.body;
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'vendor_not_found' });

  if (commissionPct !== undefined && (typeof commissionPct !== 'number' || commissionPct < 0 || commissionPct > 100)) {
    return res.status(400).json({ error: 'invalid_commission' });
  }
  if (bankingFeePct !== undefined && (typeof bankingFeePct !== 'number' || bankingFeePct < 0 || bankingFeePct > 100)) {
    return res.status(400).json({ error: 'invalid_banking_fee' });
  }
  db.prepare('UPDATE vendors SET commission_pct = ?, banking_fee_pct = ? WHERE id = ?').run(
    commissionPct !== undefined ? commissionPct : vendor.commission_pct,
    bankingFeePct !== undefined ? bankingFeePct : vendor.banking_fee_pct,
    req.params.id
  );
  res.json(vendorView(db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id)));
});

app.post('/vendors/:id/items', (req, res) => {
  const { name, priceCents } = req.body;
  const vendor = db.prepare('SELECT id FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'vendor_not_found' });
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name_required' });
  }
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    return res.status(400).json({ error: 'invalid_price' });
  }
  const itemId = `item_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare('INSERT INTO vendor_items (id, vendor_id, name, price_cents, active) VALUES (?, ?, ?, ?, 1)').run(
    itemId,
    req.params.id,
    name.trim(),
    priceCents
  );
  res.status(201).json(vendorView(db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id)));
});

app.patch('/vendors/:id/items/:itemId', (req, res) => {
  const { name, priceCents, active } = req.body;
  const item = db.prepare('SELECT * FROM vendor_items WHERE id = ? AND vendor_id = ?').get(req.params.itemId, req.params.id);
  if (!item) return res.status(404).json({ error: 'item_not_found' });

  if (priceCents !== undefined && (!Number.isInteger(priceCents) || priceCents <= 0)) {
    return res.status(400).json({ error: 'invalid_price' });
  }
  db.prepare('UPDATE vendor_items SET name = ?, price_cents = ?, active = ? WHERE id = ?').run(
    name !== undefined && name.trim() ? name.trim() : item.name,
    priceCents !== undefined ? priceCents : item.price_cents,
    active !== undefined ? (active ? 1 : 0) : item.active,
    req.params.itemId
  );
  res.json(vendorView(db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id)));
});

app.delete('/vendors/:id/items/:itemId', (req, res) => {
  const item = db.prepare('SELECT * FROM vendor_items WHERE id = ? AND vendor_id = ?').get(req.params.itemId, req.params.id);
  if (!item) return res.status(404).json({ error: 'item_not_found' });
  db.prepare('DELETE FROM vendor_items WHERE id = ?').run(req.params.itemId);
  res.json(vendorView(db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id)));
});

// ---- The actual POS tap: staff scans/taps an attendee's wristband, builds
// a cart from this vendor's menu, and this deducts the total from the
// attendee's Thru Balance in one atomic step — mirrors /accounts/:id/cashout
// (balance check, debit, cash_events log) but against a vendor's itemized
// cart instead of a flat amount, and additionally logs one vendor_sales row
// per line item for the real-time sales/settlement view. ----
app.post('/vendors/:id/sale', (req, res) => {
  const { uid, cart, cashierName } = req.body;
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'vendor_not_found' });

  if (!Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: 'empty_cart' });
  }

  const tag = db.prepare('SELECT * FROM tags WHERE uid = ?').get(uid);
  if (!tag) return res.status(404).json({ error: 'tag_not_found' });
  if (!tag.account_id || tag.state !== 'active') {
    return res.status(404).json({ error: 'tag_unlinked' });
  }
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(tag.account_id);
  if (!account) return res.status(404).json({ error: 'account_not_found' });

  const lines = [];
  let total = 0;
  for (const line of cart) {
    const qty = Number.isInteger(line.qty) && line.qty > 0 ? line.qty : 1;
    const item = db.prepare('SELECT * FROM vendor_items WHERE id = ? AND vendor_id = ?').get(line.itemId, req.params.id);
    if (!item || !item.active) {
      return res.status(400).json({ error: 'invalid_item' });
    }
    total += item.price_cents * qty;
    lines.push({ item, qty });
  }

  if (total > account.balance_cents) {
    return res.status(400).json({ error: 'insufficient_balance' });
  }

  const ts = Date.now();
  db.prepare('UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?').run(total, account.id);
  db.prepare('INSERT INTO cash_events (account_id, type, amount_cents, ts) VALUES (?, ?, ?, ?)').run(
    account.id,
    'vendor_purchase',
    total,
    ts
  );
  for (const { item, qty } of lines) {
    db.prepare(
      'INSERT INTO vendor_sales (vendor_id, item_id, item_name, price_cents, qty, account_id, cashier_name, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.params.id, item.id, item.name, item.price_cents, qty, account.id, cashierName || null, ts);
  }

  const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id);
  res.status(201).json({
    holder: account.holder,
    balanceCents: updated.balance_cents,
    totalCents: total,
    receipt: lines.map(({ item, qty }) => ({ name: item.name, priceCents: item.price_cents, qty })),
  });
});

// ---- Recent itemized sales for a vendor (their own visibility, and the
// organizer's live per-vendor view) ----
app.get('/vendors/:id/sales', (req, res) => {
  const vendor = db.prepare('SELECT id FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'vendor_not_found' });
  const rows = db.prepare('SELECT * FROM vendor_sales WHERE vendor_id = ? ORDER BY ts DESC LIMIT 50').all(req.params.id);
  res.json(
    rows.map((r) => ({
      itemName: r.item_name,
      priceCents: r.price_cents,
      qty: r.qty,
      cashierName: r.cashier_name,
      ts: r.ts,
    }))
  );
});

// ---- Settlement summary — gross sales (itemized), Thru Pass's commission %
// + banking fee % (both percentages, mirroring Howler's own fee structure),
// and the resulting net payout. Purely a report to work from — actually
// paying the vendor is still a manual step, same as the existing Cash
// payout tab doesn't move real money either. ----
app.get('/vendors/:id/summary', (req, res) => {
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'vendor_not_found' });

  const rows = db.prepare('SELECT * FROM vendor_sales WHERE vendor_id = ?').all(req.params.id);
  const byItem = {};
  let grossCents = 0;
  let salesCount = 0;
  for (const r of rows) {
    grossCents += r.price_cents * r.qty;
    salesCount += r.qty;
    if (!byItem[r.item_name]) byItem[r.item_name] = { name: r.item_name, qty: 0, grossCents: 0 };
    byItem[r.item_name].qty += r.qty;
    byItem[r.item_name].grossCents += r.price_cents * r.qty;
  }
  const commissionCents = Math.round((grossCents * vendor.commission_pct) / 100);
  const bankingFeeCents = Math.round((grossCents * vendor.banking_fee_pct) / 100);
  const netCents = Math.max(0, grossCents - commissionCents - bankingFeeCents);

  res.json({
    vendorId: vendor.id,
    vendorName: vendor.name,
    grossCents,
    salesCount,
    commissionPct: vendor.commission_pct,
    commissionCents,
    bankingFeePct: vendor.banking_fee_pct,
    bankingFeeCents,
    netCents,
    byItem: Object.values(byItem).sort((a, b) => b.grossCents - a.grossCents),
  });
});

function pricingView(row) {
  return {
    ticketCommissionPct: row.ticket_commission_pct,
    ticketBankingFeePct: row.ticket_banking_fee_pct,
    ticketMinFeeCents: row.ticket_min_fee_cents,
    vendorCommissionPct: row.vendor_commission_pct,
    vendorBankingFeePct: row.vendor_banking_fee_pct,
    updatedAt: row.updated_at,
  };
}

// ---- Thru Pass's own platform fee schedule — read/edit from the Client
// kiosk's Pricing tab. New vendors are seeded from the vendor_* rates at
// creation time (see POST /vendors); ticket-side fees are computed on
// demand (see /pricing/ticket-revenue) rather than charged at checkout. ----
app.get('/pricing', (req, res) => {
  res.json(pricingView(getPlatformPricing()));
});

app.patch('/pricing', (req, res) => {
  const current = getPlatformPricing();
  const { ticketCommissionPct, ticketBankingFeePct, ticketMinFeeCents, vendorCommissionPct, vendorBankingFeePct } = req.body;

  const percentages = { ticketCommissionPct, ticketBankingFeePct, vendorCommissionPct, vendorBankingFeePct };
  for (const value of Object.values(percentages)) {
    if (value !== undefined && (typeof value !== 'number' || value < 0 || value > 100)) {
      return res.status(400).json({ error: 'invalid_percentage' });
    }
  }
  if (ticketMinFeeCents !== undefined && (!Number.isInteger(ticketMinFeeCents) || ticketMinFeeCents < 0)) {
    return res.status(400).json({ error: 'invalid_min_fee' });
  }

  db.prepare(
    `UPDATE platform_pricing SET
       ticket_commission_pct = ?, ticket_banking_fee_pct = ?, ticket_min_fee_cents = ?,
       vendor_commission_pct = ?, vendor_banking_fee_pct = ?, updated_at = ?
     WHERE id = 'default'`
  ).run(
    ticketCommissionPct !== undefined ? ticketCommissionPct : current.ticket_commission_pct,
    ticketBankingFeePct !== undefined ? ticketBankingFeePct : current.ticket_banking_fee_pct,
    ticketMinFeeCents !== undefined ? ticketMinFeeCents : current.ticket_min_fee_cents,
    vendorCommissionPct !== undefined ? vendorCommissionPct : current.vendor_commission_pct,
    vendorBankingFeePct !== undefined ? vendorBankingFeePct : current.vendor_banking_fee_pct,
    Date.now()
  );
  res.json(pricingView(getPlatformPricing()));
});

// ---- Estimated platform revenue across all ticket sales to date, computed
// from the current Pricing tab rates. Informational only — tickets aren't
// actually charged this fee at checkout today, so this is what Thru Pass
// would be owed under the current fee schedule, same "report, not a real
// transfer" model the vendor settlement summary uses. ----
app.get('/pricing/ticket-revenue', (req, res) => {
  const pricing = getPlatformPricing();
  const tickets = db.prepare("SELECT price_cents FROM tickets WHERE status = 'active'").all();

  let grossCents = 0;
  let paidCount = 0;
  let freeCount = 0;
  for (const t of tickets) {
    if (t.price_cents > 0) {
      grossCents += t.price_cents;
      paidCount += 1;
    } else {
      freeCount += 1;
    }
  }
  const commissionCents = Math.round((grossCents * pricing.ticket_commission_pct) / 100);
  const bankingFeeCents = Math.round((grossCents * pricing.ticket_banking_fee_pct) / 100);
  const freeTicketFeesCents = freeCount * pricing.ticket_min_fee_cents;

  res.json({
    grossCents,
    paidCount,
    freeCount,
    commissionCents,
    bankingFeeCents,
    freeTicketFeesCents,
    totalRevenueCents: commissionCents + bankingFeeCents + freeTicketFeesCents,
  });
});

function hostView(host) {
  return {
    id: host.id,
    name: host.name,
    email: host.email,
    status: host.status,
    isAdmin: !!host.is_admin,
    organisation: host.organisation || '',
    position: host.position || '',
    address: host.address || '',
  };
}

// Used for actions any approved host may do (e.g. the wristband-linking
// lookup) — just needs to be logged in and approved, admin or not.
function requireApprovedHost(approverId) {
  if (!approverId) return null;
  const approver = db.prepare('SELECT * FROM hosts WHERE id = ?').get(approverId);
  return approver && approver.status === 'approved' ? approver : null;
}

// Only the site admin can approve/reject other hosts' signups — stricter
// than requireApprovedHost above, which any approved host satisfies.
function requireAdminHost(approverId) {
  const approver = requireApprovedHost(approverId);
  return approver && approver.is_admin ? approver : null;
}

// ---- Host account signup (gates the Client kiosk's admin tabs). The very
// first host ever created is auto-approved (so there's someone able to
// approve everyone after); every host after that starts 'pending' until an
// approved host approves them from the Client app's Approvals tab. ----
app.post('/hosts', (req, res) => {
  const { name, email, password, organisation, position, address } = req.body;
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
  const orgValue = typeof organisation === 'string' ? organisation.trim() : '';
  const positionValue = typeof position === 'string' ? position.trim() : '';
  const addressValue = typeof address === 'string' ? address.trim() : '';
  const id = `host_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(
    'INSERT INTO hosts (id, name, email, password_hash, status, is_admin, organisation, position, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    name.trim(),
    normalizedEmail,
    hashPassword(password),
    isFirstHost ? 'approved' : 'pending',
    isFirstHost ? 1 : 0,
    orgValue,
    positionValue,
    addressValue,
    Date.now()
  );
  mailer.notify(
    'New Client registration — Thru Pass',
    `A new Client account has registered.\n\nName: ${name.trim()}\nEmail: ${normalizedEmail}\nOrganisation: ${orgValue || '—'}\nPosition: ${positionValue || '—'}\nAddress: ${addressValue || '—'}\nStatus: ${isFirstHost ? 'approved' : 'pending approval'}`
  );
  res.status(201).json(hostView({
    id, name: name.trim(), email: normalizedEmail, status: isFirstHost ? 'approved' : 'pending', is_admin: isFirstHost ? 1 : 0,
    organisation: orgValue, position: positionValue, address: addressValue,
  }));
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
  if (!requireAdminHost(req.query.approverId)) {
    return res.status(403).json({ error: 'not_authorized' });
  }
  const rows = db.prepare("SELECT * FROM hosts WHERE status = 'pending' ORDER BY created_at ASC").all();
  res.json(rows.map(hostView));
});

app.post('/hosts/:id/approve', (req, res) => {
  if (!requireAdminHost(req.body.approverId)) {
    return res.status(403).json({ error: 'not_authorized' });
  }
  const host = db.prepare('SELECT * FROM hosts WHERE id = ?').get(req.params.id);
  if (!host) return res.status(404).json({ error: 'host_not_found' });
  db.prepare("UPDATE hosts SET status = 'approved' WHERE id = ?").run(req.params.id);
  res.json(hostView({ ...host, status: 'approved' }));
});

app.post('/hosts/:id/reject', (req, res) => {
  if (!requireAdminHost(req.body.approverId)) {
    return res.status(403).json({ error: 'not_authorized' });
  }
  const host = db.prepare('SELECT * FROM hosts WHERE id = ?').get(req.params.id);
  if (!host) return res.status(404).json({ error: 'host_not_found' });
  db.prepare('DELETE FROM hosts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function teamMemberView(row) {
  if (!row) return null;
  const barTabEvent = row.bar_tab_event_id
    ? db.prepare('SELECT id, name FROM bar_tab_events WHERE id = ?').get(row.bar_tab_event_id)
    : null;
  return {
    id: row.id,
    hostId: row.host_id,
    name: row.name,
    role: row.role,
    active: !!row.active,
    email: row.email || '',
    claimed: !!row.password_hash,
    barTabEventId: barTabEvent ? barTabEvent.id : null,
    barTabEventName: barTabEvent ? barTabEvent.name : null,
    accessUrl: `${PUBLIC_BASE_URL}/client/?teamAccess=${row.access_token}`,
    createdAt: row.created_at,
  };
}

// ---- My Access Team — a host adds event staff here and gets back a
// shareable link that drops that person straight into a scan-only view of
// the Client kiosk (gate Reader + Bar Tab scanning), no host login needed.
// ----
app.post('/team-members', (req, res) => {
  if (!requireApprovedHost(req.body.hostId)) {
    return res.status(403).json({ error: 'not_authorized' });
  }
  const { name, role, barTabEventId } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name_required' });
  }
  if (!barTabEventId || typeof barTabEventId !== 'string') {
    return res.status(400).json({ error: 'bar_tab_event_required' });
  }
  const barTabEvent = db.prepare('SELECT id FROM bar_tab_events WHERE id = ?').get(barTabEventId);
  if (!barTabEvent) return res.status(404).json({ error: 'bar_tab_event_not_found' });

  const id = `tm_${crypto.randomBytes(4).toString('hex')}`;
  const accessToken = crypto.randomBytes(16).toString('hex');
  db.prepare(
    'INSERT INTO team_members (id, host_id, name, role, access_token, active, bar_tab_event_id, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
  ).run(id, req.body.hostId, name.trim(), (typeof role === 'string' && role.trim()) || 'Event Staff', accessToken, barTabEventId, Date.now());
  res.status(201).json(teamMemberView(db.prepare('SELECT * FROM team_members WHERE id = ?').get(id)));
});

app.get('/team-members', (req, res) => {
  if (!requireApprovedHost(req.query.hostId)) {
    return res.status(403).json({ error: 'not_authorized' });
  }
  const rows = db.prepare('SELECT * FROM team_members WHERE host_id = ? ORDER BY created_at DESC').all(req.query.hostId);
  res.json(rows.map(teamMemberView));
});

// ---- Toggle a team member's access on/off — kept rather than deleted so a
// revoked member's name doesn't just vanish from the list. ----
app.patch('/team-members/:id', (req, res) => {
  if (!requireApprovedHost(req.body.hostId)) {
    return res.status(403).json({ error: 'not_authorized' });
  }
  const existing = db.prepare('SELECT * FROM team_members WHERE id = ? AND host_id = ?').get(req.params.id, req.body.hostId);
  if (!existing) return res.status(404).json({ error: 'team_member_not_found' });
  const active = typeof req.body.active === 'boolean' ? (req.body.active ? 1 : 0) : existing.active;
  db.prepare('UPDATE team_members SET active = ? WHERE id = ?').run(active, req.params.id);
  res.json(teamMemberView(db.prepare('SELECT * FROM team_members WHERE id = ?').get(req.params.id)));
});

app.delete('/team-members/:id', (req, res) => {
  if (!requireApprovedHost(req.query.hostId)) {
    return res.status(403).json({ error: 'not_authorized' });
  }
  const existing = db.prepare('SELECT * FROM team_members WHERE id = ? AND host_id = ?').get(req.params.id, req.query.hostId);
  if (!existing) return res.status(404).json({ error: 'team_member_not_found' });
  db.prepare('DELETE FROM team_members WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Public — resolves a team member's access link with no host login.
// This is what the Client kiosk calls when it loads with ?teamAccess=, to
// decide whether to show a "set up your access" (unclaimed) or "log in"
// (already claimed) form. ----
app.get('/team-members/access/:token', (req, res) => {
  const row = db.prepare('SELECT * FROM team_members WHERE access_token = ?').get(req.params.token);
  if (!row) return res.status(404).json({ error: 'invalid_link' });
  if (!row.active) return res.status(403).json({ error: 'access_revoked' });
  res.json(teamMemberView(row));
});

// ---- Claim an access link — a new team member sets their own email +
// password the first time they open their link, turning the invite into a
// real login. Only works once per link (claimed links log in instead, see
// /team-members/login below). ----
app.post('/team-members/access/:token/claim', (req, res) => {
  const row = db.prepare('SELECT * FROM team_members WHERE access_token = ?').get(req.params.token);
  if (!row) return res.status(404).json({ error: 'invalid_link' });
  if (!row.active) return res.status(403).json({ error: 'access_revoked' });
  if (row.password_hash) return res.status(409).json({ error: 'already_claimed' });

  const { email, password } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'valid_email_required' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'password_too_short' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM team_members WHERE email = ?').get(normalizedEmail);
  if (existing) return res.status(409).json({ error: 'email_already_registered' });

  db.prepare('UPDATE team_members SET email = ?, password_hash = ? WHERE id = ?').run(
    normalizedEmail, hashPassword(password), row.id
  );
  res.json(teamMemberView(db.prepare('SELECT * FROM team_members WHERE id = ?').get(row.id)));
});

// ---- Team member login — for a member who already claimed their access
// link on a previous visit (or a different device) and just needs to sign
// back in with the email/password they set. ----
app.post('/team-members/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });

  const row = db.prepare('SELECT * FROM team_members WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!row || !row.password_hash || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  if (!row.active) return res.status(403).json({ error: 'access_revoked' });
  res.json(teamMemberView(row));
});

// Fixed option sets offered when creating an event, matching the Client
// kiosk's chip pickers (mirrors the Bar Tab's fixed BEERS/CIDERS/SPIRITS
// pattern) rather than free text. The price constants are only the platform
// DEFAULTS — each event can carry its own admin-set prices (events.prices),
// and every price shown or charged goes through eventPrices() below.
const EVENT_ADD_ON_OPTIONS = ['COOLER', 'PARKING'];
const TIER_PRICES_CENTS = { GA: 25000, VIP: 40000, VVIP: 80000 };
const ADD_ON_PRICES_CENTS = { COOLER: 10000, PARKING: 5000 };
const PRICEABLE_KEYS = ['GA', 'VIP', 'VVIP', 'PARKING', 'COOLER'];

// Per-event price list: platform defaults overlaid with whatever the admin
// has manually set for this event (events.prices JSON).
function eventPrices(event) {
  let overrides = {};
  try {
    overrides = JSON.parse(event.prices || '{}');
  } catch {
    overrides = {};
  }
  return { ...TIER_PRICES_CENTS, ...ADD_ON_PRICES_CENTS, ...overrides };
}

// Keeps only known keys with valid non-negative integer cent amounts, so a
// bad payload can't wipe an event's price list.
function sanitizePrices(input) {
  const clean = {};
  if (!input || typeof input !== 'object') return clean;
  for (const key of PRICEABLE_KEYS) {
    const value = input[key];
    if (Number.isInteger(value) && value >= 0) clean[key] = value;
  }
  return clean;
}

// ---- Create event (organizer/admin) ----
app.post('/events', (req, res) => {
  const { name, startDate, endDate, location, tiers, zones, addOns, prices, image } = req.body;
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
  const sanitizedImage = sanitizeEventImage(image);
  if (sanitizedImage.error) return res.status(400).json({ error: 'invalid_image' });

  const id = `evt_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(
    'INSERT INTO events (id, name, start_date, end_date, location, tiers, zones, addons, prices, image, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    name.trim(),
    startDate,
    endDate,
    location || null,
    JSON.stringify(tiers),
    JSON.stringify(zones),
    JSON.stringify(eventAddOns),
    JSON.stringify(sanitizePrices(prices)),
    sanitizedImage.value,
    Date.now()
  );

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  res.status(201).json(eventView(event));
});

// ---- Admin: manually set ticket/add-on prices on an already-created event
// (from the Client kiosk's Created Events tab) ----
app.patch('/events/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'event_not_found' });

  const clean = sanitizePrices(req.body.prices);
  if (Object.keys(clean).length === 0) {
    return res.status(400).json({ error: 'invalid_prices' });
  }
  db.prepare('UPDATE events SET prices = ? WHERE id = ?').run(JSON.stringify(clean), req.params.id);
  res.json(eventView(db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id)));
});

// ---- List events (for event/tier pickers in Client + attendee app) ----
app.get('/events', (req, res) => {
  const rows = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all();
  res.json(rows.map(eventView));
});

// ---- Site admin only: permanently remove a created event, along with any
// tickets/checkouts issued against it — a scanned ticket_qr tag for one of
// those tickets is left in the tags table but stops granting entry on its
// own, since validateScan denies as soon as the account has no active
// ticket left. ----
app.delete('/events/:id', (req, res) => {
  if (!requireAdminHost(req.query.approverId)) {
    return res.status(403).json({ error: 'not_authorized' });
  }
  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'event_not_found' });

  db.prepare('DELETE FROM ticket_checkouts WHERE event_id = ?').run(req.params.id);
  db.prepare('DELETE FROM tickets WHERE event_id = ?').run(req.params.id);
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
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
    const prices = eventPrices(event);
    const priceCents = (prices[tier] || 0) + ticketAddOns.reduce((sum, a) => sum + (prices[a] || 0), 0);
    const ticketId = `tkt_${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(
      'INSERT INTO tickets (id, account_id, event_id, tier, zones, addons, price_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(ticketId, id, event.id, tier, JSON.stringify(ticketZones), JSON.stringify(ticketAddOns), priceCents, 'active');
    activateTicketQr(ticketId, id, event, tier);
  }

  mailer.notify(
    'New Attendee registration — Thru Pass',
    `A new Attendee account has registered.\n\nName: ${holder.trim()}\nEmail: ${normalizedEmail}${event ? `\nEvent: ${event.name} (${tier})` : ''}`
  );
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
  if (!requireApprovedHost(req.query.hostId)) {
    return res.status(403).json({ error: 'not_authorized' });
  }
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

// Shared by the direct-issue endpoint below and the ticket-checkout webhook
// — replaces any previous ticket, since an attendee holds one active event
// ticket at a time (mirrors ticket issuance in POST /accounts). Status is
// 'reserved' for a free hold (Reserve Ticket, unpaid) or 'active' once paid.
function issueTicket(accountId, event, tier, ticketAddOns, priceCents, status = 'active') {
  db.prepare('DELETE FROM tickets WHERE account_id = ?').run(accountId);
  const ticketId = `tkt_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(
    'INSERT INTO tickets (id, account_id, event_id, tier, zones, addons, price_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(ticketId, accountId, event.id, tier, event.zones, JSON.stringify(ticketAddOns), priceCents, status);
  if (status === 'active') activateTicketQr(ticketId, accountId, event, tier);
  return ticketId;
}

function ticketQrUrl(ticketId) {
  return `${PUBLIC_BASE_URL}/t/${ticketId}`;
}

// The emailed/displayed ticket QR doubles as a gate-entry credential: its
// content is the ticket's own info-page URL, stored as a "virtual" row in
// the same `tags` table physical wristbands use (kind = 'ticket_qr'), so it
// scans through the existing gate-validation pipeline with no changes there.
// Linking a real wristband later retires it automatically (see
// POST /tags/:uid/link), just like replacing a lost wristband would.
function issueTicketQrTag(ticketId, accountId) {
  const uid = ticketQrUrl(ticketId);
  const existing = db.prepare('SELECT * FROM tags WHERE uid = ?').get(uid);
  if (existing) {
    db.prepare("UPDATE tags SET account_id = ?, state = 'active' WHERE uid = ?").run(accountId, uid);
  } else {
    db.prepare("INSERT INTO tags (uid, account_id, state, kind) VALUES (?, ?, 'active', 'ticket_qr')").run(uid, accountId);
  }
  return uid;
}

function activateTicketQr(ticketId, accountId, event, tier) {
  const url = issueTicketQrTag(ticketId, accountId);
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (account && account.email) {
    mailer.sendTicketQr({ to: account.email, holder: account.holder, eventName: event.name, tier, ticketUrl: url });
  }
  return url;
}

function validateTicketSelection(event, tier, addOns) {
  if (!tier || !JSON.parse(event.tiers).includes(tier)) return { error: 'invalid_tier' };
  const availableAddOns = JSON.parse(event.addons || '[]');
  const ticketAddOns = Array.isArray(addOns) ? addOns.filter((a) => availableAddOns.includes(a)) : [];
  const prices = eventPrices(event);
  const priceCents = (prices[tier] || 0) + ticketAddOns.reduce((sum, a) => sum + (prices[a] || 0), 0);
  return { ticketAddOns, priceCents };
}

// ---- "Reserve Ticket" — holds a ticket for the attendee with no payment
// yet. It shows up in My Tickets as unpaid; the actual charge happens via
// /accounts/:id/ticket/checkout below, triggered from that ticket's own
// "Pay Now" button. ----
app.post('/accounts/:id/ticket', (req, res) => {
  const { id } = req.params;
  const { eventId, tier, addOns } = req.body;
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'account_not_found' });

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event_not_found' });

  const selection = validateTicketSelection(event, tier, addOns);
  if (selection.error) return res.status(400).json({ error: selection.error });

  issueTicket(id, event, tier, selection.ticketAddOns, selection.priceCents, 'reserved');
  res.json(accountView(id));
});

// ---- "Pay Now" — starts a real Ozow EFT charge for a reserved ticket. The
// ticket is only marked paid once Ozow confirms payment (see the webhook
// handler above), never here. ----
app.post('/accounts/:id/ticket/checkout', async (req, res) => {
  const { id } = req.params;
  const { eventId, tier, addOns } = req.body;
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'account_not_found' });

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event_not_found' });

  const selection = validateTicketSelection(event, tier, addOns);
  if (selection.error) return res.status(400).json({ error: selection.error });
  if (selection.priceCents <= 0) return res.status(400).json({ error: 'invalid_amount' });

  const ticketCheckoutId = `tco_${crypto.randomBytes(4).toString('hex')}`;
  try {
    const checkout = await ozow.createCheckout({
      amountCents: selection.priceCents,
      currency: 'ZAR',
      externalReference: ticketCheckoutId,
      shopperResultUrl: `${PUBLIC_BASE_URL}/payments/return.html?ticketCheckoutId=${ticketCheckoutId}`,
    });
    db.prepare(
      'INSERT INTO ticket_checkouts (id, account_id, event_id, tier, addons, amount_cents, checkout_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      ticketCheckoutId,
      id,
      event.id,
      tier,
      JSON.stringify(selection.ticketAddOns),
      selection.priceCents,
      checkout.checkoutId,
      'pending',
      Date.now()
    );
    res.status(201).json({ ticketCheckoutId, checkoutId: checkout.checkoutId, redirectUrl: checkout.redirectUrl });
  } catch (err) {
    console.error('Ozow checkout creation failed:', err.details || err.message);
    res.status(502).json({ error: 'payment_provider_unavailable' });
  }
});

// ---- Poll a ticket checkout's status — used by the payment-return page and
// the attendee app while the shopper is off completing payment on Ozow.
// Also proactively reconciles with Ozow's own status if still pending
// locally, so this works even if the webhook hasn't landed yet. ----
app.get('/ticket-checkouts/:id', async (req, res) => {
  let checkout = db.prepare('SELECT * FROM ticket_checkouts WHERE id = ?').get(req.params.id);
  if (!checkout) return res.status(404).json({ error: 'ticket_checkout_not_found' });

  if (checkout.status === 'pending') {
    try {
      const statusData = await ozow.getCheckoutStatus(checkout.checkout_id);
      if (ozow.isTerminalStatus(statusData.status)) {
        settleTicketCheckout(checkout, ozow.isSuccessStatus(statusData.status));
        checkout = db.prepare('SELECT * FROM ticket_checkouts WHERE id = ?').get(req.params.id);
      }
    } catch (err) {
      console.error('Ozow status check failed while polling ticket checkout:', err.details || err.message);
    }
  }

  res.json({ id: checkout.id, status: checkout.status, amountCents: checkout.amount_cents });
});

// ---- Public ticket page — the destination of every ticket's QR code/email
// link. No auth: like a physical ticket, holding the (unguessable) link is
// what proves it's yours. Doubles as the gate-scan credential itself — its
// URL is exactly the uid stored in the `tags` table for this ticket, so
// scanning the QR feeds this same string into the normal gate-scan flow. ----
app.get('/t/:ticketId', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.ticketId);
  if (!ticket) return res.status(404).send('<h1 style="font-family:sans-serif">Ticket not found</h1>');
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(ticket.event_id);
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(ticket.account_id);
  const statusLabel = ticket.status === 'active' ? 'Valid for entry' : 'Reserved — not yet paid';
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Thru Pass — Ticket</title>
  <style>
    * { box-sizing: border-box; }
    :root { --bg: #0B0C0E; --text: #F4F5F6; --text-secondary: #8A9099; --surface: #16181C; --border: rgba(255,255,255,0.10); --lime: #C8FF3D; }
    @media (prefers-color-scheme: light) {
      :root { --bg: #F5F6F7; --text: #14161A; --text-secondary: #5B6169; --surface: #FFFFFF; --border: rgba(0,0,0,0.10); --lime: #6B9B00; }
    }
    body { background: var(--bg); color: var(--text); font-family: 'Manrope', Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
    .card { max-width: 380px; width: 100%; text-align: center; background: var(--surface); border: 1px solid var(--border); border-radius: 22px; padding: 32px 26px; }
    .wordmark { font-family: 'Space Grotesk', 'Manrope', sans-serif; font-weight: 700; letter-spacing: 0.1em; font-size: 13px; color: var(--text-secondary); margin-bottom: 18px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .tier { color: var(--lime); font-weight: 700; font-size: 14px; margin: 0 0 20px; }
    img.qr { width: 220px; height: 220px; border-radius: 14px; background: #fff; padding: 10px; }
    .status { display: inline-block; margin-top: 20px; padding: 8px 18px; border-radius: 999px; font-weight: 700; font-size: 12px; letter-spacing: 0.03em; text-transform: uppercase; background: ${ticket.status === 'active' ? 'rgba(87,227,138,0.15); color:#57e38a' : 'rgba(232,197,71,0.15); color:#e8c547'}; }
    .hint { margin-top: 22px; font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="wordmark">THRUPASS</div>
    <h1>${event ? event.name : 'Event'}</h1>
    <p class="tier">${ticket.tier}${account ? ` · ${account.holder}` : ''}</p>
    <img class="qr" src="/t/${ticket.id}/qr.png" alt="Ticket QR code" />
    <div class="status">${statusLabel}</div>
    <p class="hint">Show this QR code at the gate to enter. Keep this link private — anyone with it can use your ticket.</p>
  </div>
</body>
</html>`);
});

app.get('/t/:ticketId/qr.png', async (req, res) => {
  const ticket = db.prepare('SELECT id FROM tickets WHERE id = ?').get(req.params.ticketId);
  if (!ticket) return res.status(404).end();
  try {
    const png = await QRCode.toBuffer(ticketQrUrl(ticket.id), { width: 320, margin: 1 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache');
    res.send(png);
  } catch (err) {
    res.status(500).end();
  }
});

// ---- Public info page for an attendee's Bar Tab QR — same purpose as the
// ticket info page (/t/:ticketId): a friendly landing spot if the QR is ever
// opened outside of a scan, and its own URL doubles as the tag uid bar staff
// scan against. ----
app.get('/bt/:barTabEventId/:accountId', (req, res) => {
  const { barTabEventId, accountId } = req.params;
  const event = db.prepare('SELECT * FROM bar_tab_events WHERE id = ?').get(barTabEventId);
  if (!event) return res.status(404).send('<h1 style="font-family:sans-serif">Bar tab not found</h1>');
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) return res.status(404).send('<h1 style="font-family:sans-serif">Account not found</h1>');
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Thru Pass — Bar Tab</title>
  <style>
    * { box-sizing: border-box; }
    :root { --bg: #0B0C0E; --text: #F4F5F6; --text-secondary: #8A9099; --surface: #16181C; --border: rgba(255,255,255,0.10); --lime: #C8FF3D; }
    @media (prefers-color-scheme: light) {
      :root { --bg: #F5F6F7; --text: #14161A; --text-secondary: #5B6169; --surface: #FFFFFF; --border: rgba(0,0,0,0.10); --lime: #6B9B00; }
    }
    body { background: var(--bg); color: var(--text); font-family: 'Manrope', Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
    .card { max-width: 380px; width: 100%; text-align: center; background: var(--surface); border: 1px solid var(--border); border-radius: 22px; padding: 32px 26px; }
    .wordmark { font-family: 'Space Grotesk', 'Manrope', sans-serif; font-weight: 700; letter-spacing: 0.1em; font-size: 13px; color: var(--text-secondary); margin-bottom: 18px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .holder { color: var(--lime); font-weight: 700; font-size: 14px; margin: 0 0 20px; }
    img.qr { width: 220px; height: 220px; border-radius: 14px; background: #fff; padding: 10px; }
    .hint { margin-top: 22px; font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="wordmark">THRUPASS</div>
    <h1>${event.name}</h1>
    <p class="holder">${account.holder}'s Bar Tab</p>
    <img class="qr" src="/bt/${barTabEventId}/${accountId}/qr.png" alt="Bar Tab QR code" />
    <p class="hint">Show this QR code to bar staff to log a drink. Keep this link private — anyone with it can use your bar tab.</p>
  </div>
</body>
</html>`);
});

app.get('/bt/:barTabEventId/:accountId/qr.png', async (req, res) => {
  const { barTabEventId, accountId } = req.params;
  const event = db.prepare('SELECT id FROM bar_tab_events WHERE id = ?').get(barTabEventId);
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(accountId);
  if (!event || !account) return res.status(404).end();
  try {
    const png = await QRCode.toBuffer(barTabQrUrl(barTabEventId, accountId), { width: 320, margin: 1 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache');
    res.send(png);
  } catch (err) {
    res.status(500).end();
  }
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
