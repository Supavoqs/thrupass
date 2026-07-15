const crypto = require('node:crypto');

// All Ozow credentials come from environment variables — never commit real
// values. This targets Ozow's "One API" (https://one.ozow.com/v1, docs at
// hub.ozow.com): OAuth2 client-credentials auth, JSON payment requests, and
// Svix-style webhooks. The client_id/client_secret pair comes from Ozow's
// credential exchange once the merchant is approved (contact
// support@ozow.com if it isn't visible on the dashboard).
const {
  OZOW_CLIENT_ID,
  OZOW_CLIENT_SECRET,
  OZOW_SITE_CODE,
  OZOW_WEBHOOK_SECRET,
  OZOW_API_BASE_URL = 'https://one.ozow.com/v1',
} = process.env;

function assertConfigured() {
  const missing = ['OZOW_CLIENT_ID', 'OZOW_CLIENT_SECRET', 'OZOW_SITE_CODE']
    .filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Ozow is not configured — missing env vars: ${missing.join(', ')}`);
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

  const res = await fetch(`${OZOW_API_BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: OZOW_CLIENT_ID,
      client_secret: OZOW_CLIENT_SECRET,
      scope: 'payment',
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Ozow auth request failed: ${res.status}`);
    err.details = data;
    throw err;
  }

  const expiresInMs = (Number(data.expires_in) || 3600) * 1000;
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + expiresInMs };
  return cachedToken.accessToken;
}

// Hosted/redirect checkout: POST /payments returns a redirectUrl to Ozow's
// own EFT page; the shopper is sent there and comes back to returnUrl. The
// redirect alone is never proof of payment — confirmation always comes from
// re-checking the payment's transactions (below), triggered by the webhook
// or by the return page / attendee app polling.
async function createCheckout({ amountCents, currency, externalReference, shopperResultUrl }) {
  if (currency !== 'ZAR') {
    throw new Error(`Ozow only supports ZAR — got ${currency}`);
  }
  const token = await getAccessToken();
  const res = await fetch(`${OZOW_API_BASE_URL}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      siteCode: OZOW_SITE_CODE,
      amount: { currency: 'ZAR', value: Number((amountCents / 100).toFixed(2)) },
      merchantReference: externalReference,
      expireAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      returnUrl: shopperResultUrl,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    const err = new Error(`Ozow payment request creation failed: ${res.status}`);
    err.details = data;
    throw err;
  }
  return {
    checkoutId: data.id,
    redirectUrl: data.redirectUrl || null,
    raw: data,
  };
}

function normalizeStatus(status) {
  return typeof status === 'string' ? status.toLowerCase() : '';
}

// A payment request itself only ever reports created/expired — the actual
// paid-or-not outcome lives on the payment's transactions (incomplete →
// complete). getCheckoutStatus collapses both into one status string:
//   'complete'  — a transaction settled successfully (the only success state)
//   'expired'   — the payment request lapsed unpaid
//   'error' / 'cancelled' — a transaction terminally failed
//   'pending'   — everything else (shopper may still be mid-payment)
async function getCheckoutStatus(checkoutId) {
  const token = await getAccessToken();
  const authHeaders = { Accept: 'application/json', Authorization: `Bearer ${token}` };

  const payRes = await fetch(`${OZOW_API_BASE_URL}/payments/${encodeURIComponent(checkoutId)}`, {
    headers: authHeaders,
  });
  const payment = await payRes.json().catch(() => ({}));
  if (!payRes.ok) {
    const err = new Error(`Ozow status check failed: ${payRes.status}`);
    err.details = payment;
    throw err;
  }

  // fromDate/toDate are required query params on the transactions listing; a
  // generous window around "now" always covers this payment's lifetime, since
  // payment requests expire within hours of creation.
  const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  let transactions = [];
  try {
    const txRes = await fetch(
      `${OZOW_API_BASE_URL}/payments/${encodeURIComponent(checkoutId)}/transactions?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&limit=50`,
      { headers: authHeaders }
    );
    const txData = await txRes.json().catch(() => ({}));
    if (txRes.ok && Array.isArray(txData.transactions)) transactions = txData.transactions;
  } catch {
    // transactions listing is an enrichment — fall through to payment status
  }

  if (transactions.some((t) => normalizeStatus(t.status) === 'complete')) {
    return { status: 'complete', raw: { payment, transactions } };
  }
  if (normalizeStatus(payment.status) === 'expired') {
    return { status: 'expired', raw: { payment, transactions } };
  }
  const failed = transactions.find((t) =>
    ['error', 'cancelled', 'failed', 'abandoned'].includes(normalizeStatus(t.status))
  );
  if (failed) {
    return { status: normalizeStatus(failed.status), raw: { payment, transactions } };
  }
  return { status: 'pending', raw: { payment, transactions } };
}

