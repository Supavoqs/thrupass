import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';
import QrScanner from '../QrScanner.jsx';

const SALE_ERROR_MESSAGES = {
  tag_not_found: "That wristband QR code isn't recognized.",
  tag_unlinked: "That wristband isn't linked to an account yet.",
  invalid_item: 'That item is no longer available. Refresh and try again.',
  insufficient_balance: "This attendee's Thru Balance is too low for this cart.",
  empty_cart: 'Add at least one item before confirming the sale.',
};

function fmtPrice(cents) {
  return `R${(cents / 100).toFixed(2)}`;
}

function pillStyle() {
  return { padding: '6px 12px', borderRadius: 999, background: colors.borderSoft, color: colors.textMid, fontSize: 12, fontWeight: 700 };
}

export default function VendorsPanel() {
  const [stage, setStage] = useState('start'); // start | menu | pos
  const [existingVendors, setExistingVendors] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(true);

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [vendor, setVendor] = useState(null);

  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [itemError, setItemError] = useState(null);

  const [commissionDraft, setCommissionDraft] = useState('0');
  const [bankingFeeDraft, setBankingFeeDraft] = useState('0');
  const [savingSettlement, setSavingSettlement] = useState(false);
  const [settlementError, setSettlementError] = useState(null);
  const [settlementSaved, setSettlementSaved] = useState(false);

  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [qrOpen, setQrOpen] = useState(false);
  const [uidInput, setUidInput] = useState('');
  const [scannedUid, setScannedUid] = useState(null);
  const [account, setAccount] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [cart, setCart] = useState({}); // itemId -> qty
  const [selling, setSelling] = useState(false);
  const [posError, setPosError] = useState(null);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    refreshVendorList();
  }, []);

  function refreshVendorList() {
    setLoadingVendors(true);
    api.listVendors()
      .then((list) => { if (Array.isArray(list)) setExistingVendors(list); })
      .catch(() => {})
      .finally(() => setLoadingVendors(false));
  }

  function refreshSummary(vendorId) {
    setLoadingSummary(true);
    api.getVendorSummary(vendorId)
      .then((s) => { if (!s.error) setSummary(s); })
      .catch(() => {})
      .finally(() => setLoadingSummary(false));
  }

  async function onCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.createVendor(name.trim());
      if (created.error) {
        setCreateError('Could not create that vendor. Try again.');
        return;
      }
      openVendor(created);
    } catch {
      setCreateError('Could not reach the server. Try again.');
    } finally {
      setCreating(false);
    }
  }

  function openVendor(v) {
    setVendor(v);
    setCommissionDraft(String(v.commissionPct));
    setBankingFeeDraft(String(v.bankingFeePct));
    setSettlementError(null);
    setItemError(null);
    setStage('menu');
    refreshSummary(v.id);
  }

  function backToVendors() {
    setVendor(null);
    setName('');
    setCreateError(null);
    setSummary(null);
    setStage('start');
    refreshVendorList();
  }

  async function onAddItem() {
    if (!itemName.trim()) return;
    const n = parseFloat(itemPrice);
    if (!Number.isFinite(n) || n <= 0) {
      setItemError('Enter a valid price.');
      return;
    }
    setAddingItem(true);
    setItemError(null);
    try {
      const updated = await api.addVendorItem(vendor.id, itemName.trim(), Math.round(n * 100));
      if (updated.error) {
        setItemError('Could not add that item. Try again.');
        return;
      }
      setVendor(updated);
      setItemName('');
      setItemPrice('');
    } catch {
      setItemError('Could not reach the server. Try again.');
    } finally {
      setAddingItem(false);
    }
  }

  async function onToggleItem(item) {
    const updated = await api.updateVendorItem(vendor.id, item.id, { active: !item.active }).catch(() => null);
    if (updated && !updated.error) setVendor(updated);
  }

  async function onDeleteItem(item) {
    const updated = await api.deleteVendorItem(vendor.id, item.id).catch(() => null);
    if (updated && !updated.error) setVendor(updated);
  }

  async function onSaveSettlement() {
    const pct = parseFloat(commissionDraft);
    const fee = parseFloat(bankingFeeDraft);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setSettlementError('Enter a valid commission percentage (0–100).');
      return;
    }
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
      setSettlementError('Enter a valid banking fee percentage (0–100).');
      return;
    }
    setSavingSettlement(true);
    setSettlementError(null);
    try {
      const updated = await api.updateVendorSettlement(vendor.id, pct, fee);
      if (updated.error) {
        setSettlementError('Could not save. Try again.');
        return;
      }
      setVendor(updated);
      setSettlementSaved(true);
      setTimeout(() => setSettlementSaved(false), 2500);
      refreshSummary(vendor.id);
    } catch {
      setSettlementError('Could not reach the server. Try again.');
    } finally {
      setSavingSettlement(false);
    }
  }

  function goToPos() {
    setAccount(null);
    setScannedUid(null);
    setCart({});
    setPosError(null);
    setReceipt(null);
    setUidInput('');
    setStage('pos');
  }

  async function lookupUid(uid) {
    if (!uid.trim()) return;
    setQrOpen(false);
    setPosError(null);
    setReceipt(null);
    setLookingUp(true);
    try {
      const found = await api.getAccountByTag(uid.trim());
      if (found.error) {
        setPosError(SALE_ERROR_MESSAGES[found.error] || 'Could not find that wristband.');
        return;
      }
      setAccount(found);
      setScannedUid(uid.trim());
      setCart({});
      setUidInput('');
    } catch {
      setPosError('Could not reach the server. Try again.');
    } finally {
      setLookingUp(false);
    }
  }

  function changeQty(itemId, delta) {
    setCart((prev) => {
      const next = { ...prev };
      const qty = (next[itemId] || 0) + delta;
      if (qty <= 0) delete next[itemId];
      else next[itemId] = qty;
      return next;
    });
  }

  const activeItems = (vendor?.items || []).filter((i) => i.active);
  const cartLines = Object.entries(cart)
    .map(([itemId, qty]) => ({ item: activeItems.find((i) => i.id === itemId), qty }))
    .filter((l) => l.item);
  const cartTotal = cartLines.reduce((sum, l) => sum + l.item.priceCents * l.qty, 0);

  async function onConfirmSale() {
    if (cartLines.length === 0) return;
    setSelling(true);
    setPosError(null);
    try {
      const cartPayload = cartLines.map((l) => ({ itemId: l.item.id, qty: l.qty }));
      const result = await api.vendorSale(vendor.id, scannedUid, cartPayload, null);
      if (result.error) {
        setPosError(SALE_ERROR_MESSAGES[result.error] || 'Could not complete that sale. Try again.');
        return;
      }
      setReceipt(result);
      setAccount((prev) => ({ ...prev, balanceCents: result.balanceCents }));
      setCart({});
      refreshSummary(vendor.id);
    } catch {
      setPosError('Could not reach the server. Try again.');
    } finally {
      setSelling(false);
    }
  }

  function resetPos() {
    setAccount(null);
    setScannedUid(null);
    setCart({});
    setPosError(null);
    setReceipt(null);
    setUidInput('');
  }

  if (stage === 'start') {
    return (
      <div style={cardStyle(460)}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
          Vendors
        </div>
        <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
          Set up a cashless stall — give it a priced menu, then tap attendee wristbands to sell in real time.
        </div>

        {!loadingVendors && existingVendors.length > 0 && (
          <>
            <label style={labelStyle()}>Continue an existing vendor</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, marginBottom: 22 }}>
              {existingVendors.map((v) => (
                <button key={v.id} onClick={() => openVendor(v)} style={btnStyle('transparent', colors.textMid, true)}>
                  {v.name}
                </button>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${colors.borderSoft}`, marginBottom: 22 }} />
          </>
        )}

        <label style={labelStyle()}>Vendor / stall name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Joe's Burgers"
          style={{ ...fieldStyle(), marginTop: 8, marginBottom: 14 }}
          onKeyDown={(e) => e.key === 'Enter' && onCreate()}
        />
        {createError && <div style={{ fontSize: 13, color: colors.redLight, marginBottom: 12 }}>{createError}</div>}
        <button onClick={onCreate} disabled={creating || !name.trim()} style={{ ...btnStyle(colors.lime, '#0B0C0E'), width: '100%' }}>
          {creating ? 'Saving…' : 'Create vendor'}
        </button>
      </div>
    );
  }

  if (stage === 'menu') {
    return (
      <div style={cardStyle(520)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary }}>
            {vendor.name}
          </div>
          <button onClick={backToVendors} style={{ ...btnStyle('transparent', colors.textSecondary, true), padding: '6px 12px', fontSize: 12 }}>
            Change vendor
          </button>
        </div>
        <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
          Manage this vendor's menu, watch live sales, and start selling when you're ready.
        </div>

        <label style={labelStyle()}>Menu items</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, marginBottom: 14 }}>
          {vendor.items.length === 0 && (
            <div style={{ fontSize: 13, color: colors.textDim }}>No items yet — add one below.</div>
          )}
          {vendor.items.map((item) => (
            <div
              key={item.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 12, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, opacity: item.active ? 1 : 0.5 }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: colors.textPrimary, fontFamily: "'Space Grotesk',sans-serif" }}>{item.name}</div>
                <div style={{ fontSize: 12, color: colors.textSecondary }}>{fmtPrice(item.priceCents)}{!item.active && ' · disabled'}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => onToggleItem(item)} style={{ ...btnStyle('transparent', colors.textMid, true), padding: '6px 10px', fontSize: 11 }}>
                  {item.active ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => onDeleteItem(item)} style={{ ...btnStyle('transparent', colors.redLight, true), padding: '6px 10px', fontSize: 11 }}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="Item name"
            style={{ ...fieldStyle(), flex: 2 }}
          />
          <input
            type="number"
            min="0"
            step="any"
            value={itemPrice}
            onChange={(e) => setItemPrice(e.target.value)}
            placeholder="Price (R)"
            style={{ ...fieldStyle(), flex: 1 }}
          />
        </div>
        {itemError && <div style={{ fontSize: 13, color: colors.redLight, marginBottom: 10 }}>{itemError}</div>}
        <button onClick={onAddItem} disabled={addingItem || !itemName.trim()} style={{ ...btnStyle('transparent', colors.lime, true), width: '100%', marginBottom: 22 }}>
          {addingItem ? 'Adding…' : '+ Add item'}
        </button>

        <div style={{ borderTop: `1px solid ${colors.borderSoft}`, marginBottom: 22 }} />

        <label style={labelStyle()}>Settlement — your commission from this vendor (optional)</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 4 }}>Commission %</div>
            <input type="number" min="0" max="100" step="any" value={commissionDraft} onChange={(e) => setCommissionDraft(e.target.value)} style={fieldStyle()} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 4 }}>Banking fee %</div>
            <input type="number" min="0" max="100" step="any" value={bankingFeeDraft} onChange={(e) => setBankingFeeDraft(e.target.value)} style={fieldStyle()} />
          </div>
        </div>
        {settlementError && <div style={{ fontSize: 13, color: colors.redLight, marginBottom: 10 }}>{settlementError}</div>}
        {settlementSaved && <div style={{ fontSize: 13, color: colors.green, marginBottom: 10 }}>Saved.</div>}
        <button onClick={onSaveSettlement} disabled={savingSettlement} style={{ ...btnStyle('transparent', colors.textMid, true), width: '100%', marginBottom: 22 }}>
          {savingSettlement ? 'Saving…' : 'Save settlement settings'}
        </button>

        <div style={{ borderRadius: 14, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, padding: 16, marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: colors.textSecondary }}>Live sales & settlement</div>
            <button onClick={() => refreshSummary(vendor.id)} style={{ ...btnStyle('transparent', colors.textSecondary, true), padding: '4px 10px', fontSize: 11 }}>
              {loadingSummary ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {!summary || summary.salesCount === 0 ? (
            <div style={{ fontSize: 13, color: colors.textDim }}>No sales yet.</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {summary.byItem.map((it) => (
                  <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textPrimary }}>
                    <span>{it.name} × {it.qty}</span>
                    <span style={{ fontFamily: "'Space Mono',monospace" }}>{fmtPrice(it.grossCents)}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${colors.borderSoft}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textSecondary }}>
                  <span>Gross sales ({summary.salesCount} items)</span>
                  <span>{fmtPrice(summary.grossCents)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textSecondary }}>
                  <span>Commission ({summary.commissionPct}%)</span>
                  <span>-{fmtPrice(summary.commissionCents)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textSecondary }}>
                  <span>Banking fee ({summary.bankingFeePct}%)</span>
                  <span>-{fmtPrice(summary.bankingFeeCents)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: colors.lime, fontWeight: 700, marginTop: 4 }}>
                  <span>Net payout to vendor</span>
                  <span>{fmtPrice(summary.netCents)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <button onClick={goToPos} disabled={activeItems.length === 0} style={{ ...btnStyle(colors.lime, '#0B0C0E'), width: '100%' }}>
          {activeItems.length === 0 ? 'Add an item to start selling' : 'Start selling (POS)'}
        </button>
      </div>
    );
  }

  // stage === 'pos'
  return (
    <div style={cardStyle(460)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary }}>
          {vendor.name} · POS
        </div>
        <button onClick={() => setStage('menu')} style={{ ...btnStyle('transparent', colors.textSecondary, true), padding: '6px 12px', fontSize: 12 }}>
          Back to menu
        </button>
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        Tap or scan an attendee's wristband, build their order, then confirm to deduct from their Thru Balance.
      </div>

      {!account ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={labelStyle()}>Wristband UID (RFID reader types it here)</label>
          <input
            value={uidInput}
            onChange={(e) => setUidInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookupUid(uidInput)}
            placeholder="04:A2:6B:4C:7A:91"
            autoFocus
            style={fieldStyle()}
          />
          {posError && <div style={{ fontSize: 13, color: colors.redLight }}>{posError}</div>}
          <button onClick={() => lookupUid(uidInput)} disabled={lookingUp || !uidInput.trim()} style={btnStyle(colors.lime, '#0B0C0E')}>
            {lookingUp ? 'Looking up…' : 'Find account'}
          </button>
          <button onClick={() => setQrOpen(true)} disabled={lookingUp} style={btnStyle('transparent', colors.textMid, true)}>
            Scan wristband QR code
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ borderRadius: 14, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>{account.holder}</div>
            <div style={{ marginTop: 6 }}>
              <span style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(200,255,61,0.14)', color: colors.lime, fontSize: 12, fontWeight: 700 }}>
                Thru Balance: {fmtPrice(account.balanceCents)}
              </span>
            </div>
          </div>

          {receipt ? (
            <div style={{ borderRadius: 14, background: 'rgba(87,227,138,0.12)', border: '1px solid rgba(87,227,138,0.3)', padding: 14 }}>
              <div style={{ fontSize: 13, color: colors.green, fontWeight: 700, marginBottom: 8 }}>Sale confirmed</div>
              {receipt.receipt.map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textPrimary }}>
                  <span>{l.name} × {l.qty}</span>
                  <span style={{ fontFamily: "'Space Mono',monospace" }}>{fmtPrice(l.priceCents * l.qty)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.textSecondary, marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(87,227,138,0.3)' }}>
                <span>Total charged</span>
                <span style={{ fontWeight: 700 }}>{fmtPrice(receipt.totalCents)}</span>
              </div>
              <button onClick={resetPos} style={{ ...btnStyle(colors.lime, '#0B0C0E'), width: '100%', marginTop: 14 }}>
                Next customer
              </button>
            </div>
          ) : (
            <>
              <label style={labelStyle()}>Menu</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeItems.map((item) => {
                  const qty = cart[item.id] || 0;
                  return (
                    <div
                      key={item.id}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 12, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}` }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: colors.textPrimary, fontFamily: "'Space Grotesk',sans-serif" }}>{item.name}</div>
                        <div style={{ fontSize: 12, color: colors.textSecondary }}>{fmtPrice(item.priceCents)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={() => changeQty(item.id, -1)} disabled={qty === 0} style={{ ...btnStyle('transparent', colors.textMid, true), padding: '4px 12px' }}>−</button>
                        <span style={{ minWidth: 16, textAlign: 'center', fontWeight: 700, color: colors.textPrimary }}>{qty}</span>
                        <button onClick={() => changeQty(item.id, 1)} style={{ ...btnStyle(colors.lime, '#0B0C0E'), padding: '4px 12px' }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: colors.lime, fontWeight: 700 }}>
                <span>Total</span>
                <span>{fmtPrice(cartTotal)}</span>
              </div>

              {posError && <div style={{ fontSize: 13, color: colors.redLight }}>{posError}</div>}
              <button onClick={onConfirmSale} disabled={selling || cartLines.length === 0} style={btnStyle(colors.lime, '#0B0C0E')}>
                {selling ? 'Charging…' : `Confirm sale — ${fmtPrice(cartTotal)}`}
              </button>
              <button onClick={resetPos} style={btnStyle('transparent', colors.textMid, true)}>Scan another wristband</button>
            </>
          )}
        </div>
      )}

      {qrOpen && <QrScanner onDetect={lookupUid} onClose={() => setQrOpen(false)} />}
    </div>
  );
}
