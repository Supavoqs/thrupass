const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// Persist to a file on disk instead of ':memory:' — every account, event,
// and ticket used to vanish on every server restart (Node app restart in
// cPanel, a crash, a redeploy), which is surprising and destructive in
// production. Override THRUPASS_DATA_DIR if you want the db file somewhere
// other than alongside the app (e.g. outside the deploy folder so a fresh
// upload can't accidentally delete it).
const DATA_DIR = process.env.THRUPASS_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'thrupass.db'));

// IF NOT EXISTS because this now runs against a file that already has these
// tables on every restart after the first.
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    holder TEXT NOT NULL,
    email TEXT,
    password_hash TEXT,
    balance_cents INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    location TEXT,
    tiers TEXT NOT NULL, -- JSON array of strings
    zones TEXT NOT NULL, -- JSON array of strings
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    event_id TEXT NOT NULL REFERENCES events(id),
    tier TEXT NOT NULL,
    zones TEXT NOT NULL, -- JSON array
    status TEXT NOT NULL DEFAULT 'active' -- active | revoked
  );

  CREATE TABLE IF NOT EXISTS tags (
    uid TEXT PRIMARY KEY,
    account_id TEXT REFERENCES accounts(id),
    state TEXT NOT NULL DEFAULT 'unlinked', -- unlinked | active | blocked
    last_zone TEXT,
    last_scan_ts INTEGER
  );

  CREATE TABLE IF NOT EXISTS scan_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_uid TEXT NOT NULL,
    gate_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    result TEXT NOT NULL, -- granted | denied
    reason TEXT,
    read_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS cash_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    type TEXT NOT NULL, -- load | payout
    amount_cents INTEGER NOT NULL,
    ts INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hosts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | approved
    created_at INTEGER NOT NULL
  );

  -- Real-money wallet top-ups via Stitch. A row is created the moment a
  -- checkout is started and only ever credited to the account once Stitch
  -- confirms payment (webhook or direct status check) — never on checkout
  -- creation alone, since the shopper may abandon or fail to pay.
  CREATE TABLE IF NOT EXISTS topups (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    checkout_id TEXT NOT NULL UNIQUE,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  -- Ticket purchases via Stitch (the "Pay Now" flow from Browse Other
  -- Events). The ticket itself is only issued once Stitch confirms payment
  -- (see the webhook handler) — never at checkout-creation time.
  CREATE TABLE IF NOT EXISTS ticket_checkouts (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    event_id TEXT NOT NULL REFERENCES events(id),
    tier TEXT NOT NULL,
    addons TEXT NOT NULL DEFAULT '[]',
    amount_cents INTEGER NOT NULL,
    checkout_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  -- A specific bar/station's drink config — hosts create one of these from
  -- the Client kiosk's "Create Bar Tab Event" tab, set a per-drink-type
  -- serving cap, and get a QR code linking attendees to a read-only menu
  -- showing their remaining drinks for that bar.
  CREATE TABLE IF NOT EXISTS bar_tab_events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    beers_max INTEGER NOT NULL DEFAULT 3,
    ciders_max INTEGER NOT NULL DEFAULT 3,
    spirits_max INTEGER NOT NULL DEFAULT 3,
    created_at INTEGER NOT NULL
  );

  -- Bar tab: a running drink count per patron, logged by bar staff from the
  -- Client kiosk. One row per drink served, scoped to the bar tab event it
  -- was served under (the same attendee can hold a separate allowance at a
  -- different bar tab event).
  CREATE TABLE IF NOT EXISTS drink_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    drink_type TEXT NOT NULL, -- BEERS | CIDERS | SPIRITS
    bar_tab_event_id TEXT REFERENCES bar_tab_events(id),
    ts INTEGER NOT NULL
  );

  -- Logs which attendees have opened a Bar Tab Event's link (via its QR code
  -- or share link) and are identified with an account, so staff can see a
  -- guest list. One row per account per bar tab event.
  CREATE TABLE IF NOT EXISTS bar_tab_rsvps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bar_tab_event_id TEXT NOT NULL REFERENCES bar_tab_events(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    holder TEXT NOT NULL,
    ts INTEGER NOT NULL,
    UNIQUE(bar_tab_event_id, account_id)
  );

  -- A cashless vendor/stall (food truck, merch stand, etc.) — hosts create
  -- one from the Client kiosk's "Vendors" tab, give it a priced menu, then
  -- tap attendee wristbands against it to deduct their Thru Balance in real
  -- time. commission_pct/banking_fee_cents are the organizer's own cut (if
  -- any) taken out at settlement time — both default to 0 (pure pass-through).
  CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    commission_pct REAL NOT NULL DEFAULT 0,
    banking_fee_cents INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  -- A vendor's priced menu item. Soft-disabled (active=0) rather than
  -- deleted when sold out mid-event, so past sales still resolve their name.
  CREATE TABLE IF NOT EXISTS vendor_items (
    id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES vendors(id),
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  -- One row per line item sold — name/price are snapshotted at sale time so
  -- a later menu edit (or deleted item) never rewrites history. This is the
  -- itemized, per-vendor, real-time sales log the settlement report and the
  -- organizer's live overview are both computed from.
  CREATE TABLE IF NOT EXISTS vendor_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id TEXT NOT NULL REFERENCES vendors(id),
    item_id TEXT REFERENCES vendor_items(id),
    item_name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    cashier_name TEXT,
    ts INTEGER NOT NULL
  );

  -- Thru Pass's own platform fee schedule (a single row, id='default') —
  -- what Thru Pass charges organizers, mirroring how Howler charges the
  -- events it runs. Edited from the Client kiosk's "Pricing" tab. New
  -- vendors are seeded from vendor_commission_pct/vendor_banking_fee_pct at
  -- creation time; ticket-side fees are computed on demand from these
  -- numbers rather than stored per-ticket.
  CREATE TABLE IF NOT EXISTS platform_pricing (
    id TEXT PRIMARY KEY,
    ticket_commission_pct REAL NOT NULL,
    ticket_banking_fee_pct REAL NOT NULL,
    ticket_min_fee_cents INTEGER NOT NULL,
    vendor_commission_pct REAL NOT NULL,
    vendor_banking_fee_pct REAL NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// Lightweight migrations for columns added after the database started
// persisting to disk — CREATE TABLE IF NOT EXISTS is a no-op against an
// existing file, so new columns need to be added explicitly.
function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!existing.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Event add-ons (e.g. cooler/parking) offered at booking time, and the
// add-ons a specific ticket's holder actually chose.
ensureColumn('events', 'addons', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('tickets', 'addons', "TEXT NOT NULL DEFAULT '[]'");

// Total price paid for a ticket (tier price + any add-ons), computed at
// issuance time from the fixed price list in index.js.
ensureColumn('tickets', 'price_cents', 'INTEGER NOT NULL DEFAULT 0');

// Scopes each drink order to the bar tab event it was served under, so the
// same attendee can hold a separate drink allowance per bar/station.
ensureColumn('drink_orders', 'bar_tab_event_id', 'TEXT REFERENCES bar_tab_events(id)');

// Per-event pricing (JSON: { GA, VIP, VVIP, PARKING, COOLER } in cents),
// editable by the admin from the Client kiosk's Created Events tab. NULL
// means the event still uses the platform default price list in index.js.
ensureColumn('events', 'prices', 'TEXT');

// Distinguishes a real physical RFID wristband from the virtual "e-ticket
// QR" tag auto-created when a ticket is paid/activated (its uid is the
// ticket's own QR link) — both scan through the same gate-validation path,
// but only 'wristband' should ever show up as "wristband linked" in the UI.
ensureColumn('tags', 'kind', "TEXT NOT NULL DEFAULT 'wristband'");

// Howler's banking fee is a percentage of sales (2.5%), not a flat amount —
// replaces the flat banking_fee_cents this table launched with. The old
// column is left in place (harmless) rather than dropped.
ensureColumn('vendors', 'banking_fee_pct', 'REAL NOT NULL DEFAULT 0');

// Only the site admin (the first host, who bootstraps the system) can
// approve/reject other hosts' signups — every other approved host can still
// run events/gates/vendors, but no longer sees the Approvals tab at all.
ensureColumn('hosts', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
db.prepare(
  "UPDATE hosts SET is_admin = 1 WHERE rowid = (SELECT MIN(rowid) FROM hosts) AND NOT EXISTS (SELECT 1 FROM hosts WHERE is_admin = 1)"
).run();

// The Electric Valley demo event used to be seeded here; it's gone from the
// product now, so scrub it (and its tickets) from databases that still
// carry it from an earlier startup.
db.prepare(`DELETE FROM tickets WHERE event_id = 'evt_electric_valley_26'`).run();
db.prepare(`DELETE FROM events WHERE id = 'evt_electric_valley_26'`).run();

// --- Seed data matching the design mockups — INSERT OR IGNORE so this is
// safe to run against a database that already has these rows from a
// previous startup (fixed ids make that a no-op rather than a duplicate).
db.prepare(
  `INSERT OR IGNORE INTO accounts (id, holder, email, balance_cents) VALUES (?, ?, ?, ?)`
).run('acc_naledi', 'Naledi Mokoena', 'naledi@example.com', 45000);

db.prepare(
  `INSERT OR IGNORE INTO tags (uid, account_id, state) VALUES (?, ?, ?)`
).run('04:A2:6B:4C:7A:91', 'acc_naledi', 'active');

// Introductory rates: 1 percentage point below Howler's published caps
// (5% commission, 2.5% banking fee, R5 free-ticket minimum) since Thru Pass
// is new to the ticketing market — adjust from the Pricing tab as real
// payment-processor costs (Stitch) are confirmed.
db.prepare(
  `INSERT OR IGNORE INTO platform_pricing (id, ticket_commission_pct, ticket_banking_fee_pct, ticket_min_fee_cents, vendor_commission_pct, vendor_banking_fee_pct, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
).run('default', 4, 1.5, 495, 4, 1.5, Date.now());

module.exports = db;
