import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';

export default function CreateAccountPanel() {
  const [holder, setHolder] = useState('');
  const [email, setEmail] = useState('');
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [tier, setTier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    api.listEvents().then((list) => {
      if (Array.isArray(list)) setEvents(list);
    });
  }, []);

  const selectedEvent = events.find((e) => e.id === eventId) || null;

  async function onSubmit(e) {
    e.preventDefault();
    if (!holder.trim()) {
      setError('Enter a name to register this attendee.');
      return;
    }
    if (eventId && !tier) {
      setError('Pick a ticket tier for the selected event.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const account = await api.createAccount(holder.trim(), email.trim() || undefined, eventId || undefined, tier || undefined);
      if (account.error) {
        setError('Something went wrong. Try again.');
        return;
      }
      setCreated(account);
      setHolder('');
      setEmail('');
      setEventId('');
      setTier('');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={cardStyle(420)}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
        Create account
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        Register a walk-up attendee, optionally issuing them a ticket on the spot.
      </div>

      {created ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ borderRadius: 14, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, padding: 16 }}>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>Account created</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 18, color: colors.textPrimary }}>{created.holder}</div>
            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: colors.lime, marginTop: 6 }}>{created.id}</div>
            {created.ticket && (
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(200,255,61,0.14)', color: colors.lime, fontSize: 12, fontWeight: 700 }}>{created.ticket.tier}</span>
                <span style={{ padding: '4px 10px', borderRadius: 999, background: colors.borderSoft, color: colors.textMid, fontSize: 12, fontWeight: 600 }}>{created.ticket.event?.name}</span>
              </div>
            )}
          </div>
          <button onClick={() => setCreated(null)} style={btnStyle('transparent', colors.textMid, true)}>Register another</button>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={labelStyle()}>Full name</label>
          <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Jane Dlamini" style={fieldStyle()} />

          <label style={labelStyle()}>Email (optional)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" style={fieldStyle()} />

          <label style={labelStyle()}>Event (optional — issues a ticket)</label>
          <select
            value={eventId}
            onChange={(e) => { setEventId(e.target.value); setTier(''); }}
            style={{ ...fieldStyle(), appearance: 'auto' }}
          >
            <option value="">No ticket — account only</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>

          {selectedEvent && (
            <>
              <label style={labelStyle()}>Ticket tier</label>
              <select value={tier} onChange={(e) => setTier(e.target.value)} style={{ ...fieldStyle(), appearance: 'auto' }}>
                <option value="">Choose a tier…</option>
                {selectedEvent.tiers.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </>
          )}

          {error && <div style={{ fontSize: 13, color: colors.redLight }}>{error}</div>}
          <button type="submit" disabled={submitting} style={btnStyle(colors.lime, '#0B0C0E')}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </form>
      )}
    </div>
  );
}
