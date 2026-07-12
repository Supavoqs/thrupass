import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';

export default function TeamPanel({ host }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [barTabEvents, setBarTabEvents] = useState([]);
  const [loadingBarTabEvents, setLoadingBarTabEvents] = useState(true);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [barTabEventId, setBarTabEventId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [justCreated, setJustCreated] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  async function refresh() {
    setError(null);
    try {
      const rows = await api.listTeamMembers(host.id);
      if (rows.error) {
        setError('Could not load your team.');
        return;
      }
      setMembers(rows);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function refreshBarTabEvents() {
    setLoadingBarTabEvents(true);
    api.listBarTabEvents()
      .then((list) => { if (Array.isArray(list)) setBarTabEvents(list); })
      .catch(() => {})
      .finally(() => setLoadingBarTabEvents(false));
  }

  useEffect(() => {
    refresh();
    refreshBarTabEvents();
  }, []);

  async function onAdd() {
    if (!name.trim() || !barTabEventId) return;
    setCreating(true);
    setCreateError(null);
    setJustCreated(null);
    try {
      const created = await api.createTeamMember(host.id, name.trim(), role.trim(), barTabEventId);
      if (created.error) {
        setCreateError('Could not add that team member. Try again.');
        return;
      }
      setName('');
      setRole('');
      setJustCreated(created);
      await refresh();
    } catch {
      setCreateError('Could not reach the server. Try again.');
    } finally {
      setCreating(false);
    }
  }

  async function onCopyLink(member) {
    try {
      await navigator.clipboard.writeText(member.accessUrl);
      setCopiedId(member.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      window.prompt('Copy this link:', member.accessUrl);
    }
  }

  async function onToggleActive(member) {
    setBusyId(member.id);
    try {
      await api.setTeamMemberActive(member.id, host.id, !member.active);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function onRemove(member) {
    setBusyId(member.id);
    try {
      await api.deleteTeamMember(member.id, host.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={cardStyle(480)}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
        My Access Team
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        Add event staff here and share their link. The first time they open it they set up their own email and
        password; after that, the same link logs them straight into a scan-only view (gate entries and Bar Tab QR
        codes) — no host login and none of your other tabs.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 2 }}>
          <label style={labelStyle()}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Thabo Nkosi"
            style={{ ...fieldStyle(), marginTop: 4 }}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle()}>Role (optional)</label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Gate Staff"
            style={{ ...fieldStyle(), marginTop: 4 }}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          />
        </div>
      </div>

      <label style={labelStyle()}>Bar Tab Event</label>
      <select
        value={barTabEventId}
        onChange={(e) => setBarTabEventId(e.target.value)}
        style={{ ...fieldStyle(), marginTop: 4, marginBottom: 10 }}
      >
        <option value="">{loadingBarTabEvents ? 'Loading…' : 'Choose a bar…'}</option>
        {barTabEvents.map((ev) => (
          <option key={ev.id} value={ev.id}>{ev.name}</option>
        ))}
      </select>
      <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 10 }}>
        This member will only ever see and scan this one bar — not any other event on the platform.
      </div>
      {!loadingBarTabEvents && barTabEvents.length === 0 && (
        <div style={{ fontSize: 13, color: colors.redLight, marginBottom: 12 }}>
          Create a Bar Tab Event first, from the "Create Bar Tab Event" tab, before adding staff.
        </div>
      )}

      {createError && <div style={{ fontSize: 13, color: colors.redLight, marginBottom: 12 }}>{createError}</div>}
      <button onClick={onAdd} disabled={creating || !name.trim() || !barTabEventId} style={{ ...btnStyle(colors.lime, '#0B0C0E'), width: '100%', marginBottom: 18 }}>
        {creating ? 'Adding…' : 'Add team member'}
      </button>

      {justCreated && (
        <div style={{ borderRadius: 14, background: 'rgba(87,227,138,0.12)', border: '1px solid rgba(87,227,138,0.3)', padding: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: colors.green, marginBottom: 8, fontWeight: 700 }}>
            {justCreated.name} added — share this link with them:
          </div>
          <div
            style={{
              fontFamily: "'Space Mono',monospace",
              fontSize: 12,
              color: colors.textMid,
              background: colors.surfaceDeep,
              border: `1px solid ${colors.borderSoft}`,
              borderRadius: 10,
              padding: '10px 12px',
              wordBreak: 'break-all',
              marginBottom: 10,
            }}
          >
            {justCreated.accessUrl}
          </div>
          <button onClick={() => onCopyLink(justCreated)} style={{ ...btnStyle(colors.lime, '#0B0C0E'), width: '100%' }}>
            {copiedId === justCreated.id ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      )}

      {error && <div style={{ fontSize: 13, color: colors.redLight, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ fontSize: 13, color: colors.textSecondary }}>Loading…</div>
      ) : members.length === 0 ? (
        <div style={{ fontSize: 13, color: colors.textSecondary }}>No team members yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {members.map((m) => (
            <div
              key={m.id}
              style={{ borderRadius: 14, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15, color: colors.textPrimary }}>{m.name}</div>
                  <div style={{ fontSize: 13, color: colors.textSecondary }}>{m.role} · {m.barTabEventName || 'No bar assigned'}</div>
                  <div style={{ fontSize: 12, color: colors.textDim, marginTop: 2 }}>
                    {m.claimed ? m.email : 'Not yet set up'}
                  </div>
                </div>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    background: m.active ? 'rgba(87,227,138,0.14)' : colors.borderSoft,
                    color: m.active ? colors.green : colors.textDim,
                  }}
                >
                  {m.active ? 'Active' : 'Revoked'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => onCopyLink(m)}
                  style={{ ...btnStyle('transparent', colors.textMid, true), flex: 1, padding: '10px 14px' }}
                >
                  {copiedId === m.id ? 'Copied!' : 'Copy link'}
                </button>
                <button
                  onClick={() => onToggleActive(m)}
                  disabled={busyId === m.id}
                  style={{ ...btnStyle('transparent', m.active ? colors.redLight : colors.green, true), flex: 1, padding: '10px 14px' }}
                >
                  {m.active ? 'Revoke' : 'Reactivate'}
                </button>
                <button
                  onClick={() => onRemove(m)}
                  disabled={busyId === m.id}
                  style={{ ...btnStyle('transparent', colors.textDim, true), padding: '10px 14px' }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={refresh} style={{ ...btnStyle('transparent', colors.textMid, true), marginTop: 16, width: '100%' }}>
        Refresh
      </button>
    </div>
  );
}
