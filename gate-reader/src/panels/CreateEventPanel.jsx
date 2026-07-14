import React, { useState } from 'react';
import { api, SITE_URL } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';

// Platform default prices, prefilled into the per-event price inputs —
// the admin can overwrite any of them per event (matches the defaults in
// server/src/index.js).
const DEFAULT_PRICES_CENTS = { GA: 25000, VIP: 40000, VVIP: 80000, PARKING: 5000, COOLER: 10000 };

const TIER_OPTIONS = ['GA', 'VIP', 'VVIP'];
const ADD_ON_OPTIONS = [
  { value: 'COOLER', label: 'Add cooler' },
  { value: 'PARKING', label: 'Add parking' },
];
const PRICE_ROWS = [
  { key: 'GA', label: 'GA' },
  { key: 'VIP', label: 'VIP' },
  { key: 'VVIP', label: 'VVIP' },
  { key: 'PARKING', label: 'Parking' },
  { key: 'COOLER', label: 'Coolers' },
];

function defaultPriceDraft() {
  const draft = {};
  for (const row of PRICE_ROWS) draft[row.key] = String(DEFAULT_PRICES_CENTS[row.key] / 100);
  return draft;
}

// Turns the rand text inputs into a cents object, or returns null (with the
// offending label) if any value isn't a valid non-negative amount.
export function parsePriceDraft(draft) {
  const cents = {};
  for (const row of PRICE_ROWS) {
    const n = parseFloat(draft[row.key]);
    if (!Number.isFinite(n) || n < 0) return { error: row.label };
    cents[row.key] = Math.round(n * 100);
  }
  return { cents };
}

export { PRICE_ROWS };

function fmtPrice(cents) {
  return `R${(cents / 100).toFixed(0)}`;
}

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

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export default function CreateEventPanel() {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [selectedTiers, setSelectedTiers] = useState(['GA']);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [priceDraft, setPriceDraft] = useState(defaultPriceDraft);
  const [zones, setZones] = useState('Main, Camp, Bar');
  const [imagesOpen, setImagesOpen] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imageName, setImageName] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  function onImageSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImageError(null);
    if (!file.type.startsWith('image/')) {
      setImageError('Choose an image file (JPG, PNG, WEBP or GIF).');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('That image is too large — please choose one under 3MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result);
      setImageName(file.name);
    };
    reader.onerror = () => setImageError('Could not read that file. Try again.');
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setImageDataUrl(null);
    setImageName(null);
    setImageError(null);
  }

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
    const parsed = parsePriceDraft(priceDraft);
    if (parsed.error) {
      setError(`Enter a valid price for ${parsed.error}.`);
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
        prices: parsed.cents,
        image: imageDataUrl || undefined,
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
    setPriceDraft(defaultPriceDraft());
    setZones('Main, Camp, Bar');
    setLinkCopied(false);
    setImagesOpen(false);
    setImageDataUrl(null);
    setImageName(null);
    setImageError(null);
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
            {created.image && (
              <img src={created.image} alt="Event artwork" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 12, marginBottom: 10, display: 'block' }} />
            )}
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 18, color: colors.textPrimary }}>{created.name}</div>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
              {created.startDate} – {created.endDate}{created.location ? ` · ${created.location}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {created.tiers.map((t) => (
                <span key={t} style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(200,255,61,0.14)', color: colors.lime, fontSize: 12, fontWeight: 700 }}>
                  {t} — {fmtPrice(created.prices?.[t] || 0)}
                </span>
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
                    {(ADD_ON_OPTIONS.find((o) => o.value === a)?.label || a)} — {fmtPrice(created.prices?.[a] || 0)}
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

          <div style={{ borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setImagesOpen((v) => !v)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px', background: colors.surfaceAlt, border: 'none', cursor: 'pointer',
                fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13, color: colors.textPrimary,
              }}
            >
              <span>Event Images {imageName ? `— ${imageName}` : '(optional)'}</span>
              <span style={{ color: colors.textSecondary, fontSize: 12 }}>{imagesOpen ? '▲' : '▼'}</span>
            </button>
            {imagesOpen && (
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, color: colors.textSecondary }}>
                  Add artwork for this event — shown wherever the event is featured. JPG, PNG, WEBP or GIF, up to 3MB.
                </div>
                {imageDataUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                    <img src={imageDataUrl} alt="Event artwork preview" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 12, display: 'block' }} />
                    <button type="button" onClick={removeImage} style={{ ...btnStyle('transparent', colors.redLight, true), width: '100%' }}>
                      Remove image
                    </button>
                  </div>
                ) : (
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                      padding: '22px 14px', borderRadius: 12, border: `1px dashed ${colors.border}`,
                      color: colors.textSecondary, fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    Click to upload event artwork
                    <input type="file" accept="image/*" onChange={onImageSelected} style={{ display: 'none' }} />
                  </label>
                )}
                {imageError && <div style={{ fontSize: 13, color: colors.redLight }}>{imageError}</div>}
              </div>
            )}
          </div>

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

          <label style={labelStyle()}>Pricing (Rand) — set each price for this event</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PRICE_ROWS.map((row) => (
              <div
                key={row.key}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 12, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}` }}
              >
                <span style={{ fontWeight: 700, fontSize: 13, color: colors.textPrimary, fontFamily: "'Space Grotesk',sans-serif" }}>{row.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: colors.textSecondary }}>R</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={priceDraft[row.key]}
                    onChange={(e) => setPriceDraft((prev) => ({ ...prev, [row.key]: e.target.value }))}
                    style={{ ...fieldStyle(), width: 90, textAlign: 'right' }}
                  />
                </div>
              </div>
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
