import React, { useState } from 'react';
import { api } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';
import QrScanner from '../QrScanner.jsx';

const DRINK_OPTIONS = [
  { value: 'BEERS', label: 'Beers' },
  { value: 'CIDERS', label: 'Ciders' },
  { value: 'SPIRITS', label: 'Spirits' },
];

const TAG_ERROR_MESSAGES = {
  tag_not_found: "That wristband QR code isn't recognized.",
  tag_unlinked: "That wristband isn't linked to an account yet.",
};

export default function BarTabPanel() {
  const [qrOpen, setQrOpen] = useState(false);
  const [account, setAccount] = useState(null);
  const [tab, setTab] = useState(null); // { counts: { BEERS, CIDERS, SPIRITS }, total }
  const [drinkType, setDrinkType] = useState('BEERS');
  const [lookingUp, setLookingUp] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [justAdded, setJustAdded] = useState(null);

  async function onScan(uid) {
    setQrOpen(false);
    setError(null);
    setJustAdded(null);
    setLookingUp(true);
    try {
      const found = await api.getAccountByTag(uid);
      if (found.error) {
        setError(TAG_ERROR_MESSAGES[found.error] || 'Could not find that wristband.');
        return;
      }
      const drinkTab = await api.getDrinkTab(found.id);
      setAccount(found);
      setTab(drinkTab);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setLookingUp(false);
    }
  }

  async function onAddDrink() {
    setError(null);
    setAdding(true);
    try {
      const updated = await api.addDrink(account.id, drinkType);
      if (updated.error) {
        setError('Something went wrong. Try again.');
        return;
      }
      setTab(updated);
      setJustAdded(drinkType);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setAdding(false);
    }
  }

  function reset() {
    setAccount(null);
    setTab(null);
    setDrinkType('BEERS');
    setError(null);
    setJustAdded(null);
  }

  return (
    <div style={cardStyle(420)}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
        Bar tab
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        Scan the QR code on an attendee's wristband to open their bar tab and log a drink.
      </div>

      {!account ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ fontSize: 13, color: colors.redLight }}>{error}</div>}
          <button onClick={() => setQrOpen(true)} disabled={lookingUp} style={btnStyle(colors.lime, '#0B0C0E')}>
            {lookingUp ? 'Looking up…' : 'Scan wristband QR code'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ borderRadius: 14, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, padding: 16 }}>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>{account.holder}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {DRINK_OPTIONS.map((opt) => (
                <span
                  key={opt.value}
                  style={{ padding: '6px 12px', borderRadius: 999, background: colors.borderSoft, color: colors.textMid, fontSize: 12, fontWeight: 700 }}
                >
                  {opt.label}: {tab?.counts?.[opt.value] ?? 0}
                </span>
              ))}
              <span style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(200,255,61,0.14)', color: colors.lime, fontSize: 12, fontWeight: 700 }}>
                Total: {tab?.total ?? 0}
              </span>
            </div>
          </div>

          {justAdded && (
            <div style={{ borderRadius: 14, background: 'rgba(87,227,138,0.12)', border: '1px solid rgba(87,227,138,0.3)', padding: 14, fontSize: 13, color: colors.green }}>
              Logged one {DRINK_OPTIONS.find((o) => o.value === justAdded)?.label.toLowerCase()}.
            </div>
          )}

          <label style={labelStyle()}>Drink</label>
          <select
            value={drinkType}
            onChange={(e) => setDrinkType(e.target.value)}
            style={{ ...fieldStyle(), fontFamily: "'Space Grotesk',sans-serif" }}
          >
            {DRINK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {error && <div style={{ fontSize: 13, color: colors.redLight }}>{error}</div>}
          <button onClick={onAddDrink} disabled={adding} style={btnStyle(colors.lime, '#0B0C0E')}>
            {adding ? 'Logging…' : 'Log drink'}
          </button>

          <button onClick={reset} style={btnStyle('transparent', colors.textMid, true)}>Scan another wristband</button>
        </div>
      )}

      {qrOpen && <QrScanner onDetect={onScan} onClose={() => setQrOpen(false)} />}
    </div>
  );
}
