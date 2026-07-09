const crypto = require('node:crypto');

// Per-event signing secret. Tokens/allowlist snapshots are HMAC-signed so a
// reader can trust a cached snapshot without round-tripping to the cloud.
const EVENT_SECRET = process.env.THRUPASS_EVENT_SECRET || 'demo-event-secret-electric-valley-26';

function sign(payload) {
  const json = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', EVENT_SECRET).update(json).digest('hex');
  return { payload, signature };
}

function verify(payload, signature) {
  const expected = crypto.createHmac('sha256', EVENT_SECRET).update(JSON.stringify(payload)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Host account passwords (scrypt, salted) — the only password storage in
// this app, used to gate the Client kiosk's admin tabs.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const hashBuffer = Buffer.from(hash, 'hex');
  const suppliedBuffer = crypto.scryptSync(password, salt, 64);
  return hashBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(hashBuffer, suppliedBuffer);
}

module.exports = { sign, verify, hashPassword, verifyPassword };
