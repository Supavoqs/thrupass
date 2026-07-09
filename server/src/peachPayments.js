const crypto = require('node:crypto');

// All Peach Payments credentials come from environment variables — never
// commit real values. Get these from the Peach Payments Dashboard (API keys
// section) for sandbox, then swap to live values when going into production.
const {
  PEACH_CLIENT_ID,
  PEACH_CLIENT_SECRET,
  PEACH_MERCHANT_ID,
  PEACH_ENTITY_ID,
  PEACH_WEBHOOK_SECRET,
  PEACH_WEBHOOK_URL,
  PEACH_AUTH_BASE_URL = 'https://oauth.peachpayments.com',
  PEACH_API_BASE_URL = 'https://testapi.peachpayments.com',
} = process.env;

function assertConfigured() {
  const missing = ['PEACH_CLIENT_ID', 'PEACH_CLIENT_SECRET', 'PEACH_MERCHANT_ID', 'PEACH_ENTITY_ID', 'PEACH_WEBHOOK_URL']
    .filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Peach Payments is not configured — missing env vars: ${missing.join(', ')}`);
  }
}

// The OAuth access token is short-lived; cache it in memory and refetch a
// little before it actually expires rather than on every request.
let cachedToken = null; // { accessToken, expiresAt }

async function getAccessToken() {
  assertConfigured();
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5000) {
    return cachedToken.accessToken;
  }

  const res = await fetch(`${PEACH_AUTH_BASE_URL}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: PEACH_CLIENT_ID,
      clientSecret: PEACH_CLIENT_SECRET,
      merchantId: PEACH_MERCHANT_ID,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Peach auth request failed: ${res.status}`);
    err.details = data;
    throw err;
  }

  const accessToken = data.access_token || data.accessToken;
  const expiresInMs = (Number(data.expires_in) || 15 * 60) * 1000;
  cachedToken = { accessToken, expiresAt: Date.now() + expiresInMs };
  return accessToken;
}

// Hosted/redirect checkout: the shopper is sent to Peach's own payment page,
// then redirected back to `shopperResultUrl` once done. `notificationUrl`
// (a webhook) is the authoritative confirmation — the redirect alone is not
// proof of payment, since a shopper can close the tab or the redirect can
// fail to fire.
async function createCheckout({ amountCents, currency, merchantTransactionId, shopperResultUrl }) {
  const token = await getAccessToken();
  const res = await fetch(`${PEACH_API_BASE_URL}/v2/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      authentication: { entityId: PEACH_ENTITY_ID },
      amount: (amountCents / 100).toFixed(2),
      currency,
      merchantTransactionId,
      shopperResultUrl,
      notificationUrl: PEACH_WEBHOOK_URL,
      nonce: crypto.randomUUID(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Peach checkout creation failed: ${res.status}`);
    err.details = data;
    throw err;
  }
  return {
    checkoutId: data.id || data.checkoutId,
    redirectUrl: data.redirectUrl || data.url,
    raw: data,
  };
}

async function getCheckoutStatus(checkoutId) {
  const token = await getAccessToken();
  const res = await fetch(`${PEACH_API_BASE_URL}/v2/checkout/${encodeURIComponent(checkoutId)}/payment`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Peach status check failed: ${res.status}`);
    err.details = data;
    throw err;
  }
  return data;
}

// Result codes follow Peach's underlying processor scheme: 000.000.000 is a
// clean success; the 000.400.0xx family is "successful but flagged for
// manual review"; the 000.100.11x codes only ever appear on the TEST system.
// See: https://developer.peachpayments.com/docs/dashboard-response-codes
const SUCCESS_CODE_PATTERNS = [
  /^000\.000\.000$/,
  /^000\.100\.1(10|11|12)$/,
  /^000\.400\.0(00|10|20|40|60|90)$/,
];

function isSuccessResultCode(code) {
  return typeof code === 'string' && SUCCESS_CODE_PATTERNS.some((re) => re.test(code));
}

// Peach signs webhooks with HMAC-SHA256 over `${timestamp}.${url}.${rawBody}`,
// keyed with the webhook secret from the Dashboard. `url` must be the exact
// webhook URL registered with Peach (PEACH_WEBHOOK_URL), not derived from the
// incoming request, since that can be rewritten by a reverse proxy.
function verifyWebhookSignature({ timestamp, signature, rawBody }) {
  if (!PEACH_WEBHOOK_SECRET || !timestamp || !signature || !rawBody) return false;
  const message = `${timestamp}.${PEACH_WEBHOOK_URL}.${rawBody}`;
  const expected = crypto.createHmac('sha256', PEACH_WEBHOOK_SECRET).update(message).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const suppliedBuf = Buffer.from(String(signature), 'hex');
  return expectedBuf.length === suppliedBuf.length && crypto.timingSafeEqual(expectedBuf, suppliedBuf);
}

module.exports = {
  getAccessToken,
  createCheckout,
  getCheckoutStatus,
  isSuccessResultCode,
  verifyWebhookSignature,
};
