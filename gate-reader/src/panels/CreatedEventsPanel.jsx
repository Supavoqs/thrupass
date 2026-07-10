import React, { useEffect, useState } from 'react';
import { api, SITE_URL } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';
import { PRICE_ROWS } from './CreateEventPanel.jsx';

function fmtPrice(cents) {
  return `R${(cents / 100).toFixed(0)}`;
}

function draftFromEvent(event) {
  const draft = {};
  for (const row of PRICE_ROWS) draft[row.key] = String((event.prices?.[row.key] ?? 0) / 100);
  return draft;
}

export default function CreatedEventsPanel() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [priceDraft, setPriceDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [linkCopiedId, setLinkCopiedId] = useState(null);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    setLoading(true);
    api.listEvents()
      .then((list) => { if (Array.isArray(list)) setEvents(list); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function toggleExpanded(ev) {
    setError(null);
    setSavedId(null);
    if (expandedId === ev.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(ev.id);
    setPriceDraft(draftFromEvent(ev));
  }

  async function onSavePrices(ev) {
    const cents = {};
    for (const row of PRICE_ROWS) {
      const n = parseFloat(priceDraft[row.key]);
      if (!Number.isFinite(n) || n < 0) {
        setError(`Enter a valid price for ${row.label}.`);
        return;
      }
      cents[row.key] = Math.round(n * 100);
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateEventPrices(ev.id, cents);
      if (updated.error) {
        setError('Could not save prices. Try again.');
        return;
      }
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      setSavedId(ev.id);
      setTimeout(() => setSavedId(null), 2500);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function onCopyLink(ev) {
    const link = `${SITE_URL}/app/?event=${encodeURIComponent(ev.id)}`;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopiedId(ev.id);
      setTimeout(() => setLinkCopiedId(null), 2500);
    } catch {
      window.prompt('Copy this link:', link);
    }
  }

  return (
    <div style={cardStyle(520)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary }}>
          Created events
        </div>
        <button onClick={refresh} style={{ ...btnStyle('transparent', colors.textSecondary, true), padding: '6px 12px', fontSize: 12 }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        Every event created on the platform. Open one to set its ticket and add-on prices.
      </div>

      {!loading && events.length === 0 ? (
        <div style={{ fontSize: 13, color: colors.textDim }}>
          No events yet — create one from the "Create event & sell tickets" tab.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map((ev) => {
            const expanded = expandedId === ev.id;
            return (
              <div key={ev.id} style={{ borderRadius: 14, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, padding: 16 }}>
                <div onClick={() => toggleExpanded(ev)} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
                      {ev.name}
                    </div>
                    <span style={{ fontSize: 12, color: colors.textSecondary }}>{expanded ? 'Close' : 'Set prices'}</span>
                  </div>
                  <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
                    {ev.startDate} – {ev.endDate}{ev.location ? ` · ${ev.location}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {ev.tiers.map((t) => (
                      <span key={t} style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(200,255,61,0.14)', color: colors.lime, fontSize: 12, fontWeight: 700 }}>
                        {t} — {fmtPrice(ev.prices?.[t] || 0)}
                      </span>
                    ))}
                    {ev.addOns.map((a) => (
                      <span key={a} style={{ padding: '4px 10px', borderRadius: 999, background: colors.borderSoft, color: colors.cyan, fontSize: 12, fontWeight: 600 }}>
                        {a} — {fmtPrice(ev.prices?.[a] || 0)}
                      </span>
                    ))}
                  </div>
                </div>

                {expanded && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.borderSoft}` }}>
                    <label style={labelStyle()}>Pricing (Rand) — applies to this event only</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                      {PRICE_ROWS.map((row) => (
                        <div
                          key={row.key}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 12, background: colors.surfaceDeep, border: `1px solid ${colors.borderSoft}` }}
                        >
                          <span style={{ fontWeight: 700, fontSize: 13, color: colors.textPrimary, fontFamily: "'Space Grotesk',sans-serif" }}>{row.label}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, color: colors.textSecondary }}>R</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={priceDraft[row.key] ?? ''}
                              onChange={(e) => setPriceDraft((prev) => ({ ...prev, [row.key]: e.target.value }))}
                              style={{ ...fieldStyle(), width: 90, textAlign: 'right' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {error && <div style={{ fontSize: 13, color: colors.redLight, marginTop: 12 }}>{error}</div>}
                    {savedId === ev.id && (
                      <div style={{ fontSize: 13, color: colors.green, marginTop: 12 }}>Prices saved.</div>
                    )}

                    <button onClick={() => onSavePrices(ev)} disabled={saving} style={{ ...btnStyle(colors.lime, '#0B0C0E'), width: '100%', marginTop: 12 }}>
                      {saving ? 'Saving…' : 'Save prices'}
                    </button>
                    <button onClick={() => onCopyLink(ev)} style={{ ...btnStyle('transparent', colors.textMid, true), width: '100%', marginTop: 8 }}>
                      {linkCopiedId === ev.id ? 'Copied!' : 'Copy share link'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
