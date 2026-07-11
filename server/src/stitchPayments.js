const crypto = require('node:crypto');

// All Stitch credentials come from environment variables — never commit real
// values. Get these from the Stitch dashboard (stitch.money) after Stitch
// approves your account. Docs: https://docs.stitch.money
const {
  STITCH_CLIENT_ID,
  STITCH_CLIENT_SECRET,
  STITCH_WEBHOOK_SECRET,
  STITCH_AUTH_BASE_URL = 'https://secure.stitch.money',
  STITCH_API_BASE_URL = 'https://api.stitch.money',
} = process.env;

function assertConfigured() {
  const missing = ['STITCH_CLIENT_ID', 'STITCH_CLIENT_SECRET', 'STITCH_WEBHOOK_SECRET']
    .filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Stitch is not configured — missing env vars: ${missing.join(', ')}`);
  }
}

// The OAuth2 client-credentials token is short-lived; cache it in memory and
// refetch a little before it actually expires rather than on every request.
let cachedToken = null; // { accessToken, expiresAt }

async function getAccessToken() {
  assertConfigured();
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5000) {
    return cachedToken.accessToken;
  }

  const res = await fetch(`${STITCH_AUTH_BASE_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: STITCH_CLIENT_ID,
      client_secret: STITCH_CLIENT_SECRET,
      scope: 'client_paymentrequest',
      audience: `${STITCH_AUTH_BASE_URL}/connect/token`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Stitch auth request failed: ${res.status}`);
    err.details = data;
    throw err;
  }

  const expiresInMs = (Number(data.expires_in) || 3600) * 1000;
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + expiresInMs };
  return cachedToken.accessToken;
}

// Hosted/redirect checkout: the shopper is sent to Stitch's own "Pay by Bank"
// page, then redirected back to `shopperResultUrl` (Stitch requires this to
// be a URL you've whitelisted with them beforehand — contact Stitch support
// to add it). A webhook (registered separately in the Stitch dashboard) is
// the authoritative confirmation — the redirect alone is not proof of
// payment, since a shopper can close the tab or the redirect can fail to
// fire.
async function createCheckout({ amountCents, currency, externalReference, shopperResultUrl }) {
  const token = await getAccessToken();
  const res = await fetch(`${STITCH_API_BASE_URL}/v2/payment-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      amount: { currency, quantity: (amountCents / 100).toFixed(2) },
      externalReference,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Stitch payment request creation failed: ${res.status}`);
    err.details = data;
    throw err;
  }
  const baseUrl = data.interaction && data.interaction.url;
  return {
    checkoutId: data.id,
    redirectUrl: baseUrl ? `${baseUrl}?redirect_uri=${encodeURIComponent(shopperResultUrl)}` : null,
    raw: data,
  };
}

async function getCheckoutStatus(checkoutId) {
  const token = await getAccessToken();
  const res = await fetch(`${STITCH_API_BASE_URL}/v2/payment-requests/${encodeURIComponent(checkoutId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Stitch status check failed: ${res.status}`);
    err.details = data;
    throw err;
  }
  return data;
}

function isSuccessStatus(status) {
  return typeof status === 'string' && status.toLowerCase() === 'completed';
}

// "pending" isn't a verdict yet — only completed/cancelled/expired/failed are
// worth writing to our DB. Anything else (including an unrecognized status
// string) is treated as "still waiting", so a poll mid-payment never
// prematurely marks a checkout as failed.
function isTerminalStatus(status) {
  return typeof status === 'string' && ['completed', 'cancelled', 'expired', 'failed'].includes(status.toLowerCase());
}

// Stitch signs webhooks with header `X-Stitch-Signature: t=<unix-seconds>,
// hmac_sha256=<hex>` — HMAC-SHA256 over `${timestamp}.${rawBody}` (no URL in
// the signed message, unlike Peach), keyed with the webhook secret from the
// dashboard.
function verifyWebhookSignature({ signatureHeader, rawBody }) {
  if (!STITCH_WEBHOOK_SECRET || !signatureHeader || !rawBody) return false;
  const parts = {};
  for (const piece of signatureHeader.split(',')) {
    const [key, value] = piece.trim().split('=');
    parts[key] = value;
  }
  const { t: timestamp, hmac_sha256: signature } = parts;
  if (!timestamp || !signature) return false;

  const message = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', STITCH_WEBHOOK_SECRET).update(message).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const suppliedBuf = Buffer.from(signature, 'hex');
  return expectedBuf.length === suppliedBuf.length && crypto.timingSafeEqual(expectedBuf, suppliedBuf);
}

// Webhook subscription bodies are configurable per the query you set up in
// the Stitch dashboard, so rather than assuming one fixed shape, this pulls
// whatever externalReference it can find. The webhook is only ever treated
// as a "go check now" signal — index.js always re-confirms via
// getCheckoutStatus() before crediting anything, never trusting a status
// field embedded in the webhook body itself.
function extractExternalReference(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.externalReference === 'string') return payload.externalReference;
  if (typeof payload.data?.externalReference === 'string') return payload.data.externalReference;
  const node = payload.data?.client?.paymentInitiationRequests?.node;
  if (typeof node?.externalReference === 'string') return node.externalReference;
  return null;
}

module.exports = {
  getAccessToken,
  createCheckout,
  getCheckoutStatus,
  isSuccessStatus,
  isTerminalStatus,
  verifyWebhookSignature,
  extractExternalReference,
};
