// Which account this browser is "logged in" as. There's no real auth here —
// just a locally remembered account id from the last successful signup, so a
// returning visitor on the same device skips straight to their wallet.
const KEY = 'thrupass-account-id';

export function getStoredAccountId() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(KEY);
}

export function setStoredAccountId(id) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, id);
}

export function clearStoredAccountId() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEY);
}