function isSuccessStatus(status) {
  return normalizeStatus(status) === 'complete';
}

// 'pending'/'incomplete' aren't verdicts yet — only settled outcomes are
// worth writing to our DB, so a poll mid-payment never prematurely marks a
// checkout as failed.
function isTerminalStatus(status) {
  return ['complete', 'expired', 'error', 'cancelled', 'failed', 'abandoned'].includes(normalizeStatus(status));
}

// Ozow webhooks are delivered via Svix and signed per Svix's standard
// scheme: HMAC-SHA256 over `${id}.${timestamp}.${rawBody}` keyed with the
// base64 part of the 'whsec_...' secret (fetched once from Ozow via
// GET /webhooks/{id}/secret and stored as OZOW_WEBHOOK_SECRET). The
// signature header holds space-separated 'v1,<base64sig>' entries. Ozow's
// docs name the header X-Ozow-Signature, so accept both naming schemes.
//
// If no OZOW_WEBHOOK_SECRET is set yet, the webhook is accepted unverified —
// safe here because the handler treats webhooks purely as a "go check now"
// signal and always re-confirms against Ozow's own API before crediting
// anything; an attacker can at worst make us re-poll a status.
function verifyWebhookSignature({ headers, rawBody }) {
  if (!OZOW_WEBHOOK_SECRET) {
    console.warn('OZOW_WEBHOOK_SECRET not set — accepting webhook unverified (status is re-checked via API regardless)');
    return true;
  }
  if (!headers || !rawBody) return false;

  const get = (name) => headers[name] || headers[name.toLowerCase()];
  const msgId = get('svix-id') || get('x-ozow-id') || get('webhook-id') || '';
  const timestamp = get('svix-timestamp') || get('x-ozow-timestamp') || get('webhook-timestamp') || '';
  const signatureHeader = get('svix-signature') || get('x-ozow-signature') || get('webhook-signature') || '';
  if (!msgId || !timestamp || !signatureHeader) return false;

  const secretB64 = OZOW_WEBHOOK_SECRET.startsWith('whsec_')
    ? OZOW_WEBHOOK_SECRET.slice('whsec_'.length)
    : OZOW_WEBHOOK_SECRET;
  const key = Buffer.from(secretB64, 'base64');
  const signedContent = `${msgId}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest();

  // Header may carry several space-separated versioned signatures.
  for (const part of String(signatureHeader).split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    let supplied;
    try {
      supplied = Buffer.from(sig, 'base64');
    } catch {
      continue;
    }
    if (supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)) {
      return true;
    }
  }
  return false;
}

// The webhook body shape isn't pinned down in Ozow's docs, so pull our
// merchantReference (top_/tco_ prefix) from wherever it appears. The webhook
// is only ever treated as a "go check now" signal — index.js always
// re-confirms via getCheckoutStatus() before crediting anything, never
// trusting a status field embedded in the webhook body itself.
function extractExternalReference(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [
    payload.merchantReference,
    payload.data?.merchantReference,
    payload.payment?.merchantReference,
    payload.transaction?.merchantReference,
    payload.data?.payment?.merchantReference,
    payload.data?.transaction?.merchantReference,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c) return c;
  }
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
