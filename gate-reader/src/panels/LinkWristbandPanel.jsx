import React, { useState } from 'react';
import { api } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';
import QrScanner from '../QrScanner.jsx';

const LOOKUP_ERROR_MESSAGES = {
  valid_email_required: 'Enter a valid email address.',
  account_not_found: "No attendee account found with that email.",
};

export default function LinkWristbandPanel({ host }) {
  const [email, setEmail] = useState('');
  const [account, setAccount] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState(null);
  const [linked, setLinked] = useState(null);

  async function onLookup() {
    setError(null);
    setLinked(null);
    setLookingUp(true);
    try {
      const found = await api.lookupAccountByEmail(email.trim(), host.id);
      if (found.error) {
        setError(LOOKUP_ERROR_MESSAGES[found.error] || 'Could not find that account.');
        return;
      }
      setAccount(found);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setLookingUp(false);
    }
  }

  async function onScan(uid) {
    setQrOpen(false);
    setError(null);
    setLinking(true);
    try {
      const result = await api.linkTag(uid, account.id);
      if (result.error) {
        setError('Could not link that wristband. Try scanning again.');
        return;
      }
      setLinked(uid);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setLinking(false);
    }
  }

  function reset() {
    setEmail('');
    setAccount(null);
    setError(null);
    setLinked(null);
  }

  return (
    <div style={cardStyle(420)}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
        Link wristband
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        Pre-link a wristband's QR code to an attendee's account ahead of the event, so it works at the gate and the bar.
      </div>

      {!account ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={labelStyle()}>Attendee email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            style={fieldStyle()}
            onKeyDown={(e) => e.key === 'Enter' && onLookup()}
          />
          {error && <div style={{ fontSize: 13, color: colors.redLight }}>{error}</div>}
          <button onClick={onLookup} disabled={lookingUp || !email.trim()} style={btnStyle(colors.lime, '#0B0C0E')}>
            {lookingUp ? 'Looking up…' : 'Find account'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ borderRadius: 14, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>{account.holder}</div>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{account.email}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <span style={{ padding: '6px 12px', borderRadius: 999, background: colors.borderSoft, color: colors.textMid, fontSize: 12, fontWeight: 700 }}>
                {account.ticket ? `${account.ticket.tier} ticket` : 'No ticket yet'}
              </span>
              <span style={{ padding: '6px 12px', borderRadius: 999, background: account.tag ? 'rgba(87,227,138,0.14)' : colors.borderSoft, color: account.tag ? colors.green : colors.textMid, fontSize: 12, fontWeight: 700 }}>
                {account.tag ? `Already linked · ${account.tag.uid}` : 'No wristband linked'}
              </span>
            </div>
          </div>

          {linked && (
            <div style={{ borderRadius: 14, background: 'rgba(87,227,138,0.12)', border: '1px solid rgba(87,227,138,0.3)', padding: 14, fontSize: 13, color: colors.green }}>
              Wristband linked to {account.holder}.
            </div>
          )}

          {error && <div style={{ fontSize: 13, color: colors.redLight }}>{error}</div>}

          <button onClick={() => setQrOpen(true)} disabled={linking} style={btnStyle(colors.lime, '#0B0C0E')}>
            {linking ? 'Linking…' : account.tag ? 'Re-link a different wristband' : 'Scan wristband QR code'}
          </button>

          <button onClick={reset} style={btnStyle('transparent', colors.textMid, true)}>Look up another attendee</button>
        </div>
      )}

      {qrOpen && <QrScanner onDetect={onScan} onClose={() => setQrOpen(false)} />}
    </div>
  );
}
