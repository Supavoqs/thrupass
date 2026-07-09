import React, { useState } from 'react';
import { api, SITE_URL } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';

const TIER_OPTIONS = ['GA', 'VIP', 'VVIP'];
const ADD_ON_OPTIONS = [
  { value: 'COOLER', label: 'Add cooler' },
  { value: 'PARKING', label: 'Add parking' },
];

function toggle(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function chipStyle(active) {
  return {
    padding: '8px 16px',
    borderRadius: 999,
    background: active ? colors.lime : 'transparent',
    color: active ? '#0B0C0E' : colors.textMid,
    fontWeight: 700,
    fontSize: 13,
    border: active ? 'none' : `1px solid ${colors.border}`,
    cursor: 'pointer',
    fontFamily: "'Space Grotesk',sans-serif",
  };
}

export default function CreateEventPanel() {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [selectedTiers, setSelectedTiers] = useState(['GA']);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [zones, setZones] = useState('Main, Camp, Bar');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  function splitList(str) {
    return str
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const zoneList = splitList(zones);
    if (!name.trim() || !startDate || !endDate || selectedTiers.length === 0 || zoneList.length === 0) {
      setError('Fill in name, dates, at least one tier, and at least one zone.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const event = await api.createEvent({
        name: name.trim(),
        startDate,
        endDate,
        location: location.trim() || undefined,
        tiers: selectedTiers,
        zones: zoneList,
        addOns: selectedAddOns,
      });
      if (event.error) {
        setError('Something went wrong. Try again.');
        return;
      }
      setCreated(event);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setCreated(null);
    setName('');
    setStartDate('');
    setEndDate('');
    setLocation('');
    setSelectedTiers(['GA']);
    setSelectedAddOns([]);
    setZones('Main, Camp, Bar');
    setLinkCopied(false);
  }

  function shareLink(eventId) {
    return `${SITE_URL}/app/?event=${encodeURIComponent(eventId)}`;
  }

  async function onCopyLink() {
    const link = shareLink(created.id);
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      window.prompt('Copy this link:', link);
    }
  }

  return (
    <div style={cardStyle(460)}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
        Create event & sell tickets
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        Set up a new event — tiers and zones drive ticket issuance and gate access control.
      </div>

      {created ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ borderRadius: 14, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, padding: 16 }}>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>Event created</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 18, color: colors.textPrimary }}>{created.name}</div>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
              {created.startDate} – {created.endDate}{created.location ? ` · ${created.location}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {created.tiers.map((t) => (
                <span key={t} style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(200,255,61,0.14)', color: colors.lime, fontSize: 12, fontWeight: 700 }}>{t}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {created.zones.map((z) => (
                <span key={z} style={{ padding: '4px 10px', borderRadius: 999, background: colors.borderSoft, color: colors.textMid, fontSize: 12, fontWeight: 600 }}>{z}</span>
              ))}
            </div>
            {created.addOns.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {created.addOns.map((a) => (
                  <span key={a} style={{ padding: '4px 10px', borderRadius: 999, background: colors.borderSoft, color: colors.cyan, fontSize: 12, fontWeight: 600 }}>
                    {ADD_ON_OPTIONS.find((o) => o.value === a)?.label || a}
                  </span>
                ))}
              </div>
            )}
            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: colors.lime, marginTop: 10 }}>{created.id}</div>
          </div>

          <div style={{ borderRadius: 14, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, padding: 16 }}>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>Share this event with attendees</div>
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
              }}
            >
              {shareLink(created.id)}
            </div>
            <button onClick={onCopyLink} style={{ ...btnStyle(colors.lime, '#0B0C0E'), width: '100%', marginTop: 10 }}>
              {linkCopied ? 'Copied!' : 'Copy link'}
            </button>
          </div>

          <button onClick={reset} style={btnStyle('transparent', colors.textMid, true)}>Create another</button>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={labelStyle()}>Event name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Electric Valley '27" style={fieldStyle()} />

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 140px', minWidth: 0 }}>
              <label style={labelStyle()}>Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={fieldStyle()} />
            </div>
            <div style={{ flex: '1 1 140px', minWidth: 0 }}>
              <label style={labelStyle()}>End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={fieldStyle()} />
            </div>
          </div>

          <label style={labelStyle()}>Location (optional)</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Franschhoek" style={fieldStyle()} />

          <label style={labelStyle()}>Ticket tiers</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TIER_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTiers((prev) => toggle(prev, t))}
                style={chipStyle(selectedTiers.includes(t))}
              >
                {t}
              </button>
            ))}
          </div>

          <label style={labelStyle()}>Add-ons (optional)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ADD_ON_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedAddOns((prev) => toggle(prev, opt.value))}
                style={chipStyle(selectedAddOns.includes(opt.value))}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label style={labelStyle()}>Access zones (comma separated)</label>
          <input value={zones} onChange={(e) => setZones(e.target.value)} placeholder="Main, Camp, Bar" style={fieldStyle()} />

          {error && <div style={{ fontSize: 13, color: colors.redLight }}>{error}</div>}
          <button type="submit" disabled={submitting} style={btnStyle(colors.lime, '#0B0C0E')}>
            {submitting ? 'Creating…' : 'Create event'}
          </button>
        </form>
      )}
    </div>
  );
}
