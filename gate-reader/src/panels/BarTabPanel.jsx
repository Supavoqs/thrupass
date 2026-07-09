import React, { useState } from 'react';
import { api } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';

const DRINK_OPTIONS = [
  { value: 'BEERS', label: 'Beers' },
  { value: 'CIDERS', label: 'Ciders' },
  { value: 'SPIRITS', label: 'Spirits' },
];

export default function BarTabPanel() {
  const [accountId, setAccountId] = useState('');
  const [account, setAccount] = useState(null);
  const [tab, setTab] = useState(null); // { counts: { BEERS, CIDERS, SPIRITS }, total }
  const [drinkType, setDrinkType] = useState('BEERS');
  const [lookingUp, setLookingUp] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [justAdded, setJustAdded] = useState(null);

  async function onLookup(e) {
    e.preventDefault();
    if (!accountId.trim()) return;
    setError(null);
    setJustAdded(null);
    setLookingUp(true);
    try {
      const found = await api.getAccount(accountId.trim());
      if (found.error) {
        setError('No account with that ID.');
        setAccount(null);
        return;
      }
      const drinkTab = await api.getDrinkTab(accountId.trim());
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
    setAccountId('');
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
        Look up an attendee's account and log a drink against their bar tab.
      </div>

      {!account ? (
        <form onSubmit={onLookup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={labelStyle()}>Account ID</label>
          <input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="acc_xxxxxxxx"
            style={{ ...fieldStyle(), fontFamily: "'Space Mono',monospace" }}
          />
          {error && <div style={{ fontSize: 13, color: colors.redLight }}>{error}</div>}
          <button type="submit" disabled={lookingUp} style={btnStyle(colors.lime, '#0B0C0E')}>
            {lookingUp ? 'Looking up…' : 'Look up account'}
          </button>
        </form>
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

          <button onClick={reset} style={btnStyle('transparent', colors.textMid, true)}>Look up another account</button>
        </div>
      )}
    </div>
  );
}
