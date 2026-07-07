const BASE = '/api';

async function json(res) {
  if (!res.ok && res.status !== 400 && res.status !== 404) {
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
};
