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

  -- Real-money wallet top-ups via Peach Payments. A row is created the
  -- moment a checkout is started and only ever credited to the account once
  -- Peach confirms payment (webhook or direct status check) — never on
  -- checkout creation alone, since the shopper may abandon or fail to pay.
  CREATE TABLE IF NOT EXISTS topups (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    checkout_id TEXT NOT NULL UNIQUE,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  -- Bar tab: a running drink count per patron, logged by bar staff from the
  -- Client kiosk's Bar Tab tab. One row per drink served.
  CREATE TABLE IF NOT EXISTS drink_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    drink_type TEXT NOT NULL, -- BEERS | CIDERS | SPIRITS
    ts INTEGER NOT NULL
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

// --- Seed data matching the design mockups — INSERT OR IGNORE so this is
// safe to run against a database that already has these rows from a
// previous startup (fixed ids make that a no-op rather than a duplicate).
db.prepare(
  `INSERT OR IGNORE INTO accounts (id, holder, email, balance_cents) VALUES (?, ?, ?, ?)`
).run('acc_naledi', 'Naledi Mokoena', 'naledi@example.com', 45000);

db.prepare(
  `INSERT OR IGNORE INTO events (id, name, start_date, end_date, location, tiers, zones, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  'evt_electric_valley_26',
  "Electric Valley '26",
  '2026-03-06',
  '2026-03-08',
  'Franschhoek',
  JSON.stringify(['GA WEEKEND', 'VIP']),
  JSON.stringify(['Main', 'Camp', 'Bar']),
  Date.now()
);

db.prepare(
  `INSERT OR IGNORE INTO tickets (id, account_id, event_id, tier, zones, status) VALUES (?, ?, ?, ?, ?, ?)`
).run(
  'tkt_ev26_08812',
  'acc_naledi',
  'evt_electric_valley_26',
  'GA WEEKEND',
  JSON.stringify(['Main', 'Camp', 'Bar']),
  'active'
);

db.prepare(
  `INSERT OR IGNORE INTO tags (uid, account_id, state) VALUES (?, ?, ?)`
).run('04:A2:6B:4C:7A:91', 'acc_naledi', 'active');

module.exports = db;
