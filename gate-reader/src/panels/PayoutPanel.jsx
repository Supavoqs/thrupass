import React, { useState } from 'react';
import { api } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';

export default function PayoutPanel() {
  const [accountId, setAccountId] = useState('');
  const [account, setAccount] = useState(null);
  const [amount, setAmount] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [payingOut, setPayingOut] = useState(false);
  const [error, setError] = useState(null);
  const [paidOut, setPaidOut] = useState(null);

  async function onLookup(e) {
    e.preventDefault();
    if (!accountId.trim()) return;
    setError(null);
    setPaidOut(null);
    setLookingUp(true);
    try {
      const found = await api.getAccount(accountId.trim());
      if (found.error) {
        setError('No account with that ID.');
        setAccount(null);
        return;
      }
      setAccount(found);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setLookingUp(false);
    }
  }

  async function onPayout(e) {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (cents > account.balanceCents) {
      setError('Amount exceeds the account balance.');
      return;
    }
    setError(null);
    setPayingOut(true);
    try {
      const result = await api.cashout(account.id, cents);
      if (result.error) {
        setError('Something went wrong. Try again.');
        return;
      }
      setPaidOut({ amountCents: cents, balanceCents: result.balanceCents });
      setAccount({ ...account, balanceCents: result.balanceCents });
      setAmount('');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setPayingOut(false);
    }
  }

  function reset() {
    setAccountId('');
    setAccount(null);
    setAmount('');
    setPaidOut(null);
    setError(null);
  }

  return (
    <div style={cardStyle(420)}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
        Cash payout
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        Look up an attendee's account and pay out cash against their balance.
      </div>

      {!account ? (
        <form onSubmit={onLookup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={labelStyle()}>Account ID</label>
          <input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="acc_xxxxxxxx" style={{ ...fieldStyle(), fontFamily: "'Space Mono',monospace" }} />
          {error && <div style={{ fontSize: 13, color: colors.redLight }}>{error}</div>}
          <button type="submit" disabled={lookingUp} style={btnStyle(colors.lime, '#0B0C0E')}>
            {lookingUp ? 'Looking up…' : 'Look up account'}
          </button>
        </form>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ borderRadius: 14, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, padding: 16 }}>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>{account.holder}</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 26, color: colors.textPrimary }}>
              R {(account.balanceCents / 100).toFixed(2)}
            </div>
          </div>

          {paidOut && (
            <div style={{ borderRadius: 14, background: 'rgba(87,227,138,0.12)', border: '1px solid rgba(87,227,138,0.3)', padding: 14, fontSize: 13, color: colors.green }}>
              Paid out R{(paidOut.amountCents / 100).toFixed(2)}. New balance R{(paidOut.balanceCents / 100).toFixed(2)}.
            </div>
          )}

          <form onSubmit={onPayout} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={labelStyle()}>Amount to pay out (R)</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100.00" inputMode="decimal" style={fieldStyle()} />
            {error && <div style={{ fontSize: 13, color: colors.redLight }}>{error}</div>}
            <button type="submit" disabled={payingOut} style={btnStyle(colors.lime, '#0B0C0E')}>
              {payingOut ? 'Paying out…' : 'Pay out'}
            </button>
          </form>

          <button onClick={reset} style={btnStyle('transparent', colors.textMid, true)}>Look up another account</button>
        </div>
      )}
    </div>
  );
}
