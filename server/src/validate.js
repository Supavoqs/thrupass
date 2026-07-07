const db = require('./db');
const { GATES, ANTI_PASSBACK_WINDOW_MS } = require('./gates');

/**
 * Validates a tag scan at a gate. Mirrors the edge-reader decision described
 * in the design: tier check -> anti-passback -> blocklist, decided against a
 * cached allowlist snapshot (here, the in-process DB stands in for that
 * snapshot). Returns a decision plus enough context to render both the gate
 * reader screen and the attendee's "Access granted" screen.
 */
// No physical RFID antenna exists in this environment, so we simulate the
// RF energize+read latency the design calls out (~60ms) on top of the real
// (near-instant) validation logic below.
function simulatedRfReadMs() {
  return Math.round(45 + Math.random() * 45);
}

function validateScan(uid, gateId) {
  const rfMs = simulatedRfReadMs();

  const gate = GATES[gateId];
  if (!gate) {
    return finish({ result: 'denied', reason: 'unknown_gate' });
  }

  const tag = db.prepare('SELECT * FROM tags WHERE uid = ?').get(uid);
  if (!tag) {
    return finish({ result: 'denied', reason: 'unknown_tag' });
  }

  if (tag.state === 'blocked') {
    return finish({ result: 'denied', reason: 'blocklist', tag });
  }

  if (tag.state !== 'active' || !tag.account_id) {
    return finish({ result: 'denied', reason: 'unlinked_tag', tag });
  }

  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(tag.account_id);
  const ticket = db
    .prepare('SELECT * FROM tickets WHERE account_id = ? ORDER BY rowid DESC LIMIT 1')
    .get(tag.account_id);

  if (!ticket || ticket.status !== 'active') {
    return finish({ result: 'denied', reason: 'invalid_ticket', tag, account, ticket });
  }

  const zones = JSON.parse(ticket.zones);
  if (!zones.includes(gate.zone)) {
    return finish({ result: 'denied', reason: 'zone_not_permitted', tag, account, ticket, zones });
  }

  const now = Date.now();
  if (tag.last_zone === gate.zone && tag.last_scan_ts && now - tag.last_scan_ts < ANTI_PASSBACK_WINDOW_MS) {
    return finish({ result: 'denied', reason: 're_entry_block', tag, account, ticket, zones });
  }

  const isFirstEntry = !tag.last_scan_ts;
  db.prepare('UPDATE tags SET last_zone = ?, last_scan_ts = ? WHERE uid = ?').run(gate.zone, now, uid);

  return finish({ result: 'granted', reason: isFirstEntry ? 'first_entry' : 're_entry_ok', tag, account, ticket, zones, gate });

  function finish(outcome) {
    return { ...outcome, readMs: rfMs };
  }
}

module.exports = { validateScan };
