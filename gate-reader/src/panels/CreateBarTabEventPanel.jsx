import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, SITE_URL } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';
import QrScanner from '../QrScanner.jsx';

const DRINK_OPTIONS = [
  { value: 'BEERS', label: 'Beer' },
  { value: 'CIDERS', label: 'Cider' },
  { value: 'SPIRITS', label: 'Spirits' },
];

const TAG_ERROR_MESSAGES = {
  tag_not_found: "That wristband QR code isn't recognized.",
  tag_unlinked: "That wristband isn't linked to an account yet.",
  drink_limit_reached: 'This attendee has already had the maximum for that drink.',
};

function pillStyle() {
  return { padding: '6px 12px', borderRadius: 999, background: colors.borderSoft, color: colors.textMid, fontSize: 12, fontWeight: 700 };
}

function optionStyle(active, atLimit) {
  return {
    flex: '1 1 100px',
    padding: '12px 10px',
    borderRadius: 12,
    background: atLimit ? colors.borderSoft : active ? colors.lime : 'transparent',
    color: atLimit ? colors.textDim : active ? '#0B0C0E' : colors.textMid,
    fontWeight: 700,
    fontSize: 13,
    border: active && !atLimit ? 'none' : `1px solid ${colors.border}`,
    cursor: atLimit ? 'not-allowed' : 'pointer',
    fontFamily: "'Space Grotesk',sans-serif",
    textAlign: 'center',
    opacity: atLimit ? 0.7 : 1,
  };
}

