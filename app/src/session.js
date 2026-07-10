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

// Which shared link an attendee registered through — a ticketed event or a
// Bar Tab Event — so the wallet can offer a quick "Go to linked event"
// shortcut back to it after signup.
const LINKED_ENTRY_KEY = 'thrupass-linked-entry';

export function getLinkedEntry() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(LINKED_ENTRY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setLinkedEntry(entry) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LINKED_ENTRY_KEY, JSON.stringify(entry));
}
