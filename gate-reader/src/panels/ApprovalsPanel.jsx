import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, cardStyle } from './shared.js';

export default function ApprovalsPanel({ host }) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    setError(null);
    try {
      const rows = await api.listPendingHosts(host.id);
      if (rows.error) {
        setError('Could not load pending requests.');
        return;
      }
      setPending(rows);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onApprove(id) {
    setBusyId(id);
    try {
      await api.approveHost(id, host.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(id) {
    setBusyId(id);
    try {
      await api.rejectHost(id, host.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={cardStyle(460)}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
        Host approvals
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        New host signups wait here until an existing host approves them.
      </div>

      {error && <div style={{ fontSize: 13, color: colors.redLight, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ fontSize: 13, color: colors.textSecondary }}>Loading…</div>
      ) : pending.length === 0 ? (
        <div style={{ fontSize: 13, color: colors.textSecondary }}>No pending requests.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.map((p) => (
            <div
              key={p.id}
              style={{ borderRadius: 14, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15, color: colors.textPrimary }}>{p.name}</div>
                <div style={{ fontSize: 13, color: colors.textSecondary }}>{p.email}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => onApprove(p.id)}
                  disabled={busyId === p.id}
                  style={{ ...btnStyle(colors.lime, '#0B0C0E'), flex: 1, padding: '10px 14px' }}
                >
                  Approve
                </button>
                <button
                  onClick={() => onReject(p.id)}
                  disabled={busyId === p.id}
                  style={{ ...btnStyle('transparent', colors.redLight, true), flex: 1, padding: '10px 14px' }}
                >
                  Reject
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
