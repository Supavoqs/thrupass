import { Platform } from 'react-native';

// EXPO_PUBLIC_ vars are inlined at build time (works for the web export too).
// Falls back to sensible local-dev defaults: Android emulators reach the host
// machine's localhost via 10.0.2.2, everything else shares the host network.
const HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const BASE = process.env.EXPO_PUBLIC_API_URL || `https://thrupass.co.za`;

async function toJson(res) {
  if (!res.ok && res.status !== 400 && res.status !== 404) {
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

  topup: (accountId, amountCents) =>
    fetch(`${BASE}/accounts/${accountId}/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_cents: amountCents }),
    }).then(toJson),

  createAccount: (holder, email, eventId, tier) =>
    fetch(`${BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holder, email, eventId, tier }),
    }).then(toJson),

  cashout: (accountId, amountCents) =>
    fetch(`${BASE}/accounts/${accountId}/cashout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_cents: amountCents }),
    }).then(toJson),

  listEvents: () => fetch(`${BASE}/events`).then(toJson),
};

export const GATE_ID = 'gate-b-lane-3';
