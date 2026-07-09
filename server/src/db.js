const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:');

db.exec(`
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    holder TEXT NOT NULL,
    email TEXT,
    password_hash TEXT,
    balance_cents INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    location TEXT,
    tiers TEXT NOT NULL, -- JSON array of strings
    zones TEXT NOT NULL, -- JSON array of strings
    created_at INTEGER NOT NULL
  );

  CREATE TABLE tickets (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    event_id TEXT NOT NULL REFERENCES events(id),
    tier TEXT NOT NULL,
    zones TEXT NOT NULL, -- JSON array
    status TEXT NOT NULL DEFAULT 'active' -- active | revoked
  );

  CREATE TABLE tags (
    uid TEXT PRIMARY KEY,
    account_id TEXT REFERENCES accounts(id),
    state TEXT NOT NULL DEFAULT 'unlinked', -- unlinked | active | blocked
    last_zone TEXT,
    last_scan_ts INTEGER
  );

  CREATE TABLE scan_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_uid TEXT NOT NULL,
    gate_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    result TEXT NOT NULL, -- granted | denied
    reason TEXT,
    read_ms INTEGER
  );

  CREATE TABLE cash_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    type TEXT NOT NULL, -- load | payout
    amount_cents INTEGER NOT NULL,
    ts INTEGER NOT NULL
  );

  CREATE TABLE hosts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | approved
    created_at INTEGER NOT NULL
  );
`);

// --- Seed data matching the design mockups ---
db.prepare(
  `INSERT INTO accounts (id, holder, email, balance_cents) VALUES (?, ?, ?, ?)`
).run('acc_naledi', 'Naledi Mokoena', 'naledi@example.com', 45000);

db.prepare(
  `INSERT INTO events (id, name, start_date, end_date, location, tiers, zones, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
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
  `INSERT INTO tickets (id, account_id, event_id, tier, zones, status) VALUES (?, ?, ?, ?, ?, ?)`
).run(
  'tkt_ev26_08812',
  'acc_naledi',
  'evt_electric_valley_26',
  'GA WEEKEND',
  JSON.stringify(['Main', 'Camp', 'Bar']),
  'active'
);

db.prepare(
  `INSERT INTO tags (uid, account_id, state) VALUES (?, ?, ?)`
).run('04:A2:6B:4C:7A:91', 'acc_naledi', 'active');

module.exports = db;
