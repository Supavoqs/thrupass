const crypto = require('node:crypto');

// All Ozow credentials come from environment variables — never commit real
// values. Get these from the Ozow merchant dashboard once your account is
// approved. Docs: https://docs.ozow.com
const {
  OZOW_SITE_CODE,
  OZOW_PRIVATE_KEY,
  OZOW_API_KEY,
  OZOW_API_BASE_URL = 'https://api.ozow.com',
  OZOW_IS_TEST = 'false',
} = process.env;

function assertConfigured() {
  const missing = ['OZOW_SITE_CODE', 'OZOW_PRIVATE_KEY', 'OZOW_API_KEY']
    .filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Ozow is not configured — missing env vars: ${missing.join(', ')}`);
  }
}

// Ozow's hash scheme (used both to sign our own PostPaymentRequest and to
// verify what Ozow sends back) is: concatenate a fixed, ordered list of field
// values (empty string for anything absent), append the private key, lowercase
// the whole string, then SHA512 it. There is no bearer token here — the hash
// itself, generated from the shared private key, is the proof of authenticity
// on both sides.
function buildHash(values) {
  const message = values.join('') + OZOW_PRIVATE_KEY;
  return crypto.createHash('sha512').update(message.toLowerCase()).digest('hex');
}

// Hosted/redirect checkout: the shopper is sent to Ozow's own EFT "Pay by
// Bank" page, then redirected back to one of successUrl/cancelUrl/errorUrl.
// A server-to-server notify webhook (registered as the Notify URL on the Ozow
// dashboard) is the authoritative confirmation — the redirect alone is not
// proof of payment, since a shopper can close the tab or the redirect can
// fail to fire.
async function createCheckout({ amountCents, currency, externalReference, shopperResultUrl }) {
  assertConfigured();
  if (currency !== 'ZAR') {
    throw new Error(`Ozow only supports ZAR — got ${currency}`);
  }

  const countryCode = 'ZA';
  const currencyCode = 'ZAR';
  const amount = (amountCents / 100).toFixed(2);
  const transactionReference = externalReference;
  const bankReference = externalReference.slice(0, 20);
  const optional1 = '';
  const optional2 = '';
  const optional3 = '';
  const optional4 = '';
  const optional5 = '';
  const customer = '';
  const cancelUrl = shopperResultUrl;
  const errorUrl = shopperResultUrl;
  const successUrl = shopperResultUrl;
  const notifyUrl = `${new URL(shopperResultUrl).origin}/webhooks/ozow`;
  const isTest = OZOW_IS_TEST === 'true' ? 'true' : 'false';

  const hashCheck = buildHash([
    OZOW_SITE_CODE,
    countryCode,
    currencyCode,
    amount,
    transactionReference,
    bankReference,
    optional1,
    optional2,
    optional3,
    optional4,
    optional5,
    customer,
    cancelUrl,
    errorUrl,
    successUrl,
    notifyUrl,
    isTest,
  ]);

  const res = await fetch(`${OZOW_API_BASE_URL}/postpaymentrequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ApiKey: OZOW_API_KEY, Accept: 'application/json' },
    body: JSON.stringify({
      siteCode: OZOW_SITE_CODE,
      countryCode,
      currencyCode,
      amount,
      transactionReference,
      bankReference,
      optional1,
      optional2,
      optional3,
      optional4,
      optional5,
      customer,
      cancelUrl,
      errorUrl,
      successUrl,
      notifyUrl,
      isTest,
      hashCheck,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errorMessage) {
    const err = new Error(`Ozow payment request creation failed: ${res.status}`);
    err.details = data;
    throw err;
  }

  return {
    checkoutId: data.transactionId || data.paymentRequestId,
    redirectUrl: data.url || null,
    raw: data,
  };
}

// Ozow's own status values, lowercased. "PendingInvestigation" is a real,
// non-terminal Ozow status (used when they need extra time to confirm with
// the bank) — not our own local "pending" record status, which is a
// different, unrelated state.
function normalizeStatus(status) {
  return typeof status === 'string' ? status.toLowerCase() : '';
}

function isSuccessStatus(status) {
  return normalizeStatus(status) === 'complete';
}

function isTerminalStatus(status) {
  return ['complete', 'cancelled', 'error', 'abandoned'].includes(normalizeStatus(status));
}

// GetTransactionStatus — the authoritative re-check, used the same way the
// webhook is: a signal to go verify, never the sole source of truth.
async function getCheckoutStatus(checkoutId) {
  assertConfigured();
  const res = await fetch(`${OZOW_API_BASE_URL}/GetTransactionStatus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ApiKey: OZOW_API_KEY, Accept: 'application/json' },
    body: JSON.stringify({ siteCode: OZOW_SITE_CODE, transactionReference: checkoutId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Ozow status check failed: ${res.status}`);
    err.details = data;
    throw err;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { status: row?.status, raw: row };
}

// Ozow's notify webhook POSTs application/x-www-form-urlencoded fields
// (already parsed into req.body by express.urlencoded()) including a `Hash`
// field. Verify by recomputing the same ordered-concatenation SHA512 over
// every other field (excluding Hash itself) and comparing.
function verifyWebhookSignature({ body }) {
  if (!OZOW_PRIVATE_KEY || !body || !body.Hash) return false;
  const expected = buildHash([
    body.SiteCode,
    body.TransactionId,
    body.TransactionReference,
    body.Amount,
    body.Status,
    body.Optional1,
    body.Optional2,
    body.Optional3,
    body.Optional4,
    body.Optional5,
    body.CurrencyCode,
    body.IsTest,
    body.StatusMessage,
  ].map((v) => v ?? ''));

  const expectedBuf = Buffer.from(expected, 'hex');
  const suppliedBuf = Buffer.from(String(body.Hash), 'hex');
  return expectedBuf.length === suppliedBuf.length && crypto.timingSafeEqual(expectedBuf, suppliedBuf);
}

// The notify body's TransactionReference is exactly the externalReference we
// generated when creating the checkout (top_/tco_ prefix) — no extra
// unwrapping needed, unlike Stitch's nested GraphQL-shaped webhook payload.
function extractExternalReference(body) {
  return body && typeof body.TransactionReference === 'string' ? body.TransactionReference : null;
}

module.exports = {
  createCheckout,
  getCheckoutStatus,
  isSuccessStatus,
  isTerminalStatus,
  verifyWebhookSignature,
  extractExternalReference,
};
