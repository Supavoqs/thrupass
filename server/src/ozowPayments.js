const crypto = require('node:crypto');

// All Ozow credentials come from environment variables — never commit real
// values. This targets Ozow's Payin API (hub.ozow.com/docs/payin-api): the
// SiteCode / Private Key / API Key trio, all self-service from the Ozow
// Merchant Dashboard. Point OZOW_API_BASE_URL at
// https://stagingapi.ozow.com (with your STAGING keys) to test, and leave it
// unset (production api.ozow.com, production keys) to go live.
const {
  OZOW_SITE_CODE,
  OZOW_PRIVATE_KEY,
  OZOW_API_KEY,
  OZOW_API_BASE_URL = 'https://api.ozow.com',
  OZOW_IS_TEST = 'false',
} = process.env;

const IS_TEST = OZOW_IS_TEST === 'true';

function assertConfigured() {
  const missing = ['OZOW_SITE_CODE', 'OZOW_PRIVATE_KEY', 'OZOW_API_KEY']
    .filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Ozow is not configured — missing env vars: ${missing.join(', ')}`);
  }
}

// Ozow's hash scheme, used both to sign our PostPaymentRequest and to verify
// their notification webhook: concatenate the field values actually sent (in
// the order of Ozow's field table, skipping omitted optionals — never empty
// placeholders), append the private key, lowercase everything, SHA512 → hex.
// Booleans must be the strings 'true'/'false', never 0/1.
function sha512Lower(values) {
  const message = values.join('') + OZOW_PRIVATE_KEY;
  return crypto.createHash('sha512').update(message.toLowerCase()).digest('hex');
}

// Ozow's docs warn that some SHA512 implementations drop leading zeros, and
// advise trimming them from both sides before comparing.
function hashesMatch(expected, supplied) {
  const a = String(expected).toLowerCase().replace(/^0+/, '');
  const b = String(supplied).toLowerCase().replace(/^0+/, '');
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Hosted/redirect checkout: POST /PostPaymentRequest returns a one-time pay
// URL on Ozow's own EFT page; the shopper is sent there and redirected back
// to our return page whether the payment succeeded, was cancelled, or
// errored. The redirect alone is never proof of payment — the notification
// webhook and GetTransactionByReference (below) are what settle a checkout.
async function createCheckout({ amountCents, currency, externalReference, shopperResultUrl }) {
  assertConfigured();
  if (currency !== 'ZAR') {
    throw new Error(`Ozow only supports ZAR — got ${currency}`);
  }

  const countryCode = 'ZA';
  const currencyCode = 'ZAR';
  // The amount participates in the hash as its exact string representation,
  // so it is spliced into the JSON body as a raw number literal ("300.00",
  // unquoted) rather than run through JSON.stringify, which would strip the
  // trailing zeros ("300") and make Ozow's server-side hash check fail.
  const amountStr = (amountCents / 100).toFixed(2);
  const transactionReference = externalReference;
  // Shows on the customer's bank statement; Ozow only allows alphanumerics,
  // spaces and dashes here (our ids contain underscores), max 20 chars.
  const bankReference = externalReference.replace(/[^a-zA-Z0-9 -]/g, '-').slice(0, 20);
  const cancelUrl = shopperResultUrl;
  const errorUrl = shopperResultUrl;
  const successUrl = shopperResultUrl;
  const notifyUrl = `${new URL(shopperResultUrl).origin}/webhooks/ozow`;

  const hashCheck = sha512Lower([
    OZOW_SITE_CODE,
    countryCode,
    currencyCode,
    amountStr,
    transactionReference,
    bankReference,
    cancelUrl,
    errorUrl,
    successUrl,
    notifyUrl,
    IS_TEST ? 'true' : 'false',
  ]);

  const body = JSON.stringify({
    siteCode: OZOW_SITE_CODE,
    countryCode,
    currencyCode,
    amount: '__OZOW_AMOUNT__',
    transactionReference,
    bankReference,
    cancelUrl,
    errorUrl,
    successUrl,
    notifyUrl,
    isTest: IS_TEST,
    hashCheck,
  }).replace('"__OZOW_AMOUNT__"', amountStr);

  const res = await fetch(`${OZOW_API_BASE_URL}/PostPaymentRequest`, {
    method: 'POST',
    headers: { ApiKey: OZOW_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errorMessage || !data.url) {
    const err = new Error(`Ozow payment request creation failed: ${res.status}`);
    err.details = data;
    throw err;
  }

  // checkoutId deliberately echoes our own reference (not paymentRequestId):
  // it lands in the checkout_id DB column, which getCheckoutStatus() below
  // receives back — and Ozow's status lookup is by merchant reference.
  return {
    checkoutId: externalReference,
    redirectUrl: data.url,
    raw: data,
  };
}

function normalizeStatus(status) {
  return typeof status === 'string' ? status.toLowerCase() : '';
}

// Ozow transaction statuses: Complete (paid), Cancelled, Error, Abandoned,
// PendingInvestigation (inconclusive bank result — needs manual review, so
// never auto-settled either way), Pending (still in flight).
function isSuccessStatus(status) {
  return normalizeStatus(status) === 'complete';
}

function isTerminalStatus(status) {
  return ['complete', 'cancelled', 'error', 'abandoned'].includes(normalizeStatus(status));
}

// GetTransactionByReference — the authoritative status re-check, keyed on
// our own reference (top_/tco_ id). It can return several transactions for
// one reference (the shopper may retry after a cancel), so precedence is:
// any Complete wins; otherwise anything still pending keeps the whole
// checkout pending; only when every attempt has terminally failed does the
// failure surface.
async function getCheckoutStatus(reference) {
  assertConfigured();
  const params = new URLSearchParams({ siteCode: OZOW_SITE_CODE, transactionReference: reference });
  if (IS_TEST) params.set('isTest', 'true');
  const res = await fetch(`${OZOW_API_BASE_URL}/GetTransactionByReference?${params}`, {
    headers: { ApiKey: OZOW_API_KEY, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`Ozow status check failed: ${res.status}`);
    err.details = data;
    throw err;
  }

  const transactions = Array.isArray(data) ? data : [];
  if (transactions.some((t) => isSuccessStatus(t.status))) {
    return { status: 'complete', raw: transactions };
  }
  if (transactions.some((t) => !isTerminalStatus(t.status))) {
    return { status: 'pending', raw: transactions };
  }
  const failed = transactions.find((t) => isTerminalStatus(t.status));
  if (failed) {
    return { status: normalizeStatus(failed.status), raw: transactions };
  }
  // No transactions yet — the shopper may not have attempted payment.
  return { status: 'pending', raw: transactions };
}

// Ozow's notification webhook POSTs application/x-www-form-urlencoded fields
// (already parsed into req.body by express.urlencoded()) including a Hash.
// Verification per their "Response hash check": concatenate response fields
// 1 (SiteCode) through 13 (StatusMessage) in POST order — SubStatus,
// MaskedAccountNumber and BankName come after the Hash and are NOT covered —
// append the private key, lowercase, SHA512, compare with leading zeros
// trimmed.
function verifyWebhookSignature({ body }) {
  if (!OZOW_PRIVATE_KEY || !body || !body.Hash) return false;
  const expected = sha512Lower([
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
  return hashesMatch(expected, body.Hash);
}

// The notification's TransactionReference is exactly the reference we sent
// when creating the checkout (top_/tco_ prefix). Even after a verified
// signature, index.js treats the webhook only as a "go check now" signal and
// re-confirms via GetTransactionByReference before crediting anything.
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
