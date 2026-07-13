// In dev, Vite proxies /api to the local server (see vite.config.js). In a
// static production build (e.g. GitHub Pages) there's no dev proxy, so the
// full backend URL must be supplied at build time.
const BASE = import.meta.env.VITE_API_URL || 'https://thrupass.co.za';

// The API host doubles as the site's own domain in production (landing page,
// /client/, /app/ are all served from the same origin) — reused for building
// links back to the site (share links, "return home").
export const SITE_URL = BASE;

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

  updateEventPrices: (id, pricesCents) =>
    fetch(`${BASE}/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices: pricesCents }),
    }).then(json),

  deleteEvent: (id, approverId) =>
    fetch(`${BASE}/events/${id}?approverId=${encodeURIComponent(approverId)}`, { method: 'DELETE' }).then(json),

  createHost: (name, email, password, organisation, position, address) =>
    fetch(`${BASE}/hosts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, organisation, position, address }),
    }).then(json),

  loginHost: (email, password) =>
    fetch(`${BASE}/hosts/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(json),

  listPendingHosts: (approverId) =>
    fetch(`${BASE}/hosts/pending?approverId=${encodeURIComponent(approverId)}`).then(json),

  approveHost: (id, approverId) =>
    fetch(`${BASE}/hosts/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approverId }),
    }).then(json),

  rejectHost: (id, approverId) =>
    fetch(`${BASE}/hosts/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approverId }),
    }).then(json),

  listTeamMembers: (hostId) => fetch(`${BASE}/team-members?hostId=${encodeURIComponent(hostId)}`).then(json),

  createTeamMember: (hostId, name, role, barTabEventId) =>
    fetch(`${BASE}/team-members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostId, name, role, barTabEventId }),
    }).then(json),

  setTeamMemberActive: (id, hostId, active) =>
    fetch(`${BASE}/team-members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostId, active }),
    }).then(json),

  deleteTeamMember: (id, hostId) =>
    fetch(`${BASE}/team-members/${id}?hostId=${encodeURIComponent(hostId)}`, { method: 'DELETE' }).then(json),

  getTeamAccess: (token) => fetch(`${BASE}/team-members/access/${encodeURIComponent(token)}`).then(json),

  claimTeamAccess: (token, email, password) =>
    fetch(`${BASE}/team-members/access/${encodeURIComponent(token)}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(json),

  loginTeamMember: (email, password) =>
    fetch(`${BASE}/team-members/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(json),

  getAccountByTag: (uid) => fetch(`${BASE}/tags/${encodeURIComponent(uid)}`).then(json),

  lookupAccountByEmail: (email, hostId) =>
    fetch(`${BASE}/accounts/lookup?email=${encodeURIComponent(email)}&hostId=${encodeURIComponent(hostId)}`).then(json),

  linkTag: (uid, accountId) =>
    fetch(`${BASE}/tags/${encodeURIComponent(uid)}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId }),
    }).then(json),

  getDrinkTab: (accountId, barTabEventId) =>
    fetch(`${BASE}/accounts/${accountId}/drinks?barTabEventId=${encodeURIComponent(barTabEventId)}`).then(json),

  addDrink: (accountId, drinkType, barTabEventId) =>
    fetch(`${BASE}/accounts/${accountId}/drinks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drink_type: drinkType, bar_tab_event_id: barTabEventId }),
    }).then(json),

  createBarTabEvent: (name) =>
    fetch(`${BASE}/bar-tab-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(json),

  updateBarTabEventMaxes: (id, maxByDrink) =>
    fetch(`${BASE}/bar-tab-events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beersMax: maxByDrink.BEERS,
        cidersMax: maxByDrink.CIDERS,
        spiritsMax: maxByDrink.SPIRITS,
      }),
    }).then(json),

  listBarTabEvents: () => fetch(`${BASE}/bar-tab-events`).then(json),

  getBarTabEvent: (id) => fetch(`${BASE}/bar-tab-events/${id}`).then(json),

  listBarTabEventRsvps: (id) => fetch(`${BASE}/bar-tab-events/${id}/rsvps`).then(json),

  createVendor: (name) =>
    fetch(`${BASE}/vendors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(json),

  listVendors: () => fetch(`${BASE}/vendors`).then(json),

  getVendor: (id) => fetch(`${BASE}/vendors/${id}`).then(json),

  updateVendorSettlement: (id, commissionPct, bankingFeePct) =>
    fetch(`${BASE}/vendors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commissionPct, bankingFeePct }),
    }).then(json),

  addVendorItem: (id, name, priceCents) =>
    fetch(`${BASE}/vendors/${id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, priceCents }),
    }).then(json),

  updateVendorItem: (id, itemId, patch) =>
    fetch(`${BASE}/vendors/${id}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(json),

  deleteVendorItem: (id, itemId) =>
    fetch(`${BASE}/vendors/${id}/items/${itemId}`, { method: 'DELETE' }).then(json),

  vendorSale: (id, uid, cart, cashierName) =>
    fetch(`${BASE}/vendors/${id}/sale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, cart, cashierName }),
    }).then(json),

  getVendorSales: (id) => fetch(`${BASE}/vendors/${id}/sales`).then(json),

  getVendorSummary: (id) => fetch(`${BASE}/vendors/${id}/summary`).then(json),

  getPricing: () => fetch(`${BASE}/pricing`).then(json),

  updatePricing: (patch) =>
    fetch(`${BASE}/pricing`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(json),

  getTicketRevenue: () => fetch(`${BASE}/pricing/ticket-revenue`).then(json),
};
