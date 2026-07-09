import React, { useState } from 'react';
import { api } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';

export default function CreateEventPanel() {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [tiers, setTiers] = useState('GA, VIP');
  const [zones, setZones] = useState('Main, Camp, Bar');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  function splitList(str) {
    return str
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const tierList = splitList(tiers);
    const zoneList = splitList(zones);
    if (!name.trim() || !startDate || !endDate || tierList.length === 0 || zoneList.length === 0) {
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
        tiers: tierList,
        zones: zoneList,
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
    setTiers('GA, VIP');
    setZones('Main, Camp, Bar');
  }

  return (
    <div style={cardStyle(460)}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
        Create event
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
            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: colors.lime, marginTop: 10 }}>{created.id}</div>
          </div>
          <button onClick={reset} style={btnStyle('transparent', colors.textMid, true)}>Create another</button>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={labelStyle()}>Event name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Electric Valley '27" style={fieldStyle()} />

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle()}>Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={fieldStyle()} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle()}>End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={fieldStyle()} />
            </div>
          </div>

          <label style={labelStyle()}>Location (optional)</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Franschhoek" style={fieldStyle()} />

          <label style={labelStyle()}>Ticket tiers (comma separated)</label>
          <input value={tiers} onChange={(e) => setTiers(e.target.value)} placeholder="GA, VIP" style={fieldStyle()} />

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
