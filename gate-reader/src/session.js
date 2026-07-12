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

// Which team-member access link this browser opened, gating the restricted
// scan-only kiosk view (no host login, no event-management tabs).
const TEAM_KEY = 'thrupass-team-member';

export function getStoredTeamMember() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(TEAM_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredTeamMember(member) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(TEAM_KEY, JSON.stringify(member));
}

export function clearStoredTeamMember() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(TEAM_KEY);
}
