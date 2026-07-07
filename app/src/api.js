import { Platform } from 'react-native';

// Android emulators reach the host machine's localhost via 10.0.2.2. Web and
// iOS simulator both share the host network namespace, so localhost works.
const HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const BASE = `http://${HOST}:4000`;

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
};

export const DEMO_ACCOUNT_ID = 'acc_naledi';
export const GATE_ID = 'gate-b-lane-3';
