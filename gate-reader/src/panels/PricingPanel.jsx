import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, cardStyle } from './shared.js';

function fmtPrice(cents) {
  return `R${(cents / 100).toFixed(2)}`;
}

function fieldRow(label, value, onChange, opts = {}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 4 }}>{label}</div>
      <input
        type="number"
        min="0"
        max={opts.max}
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={fieldStyle()}
      />
    </div>
  );
}

export default function PricingPanel() {
  const [pricing, setPricing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const [revenue, setRevenue] = useState(null);
  const [loadingRevenue, setLoadingRevenue] = useState(false);

  useEffect(() => {
    refresh();
    refreshRevenue();
  }, []);

  function refresh() {
    setLoading(true);
    api.getPricing()
      .then((p) => {
        if (p.error) return;
        setPricing(p);
        setDraft({
          ticketCommissionPct: String(p.ticketCommissionPct),
          ticketBankingFeePct: String(p.ticketBankingFeePct),
          ticketMinFeeCents: String(p.ticketMinFeeCents / 100),
          vendorCommissionPct: String(p.vendorCommissionPct),
          vendorBankingFeePct: String(p.vendorBankingFeePct),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function refreshRevenue() {
    setLoadingRevenue(true);
    api.getTicketRevenue()
      .then((r) => { if (!r.error) setRevenue(r); })
      .catch(() => {})
      .finally(() => setLoadingRevenue(false));
  }

  function setField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    const parsedPct = {};
    for (const key of ['ticketCommissionPct', 'ticketBankingFeePct', 'vendorCommissionPct', 'vendorBankingFeePct']) {
      const n = parseFloat(draft[key]);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        setError('Enter valid percentages (0–100) for every fee.');
        return;
      }
      parsedPct[key] = n;
    }
    const minFee = parseFloat(draft.ticketMinFeeCents);
    if (!Number.isFinite(minFee) || minFee < 0) {
      setError('Enter a valid free-ticket minimum fee.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await api.updatePricing({
        ...parsedPct,
        ticketMinFeeCents: Math.round(minFee * 100),
      });
      if (updated.error) {
        setError('Could not save. Try again.');
        return;
      }
      setPricing(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      refreshRevenue();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !draft) {
    return (
      <div style={cardStyle(520)}>
        <div style={{ fontSize: 13, color: colors.textSecondary }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={cardStyle(520)}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
        Pricing
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        Thru Pass's own fee schedule — introductory rates set 1 percentage point below Howler's published caps
        (5% commission, 2.5% banking fee, R5 free-ticket minimum). Adjust anytime as real payment-processor costs
        are confirmed; new vendors inherit the current vendor rates below, editable per-vendor afterwards.
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary, fontFamily: "'Space Grotesk',sans-serif", marginBottom: 10 }}>
        Ticket sales
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {fieldRow('Commission %', draft.ticketCommissionPct, (v) => setField('ticketCommissionPct', v), { max: 100 })}
        {fieldRow('Banking fee %', draft.ticketBankingFeePct, (v) => setField('ticketBankingFeePct', v), { max: 100 })}
      </div>
      <div style={{ marginBottom: 22 }}>
        {fieldRow('Free / comp ticket minimum fee (R)', draft.ticketMinFeeCents, (v) => setField('ticketMinFeeCents', v))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary, fontFamily: "'Space Grotesk',sans-serif", marginBottom: 10 }}>
        Vendor sales (default for new vendors)
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {fieldRow('Commission %', draft.vendorCommissionPct, (v) => setField('vendorCommissionPct', v), { max: 100 })}
        {fieldRow('Banking fee %', draft.vendorBankingFeePct, (v) => setField('vendorBankingFeePct', v), { max: 100 })}
      </div>

      {error && <div style={{ fontSize: 13, color: colors.redLight, marginBottom: 12 }}>{error}</div>}
      {saved && <div style={{ fontSize: 13, color: colors.green, marginBottom: 12 }}>Saved.</div>}
      <button onClick={onSave} disabled={saving} style={{ ...btnStyle(colors.lime, '#0B0C0E'), width: '100%', marginBottom: 22 }}>
        {saving ? 'Saving…' : 'Save pricing'}
      </button>

      <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 10 }}>
        This is a report, not a live charge — ticket prices at checkout are unchanged; this shows what Thru Pass
        would be owed under the rates above.
      </div>
      <div style={{ borderRadius: 14, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: colors.textSecondary }}>Estimated ticket revenue to date</div>
          <button onClick={refreshRevenue} style={{ ...btnStyle('transparent', colors.textSecondary, true), padding: '4px 10px', fontSize: 11 }}>
            {loadingRevenue ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        {!revenue || (revenue.paidCount === 0 && revenue.freeCount === 0) ? (
          <div style={{ fontSize: 13, color: colors.textDim }}>No ticket sales yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textSecondary }}>
              <span>Paid tickets ({revenue.paidCount}) — gross</span>
              <span>{fmtPrice(revenue.grossCents)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textSecondary }}>
              <span>Commission ({pricing.ticketCommissionPct}%)</span>
              <span>{fmtPrice(revenue.commissionCents)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textSecondary }}>
              <span>Banking fee ({pricing.ticketBankingFeePct}%)</span>
              <span>{fmtPrice(revenue.bankingFeeCents)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textSecondary }}>
              <span>Free/comp tickets ({revenue.freeCount} × {fmtPrice(pricing.ticketMinFeeCents)})</span>
              <span>{fmtPrice(revenue.freeTicketFeesCents)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: colors.lime, fontWeight: 700, marginTop: 4, paddingTop: 8, borderTop: `1px solid ${colors.borderSoft}` }}>
              <span>Estimated Thru Pass revenue</span>
              <span>{fmtPrice(revenue.totalRevenueCents)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
