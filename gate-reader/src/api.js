// In dev, Vite proxies /api to the local server (see vite.config.js). In a
// static production build (e.g. GitHub Pages) there's no dev proxy, so the
// full backend URL must be supplied at build time.
const BASE = import.meta.env.VITE_API_URL || 'https://thrupass.co.za';

const HANDLED_ERROR_STATUSES = [400, 401, 403, 404, 409];

async function json(res) {
  if (!res.ok && !HANDLED_ERROR_STATUSES.includes(res.status)) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  scan: (gateId, uid) =>
    fetch(`${BASE}/gates/${gateId}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    }).then(json),

  recent: (gateId) => fetch(`${BASE}/gates/${gateId}/recent`).then(json),

  lastScan: (gateId) => fetch(`${BASE}/gates/${gateId}/last-scan`).then(json),

  stats: (gateId) => fetch(`${BASE}/gates/${gateId}/stats`).then(json),

  block: (uid) => fetch(`${BASE}/tags/${encodeURIComponent(uid)}/block`, { method: 'POST' }).then(json),

  getAccount: (accountId) => fetch(`${BASE}/accounts/${accountId}`).then(json),

  cashout: (accountId, amountCents) =>
    fetch(`${BASE}/accounts/${accountId}/cashout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_cents: amountCents }),
    }).then(json),

  createEvent: (event) =>
    fetch(`${BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }).then(json),

  listEvents: () => fetch(`${BASE}/events`).then(json),

  createHost: (name, email, password, inviteCode) =>
    fetch(`${BASE}/hosts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, inviteCode }),
    }).then(json),

  loginHost: (email, password) =>
    fetch(`${BASE}/hosts/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(json),
};
