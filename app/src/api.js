import { Platform } from 'react-native';

// EXPO_PUBLIC_ vars are inlined at build time (works for the web export too).
// Falls back to sensible local-dev defaults: Android emulators reach the host
// machine's localhost via 10.0.2.2, everything else shares the host network.
const HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const BASE = process.env.EXPO_PUBLIC_API_URL || `https://thrupass.co.za`;

const HANDLED_ERROR_STATUSES = [400, 401, 404, 409, 502];

async function toJson(res) {
  if (!res.ok && !HANDLED_ERROR_STATUSES.includes(res.status)) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  getAccount: (accountId) => fetch(`${BASE}/accounts/${accountId}`).then(toJson),

  scan: (gateId, uid) =>
    fetch(`${BASE}/gates/${gateId}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    }).then(toJson),

  createTopupCheckout: (accountId, amountCents) =>
    fetch(`${BASE}/accounts/${accountId}/topup/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_cents: amountCents }),
    }).then(toJson),

  getTopupStatus: (topupId) => fetch(`${BASE}/topups/${topupId}`).then(toJson),

  createAccount: (holder, email, password, eventId, tier, addOns) =>
    fetch(`${BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holder, email, password, eventId, tier, addOns }),
    }).then(toJson),

  loginAccount: (email, password) =>
    fetch(`${BASE}/accounts/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(toJson),

  cashout: (accountId, amountCents) =>
    fetch(`${BASE}/accounts/${accountId}/cashout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_cents: amountCents }),
    }).then(toJson),

  listEvents: () => fetch(`${BASE}/events`).then(toJson),

  removeTicket: (accountId) => fetch(`${BASE}/accounts/${accountId}/ticket`, { method: 'DELETE' }).then(toJson),

  buyTicket: (accountId, eventId, tier, addOns) =>
    fetch(`${BASE}/accounts/${accountId}/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, tier, addOns }),
    }).then(toJson),

  getBarTabEvent: (id) => fetch(`${BASE}/bar-tab-events/${id}`).then(toJson),

  getDrinkTab: (accountId, barTabEventId) =>
    fetch(`${BASE}/accounts/${accountId}/drinks?barTabEventId=${encodeURIComponent(barTabEventId)}`).then(toJson),
};

export const GATE_ID = 'gate-b-lane-3';

// The API host doubles as the site's own domain in production — reused for
// building a "return home" link back to the landing page.
export const SITE_URL = BASE;
