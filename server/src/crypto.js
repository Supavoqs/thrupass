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

module.exports = { sign, verify };
