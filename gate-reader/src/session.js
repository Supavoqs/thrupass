// Which host this browser is logged in as, gating the Client kiosk's admin
// tabs (Reader, Create event, Cash payout).
const KEY = 'thrupass-host';

export function getStoredHost() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredHost(host) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(host));
}

export function clearStoredHost() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEY);
}