export default function CreateBarTabEventPanel() {
  const [stage, setStage] = useState('start'); // start | drinks | qr | scan
  const [existingEvents, setExistingEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [event, setEvent] = useState(null);
  const [maxDraft, setMaxDraft] = useState({ BEERS: '3', CIDERS: '3', SPIRITS: '3' });
  const [savingMaxes, setSavingMaxes] = useState(false);
  const [maxError, setMaxError] = useState(null);

  const [qrDataUrl, setQrDataUrl] = useState(null);

  const [qrOpen, setQrOpen] = useState(false);
  const [account, setAccount] = useState(null);
  const [tab, setTab] = useState(null);
  const [drinkType, setDrinkType] = useState('BEERS');
  const [lookingUp, setLookingUp] = useState(false);
  const [adding, setAdding] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [justAdded, setJustAdded] = useState(null);

  useEffect(() => {
    refreshEventList();
  }, []);

  function refreshEventList() {
    setLoadingEvents(true);
    api.listBarTabEvents()
      .then((list) => { if (Array.isArray(list)) setExistingEvents(list); })
      .catch(() => {})
      .finally(() => setLoadingEvents(false));
  }

  async function generateQr(ev) {
    try {
      const link = `${SITE_URL}/app/?barTabEvent=${ev.id}`;
      const dataUrl = await QRCode.toDataURL(link, { margin: 1, width: 240 });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl(null);
    }
  }

  async function onCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.createBarTabEvent(name.trim());
      if (created.error) {
        setCreateError('Could not create that bar tab event. Try again.');
        return;
      }
      setEvent(created);
      setMaxDraft({
        BEERS: String(created.maxByDrink.BEERS),
        CIDERS: String(created.maxByDrink.CIDERS),
        SPIRITS: String(created.maxByDrink.SPIRITS),
      });
      setStage('drinks');
    } catch {
      setCreateError('Could not reach the server. Try again.');
    } finally {
      setCreating(false);
    }
  }

  async function openExisting(ev) {
    setEvent(ev);
    await generateQr(ev);
    setStage('qr');
  }

  function updateMaxDraft(type, value) {
    setMaxDraft((prev) => ({ ...prev, [type]: value }));
  }

  async function onSaveMaxes() {
    const parsed = {};
    for (const opt of DRINK_OPTIONS) {
      const n = parseInt(maxDraft[opt.value], 10);
      if (!Number.isInteger(n) || n < 1) {
        setMaxError(`Enter a valid max for ${opt.label}.`);
        return;
      }
      parsed[opt.value] = n;
    }
    setSavingMaxes(true);
    setMaxError(null);
    try {
      const updated = await api.updateBarTabEventMaxes(event.id, parsed);
      if (updated.error) {
        setMaxError('Could not save. Try again.');
        return;
      }
      setEvent(updated);
      await generateQr(updated);
      setStage('qr');
      refreshEventList();
    } catch {
      setMaxError('Could not reach the server. Try again.');
    } finally {
      setSavingMaxes(false);
    }
  }

  function changeBarTabEvent() {
    setAccount(null);
    setTab(null);
    setDrinkType('BEERS');
    setScanError(null);
    setJustAdded(null);
    setEvent(null);
    setQrDataUrl(null);
    setName('');
    setStage('start');
    refreshEventList();
  }

  async function onScan(uid) {
    setQrOpen(false);
    setScanError(null);
    setJustAdded(null);
    setLookingUp(true);
    try {
      const found = await api.getAccountByTag(uid);
      if (found.error) {
        setScanError(TAG_ERROR_MESSAGES[found.error] || 'Could not find that wristband.');
        return;
      }
      const drinkTab = await api.getDrinkTab(found.id, event.id);
      setAccount(found);
      setTab(drinkTab);
    } catch {
      setScanError('Could not reach the server. Try again.');
    } finally {
      setLookingUp(false);
    }
  }

  async function onAddDrink() {
    setScanError(null);
    setAdding(true);
    try {
      const updated = await api.addDrink(account.id, drinkType, event.id);
      if (updated.error) {
        setScanError(TAG_ERROR_MESSAGES[updated.error] || 'Something went wrong. Try again.');
        return;
      }
      setTab(updated);
      setJustAdded(drinkType);
    } catch {
      setScanError('Could not reach the server. Try again.');
    } finally {
      setAdding(false);
    }
  }

  function resetScan() {
    setAccount(null);
    setTab(null);
    setDrinkType('BEERS');
    setScanError(null);
    setJustAdded(null);
  }

  if (stage === 'start') {
    return (
      <div style={cardStyle(460)}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
          Create Bar Tab Event
        </div>
        <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
          Set up a bar's drink menu and serving limits, then get a QR code attendees can scan to see their tab.
        </div>

        {!loadingEvents && existingEvents.length > 0 && (
          <>
            <label style={labelStyle()}>Continue an existing Bar Tab Event</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, marginBottom: 22 }}>
              {existingEvents.map((ev) => (
                <button key={ev.id} onClick={() => openExisting(ev)} style={btnStyle('transparent', colors.textMid, true)}>
                  {ev.name}
                </button>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${colors.borderSoft}`, marginBottom: 22 }} />
          </>
        )}

        <label style={labelStyle()}>Name Event</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Main Bar"
          style={{ ...fieldStyle(), marginTop: 8, marginBottom: 14 }}
          onKeyDown={(e) => e.key === 'Enter' && onCreate()}
        />
        {createError && <div style={{ fontSize: 13, color: colors.redLight, marginBottom: 12 }}>{createError}</div>}
        <button onClick={onCreate} disabled={creating || !name.trim()} style={{ ...btnStyle(colors.lime, '#0B0C0E'), width: '100%' }}>
          {creating ? 'Saving…' : 'Save to start'}
        </button>
      </div>
    );
  }

  if (stage === 'drinks') {
    return (
      <div style={cardStyle(460)}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
          Add Drinks
        </div>
        <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
          Set the max servings per attendee for "{event.name}".
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {DRINK_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: 12, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}` }}
            >
              <span style={{ fontWeight: 700, color: colors.textPrimary, fontFamily: "'Space Grotesk',sans-serif" }}>{opt.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: colors.textSecondary }}>Max</span>
                <input
                  type="number"
                  min="1"
                  value={maxDraft[opt.value]}
                  onChange={(e) => updateMaxDraft(opt.value, e.target.value)}
                  style={{ ...fieldStyle(), width: 60, textAlign: 'center' }}
                />
              </div>
            </div>
          ))}
        </div>

        {maxError && <div style={{ fontSize: 13, color: colors.redLight, marginBottom: 12 }}>{maxError}</div>}
        <button onClick={onSaveMaxes} disabled={savingMaxes} style={{ ...btnStyle(colors.lime, '#0B0C0E'), width: '100%' }}>
          {savingMaxes ? 'Saving…' : 'Save'}
        </button>
      </div>
    );
  }

  if (stage === 'qr') {
    return (
      <div style={cardStyle(460)}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
          {event.name}
        </div>
        <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 18 }}>
          Share this QR code — attendees scan it to see their remaining drinks for this bar.
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', padding: 12, background: '#fff', borderRadius: 16, marginBottom: 18 }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} width={220} height={220} alt="Bar Tab Event QR code" style={{ display: 'block' }} />
          ) : (
            <div style={{ width: 220, height: 220 }} />
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 22 }}>
          {DRINK_OPTIONS.map((opt) => (
            <span key={opt.value} style={pillStyle()}>{opt.label}: Max {event.maxByDrink[opt.value]}</span>
          ))}
        </div>

        <button onClick={() => setStage('scan')} style={{ ...btnStyle(colors.lime, '#0B0C0E'), width: '100%', marginBottom: 10 }}>
          Start scanning wristbands
        </button>
        <button onClick={changeBarTabEvent} style={{ ...btnStyle('transparent', colors.textMid, true), width: '100%' }}>
          Back to Bar Tab Events
        </button>
      </div>
    );
  }

  // stage === 'scan'
  const limit = tab?.maxByDrink?.[drinkType] ?? event.maxByDrink[drinkType];
  const selectedAtLimit = (tab?.counts?.[drinkType] ?? 0) >= limit;

  return (
    <div style={cardStyle(460)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary }}>
          {event.name}
        </div>
        <button onClick={changeBarTabEvent} style={{ ...btnStyle('transparent', colors.textSecondary, true), padding: '6px 12px', fontSize: 12 }}>
          Change bar tab event
        </button>
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        Scan the QR code on an attendee's wristband to open their bar tab and log a drink.
      </div>

      {!account ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {scanError && <div style={{ fontSize: 13, color: colors.redLight }}>{scanError}</div>}
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
                <span key={opt.value} style={pillStyle()}>
                  {opt.label}: {tab?.counts?.[opt.value] ?? 0}/{event.maxByDrink[opt.value]}
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

          <label style={labelStyle()}>Choose a drink</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DRINK_OPTIONS.map((opt) => {
              const count = tab?.counts?.[opt.value] ?? 0;
              const max = event.maxByDrink[opt.value];
              const remaining = Math.max(0, max - count);
              const atLimit = remaining === 0;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={atLimit}
                  onClick={() => setDrinkType(opt.value)}
                  style={optionStyle(drinkType === opt.value, atLimit)}
                >
                  {opt.label}
                  <br />
                  {atLimit ? 'None left' : `${remaining} left`}
                </button>
              );
            })}
          </div>

          {scanError && <div style={{ fontSize: 13, color: colors.redLight }}>{scanError}</div>}
          <button onClick={onAddDrink} disabled={adding || selectedAtLimit} style={btnStyle(colors.lime, '#0B0C0E')}>
            {adding ? 'Logging…' : selectedAtLimit ? 'Limit reached' : 'Log drink'}
          </button>

          <button onClick={resetScan} style={btnStyle('transparent', colors.textMid, true)}>Scan another wristband</button>
        </div>
      )}

      {qrOpen && <QrScanner onDetect={onScan} onClose={() => setQrOpen(false)} />}
    </div>
  );
}
