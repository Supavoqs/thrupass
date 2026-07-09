import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { colors } from '../../shared/tokens.js';

const GATE_ID = 'gate-b-lane-3';
const DEMO_UID = '04:A2:6B:4C:7A:91';
const RESULT_HOLD_MS = 3500;

const DENIED_LABELS = {
  blocklist: 'Invalid / already used',
  unlinked_tag: 'Tag not linked',
  invalid_ticket: 'Invalid / already used',
  zone_not_permitted: 'Zone not permitted',
  re_entry_block: 'Re-entry blocked',
  unknown_tag: 'Unknown tag',
  unknown_gate: 'Unknown gate',
};

const RECENT_SHORT_LABELS = {
  blocklist: 'BLOCKLISTED',
  unlinked_tag: 'UNLINKED',
  invalid_ticket: 'INVALID',
  zone_not_permitted: 'ZONE BLK',
  re_entry_block: 'RE-ENTRY BLK',
  unknown_tag: 'UNKNOWN',
  unknown_gate: 'UNKNOWN GATE',
};

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function fmtTime(date) {
  return date.toTimeString().slice(0, 5);
}
function fmtTimeSec(ts) {
  return new Date(ts).toTimeString().slice(0, 8);
}

function Logo({ size = 30 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.27, background: colors.lime, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
      <div style={{ width: size * 0.43, height: size * 0.43, border: '2px solid #0B0C0E', borderRadius: '50%', borderRightColor: 'transparent', transform: 'rotate(-45deg)' }} />
    </div>
  );
}

function ReadyPanel() {
  return (
    <div style={{ flex: 1.15, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(90% 80% at 50% 40%, ${hexA(colors.cyan, 0.08)}, transparent 70%)`, borderRight: '1px solid rgba(255,255,255,0.06)', position: 'relative' }}>
      <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', border: `2px solid ${hexA(colors.lime, 0.35)}`, animation: 'tp-ring 2.4s ease-out infinite' }} />
      <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', border: `2px solid ${hexA(colors.lime, 0.35)}`, animation: 'tp-ring 2.4s ease-out infinite', animationDelay: '0.8s' }} />
      <div style={{ width: 128, height: 128, borderRadius: '50%', border: `3px solid ${colors.lime}`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'tp-core 2s ease-in-out infinite' }}>
        <div style={{ width: 40, height: 26, border: `4px solid ${colors.lime}`, borderBottom: 'none', borderRadius: '40px 40px 0 0' }} />
      </div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 44, color: colors.textPrimary, marginTop: 26, letterSpacing: '-0.01em' }}>READY</div>
      <div style={{ fontSize: 15, color: colors.textSecondary, marginTop: 10 }}>Present a tag at the reader</div>
    </div>
  );
}

function GrantedPanel({ ticket }) {
  return (
    <div style={{ flex: 1.15, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(90% 80% at 50% 40%, ${hexA(colors.green, 0.14)}, transparent 70%)`, borderRight: '1px solid rgba(255,255,255,0.06)', animation: 'tp-fade-in 0.25s ease-out' }}>
      <div style={{ width: 128, height: 128, borderRadius: '50%', background: colors.green, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 70px ${hexA(colors.green, 0.4)}` }}>
        <div style={{ width: 48, height: 26, borderLeft: `7px solid #0B0C0E`, borderBottom: `7px solid #0B0C0E`, transform: 'rotate(-45deg)', marginTop: -8 }} />
      </div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 44, color: colors.textPrimary, marginTop: 26, letterSpacing: '-0.01em' }}>ACCESS GRANTED</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <span style={{ padding: '8px 16px', borderRadius: 999, background: hexA(colors.lime, 0.14), color: colors.lime, fontWeight: 700, fontSize: 14 }}>{ticket?.tier || '—'}</span>
        <span style={{ padding: '8px 16px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: colors.textMid, fontSize: 14, fontWeight: 600 }}>
          {ticket?.entryLabel || '1st entry'}
        </span>
      </div>
    </div>
  );
}

function DeniedPanel({ reason }) {
  return (
    <div style={{ flex: 1.15, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(90% 80% at 50% 40%, ${hexA(colors.red, 0.16)}, transparent 70%)`, borderRight: '1px solid rgba(255,255,255,0.06)', animation: 'tp-fade-in 0.25s ease-out' }}>
      <div style={{ width: 128, height: 128, borderRadius: '50%', background: colors.red, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ width: 56, height: 6, background: '#0B0C0E', transform: 'rotate(45deg)', position: 'absolute' }} />
        <div style={{ width: 56, height: 6, background: '#0B0C0E', transform: 'rotate(-45deg)', position: 'absolute' }} />
      </div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 44, color: colors.textPrimary, marginTop: 26, letterSpacing: '-0.01em' }}>ACCESS DENIED</div>
      <div style={{ marginTop: 18 }}>
        <span style={{ padding: '8px 16px', borderRadius: 999, background: hexA(colors.red, 0.16), color: colors.redLight, fontWeight: 700, fontSize: 14 }}>
          {DENIED_LABELS[reason] || 'Denied'}
        </span>
      </div>
    </div>
  );
}

function hexA(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function AttendeePanel({ view, lastResult, stats }) {
  const holder = lastResult?.account?.holder;
  const ticketId = lastResult?.account?.id ? lastResult.uid : null;
  return (
    <div style={{ flex: 0.85, padding: '30px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: 14, background: 'repeating-linear-gradient(120deg,#20242a 0 10px,#191c21 10px 20px)', position: 'relative', flex: '0 0 auto' }}>
          <span style={{ position: 'absolute', bottom: 5, left: 5, fontFamily: "'Space Mono',monospace", fontSize: 8, color: colors.textDim }}>photo</span>
        </div>
        <div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 24, color: colors.textPrimary }}>
            {holder || (view === 'ready' ? 'Waiting for tag…' : 'Unknown attendee')}
          </div>
          <div style={{ fontSize: 14, color: colors.textSecondary, marginTop: 4 }}>
            {lastResult?.ticket?.id ? `Ticket #${lastResult.ticket.id}` : '—'}
          </div>
        </div>
      </div>
      <div style={{ borderRadius: 14, background: colors.surfaceAlt, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <Row label="Tag UID" value={lastResult?.uid || '—'} mono />
        <Row label="Read time" value={lastResult ? `${lastResult.readMs} ms` : '—'} mono valueColor={colors.green} />
        <Row label="Zone" value={lastResult?.gate?.zoneLabel || '—'} last />
      </div>
      <div style={{ marginTop: 'auto', fontSize: 13, color: colors.textSecondary }}>Throughput this lane</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 34, color: colors.lime }}>{stats.total.toLocaleString()}</span>
        <span style={{ fontSize: 14, color: colors.textSecondary }}>scans · {stats.perMinute}/min</span>
      </div>
    </div>
  );
}

function Row({ label, value, mono, valueColor, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 16px', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ fontSize: 13, color: colors.textSecondary }}>{label}</span>
      <span style={{ fontFamily: mono ? "'Space Mono',monospace" : undefined, fontSize: 13, color: valueColor || colors.textPrimary, fontWeight: mono ? 400 : 600 }}>{value}</span>
    </div>
  );
}

export default function GateReader() {
  const [tab, setTab] = useState('reader'); // reader | create-account
  const [view, setView] = useState('ready'); // ready | granted | denied
  const [lastResult, setLastResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [stats, setStats] = useState({ total: 0, perMinute: 0 });
  const [uid, setUid] = useState(DEMO_UID);
  const [busy, setBusy] = useState(false);
  const revertTimer = useRef(null);
  const lastSeenTs = useRef(0);
  const clock = useClock();

  async function refreshFeed() {
    const [r, s] = await Promise.all([api.recent(GATE_ID), api.stats(GATE_ID)]);
    setRecent(r);
    setStats(s);
  }

  function showResult(res) {
    lastSeenTs.current = res.ts;
    setLastResult(res);
    setView(res.result === 'granted' ? 'granted' : 'denied');
    clearTimeout(revertTimer.current);
    revertTimer.current = setTimeout(() => setView('ready'), RESULT_HOLD_MS);
  }

  // Any tag tap anywhere (this screen's demo buttons, or the attendee app
  // hitting the same gate) lands in the same backend — poll for it so the
  // reader reacts live the way a real kiosk would.
  useEffect(() => {
    let stopped = false;

    async function poll() {
      const last = await api.lastScan(GATE_ID);
      if (!stopped && last && last.ts > lastSeenTs.current) {
        showResult(last);
        refreshFeed();
      }
    }

    (async () => {
      const last = await api.lastScan(GATE_ID);
      if (last) lastSeenTs.current = last.ts;
      await refreshFeed();
    })();

    const interval = setInterval(poll, 1200);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  async function simulateTap(tapUid) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.scan(GATE_ID, tapUid);
      showResult({ ...res, uid: tapUid });
      await refreshFeed();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0B0C0E', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setTab('reader')} style={tabBtnStyle(tab === 'reader')}>Reader</button>
        <button onClick={() => setTab('create-account')} style={tabBtnStyle(tab === 'create-account')}>Create account</button>
      </div>

      {tab === 'create-account' ? (
        <CreateAccountPanel />
      ) : (
      <div style={{ width: '100%', maxWidth: 1280, display: 'flex', gap: 40, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* main reader */}
        <div style={{ flex: '0 0 auto', width: 940, height: 588, background: colors.surfaceDeep, borderRadius: 26, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', boxShadow: '0 40px 90px -40px rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 26px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Logo />
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, letterSpacing: '0.1em', fontSize: 15, color: colors.textPrimary }}>
                THRUPASS <span style={{ color: colors.textSecondary, fontWeight: 500 }}>CLIENT</span>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontFamily: "'Space Mono',monospace", fontSize: 13, color: colors.textSecondary }}>
              <span>GATE&nbsp;B · LANE&nbsp;3</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: colors.green }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.green }} />ONLINE
              </span>
              <span>{fmtTime(clock)}</span>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex' }}>
            {view === 'ready' && <ReadyPanel />}
            {view === 'granted' && (
              <GrantedPanel
                ticket={{ ...lastResult?.ticket, entryLabel: lastResult?.reason === 're_entry_ok' ? 're-entry ok' : '1st entry' }}
              />
            )}
            {view === 'denied' && <DeniedPanel reason={lastResult?.reason} />}
            <AttendeePanel view={view} lastResult={lastResult} stats={stats} />
          </div>
          <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)', fontFamily: "'Space Mono',monospace", fontSize: 12 }}>
            {recent.length === 0 && (
              <div style={{ flex: 1, padding: '12px 20px', color: colors.textDim }}>No scans yet — simulate a tap to begin.</div>
            )}
            {recent.slice(0, 3).map((r, i) => (
              <div key={i} style={{ flex: 1, padding: '12px 20px', display: 'flex', justifyContent: 'space-between', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none', color: colors.textSecondary }}>
                <span style={{ color: colors.textMid }}>{fmtTimeSec(r.ts).slice(0, 5)} · {r.holder}</span>
                <span style={{ color: r.result === 'granted' ? colors.green : colors.red }}>
                  {r.result === 'granted' ? 'GRANTED' : (RECENT_SHORT_LABELS[r.reason] || 'DENIED')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* demo controls */}
        <div style={{ flex: '0 0 auto', width: 300, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: colors.textSecondary }}>Simulate a tap</div>
          <div style={{ borderRadius: 18, background: colors.surfaceDeep, border: '1px solid rgba(255,255,255,0.08)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 12, color: colors.textSecondary }}>Tag UID</label>
            <input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              style={{ background: colors.surfaceAlt, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 12px', color: colors.textPrimary, fontFamily: "'Space Mono',monospace", fontSize: 13 }}
            />
            <button onClick={() => simulateTap(uid)} disabled={busy} style={btnStyle(colors.lime, '#0B0C0E')}>Tap reader</button>
            <button onClick={() => simulateTap('00:00:00:00:00:00')} disabled={busy} style={btnStyle('transparent', colors.textMid, true)}>Simulate unknown tag</button>
            <button onClick={async () => { await api.block(DEMO_UID); }} disabled={busy} style={btnStyle('transparent', colors.redLight, true)}>Blocklist demo tag</button>
          </div>
          <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.5, fontFamily: "'Space Mono',monospace" }}>
            Sub-100&nbsp;ms decision, works fully offline via cached allowlist.
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function btnStyle(bg, fg, outline) {
  return {
    padding: '12px 16px',
    borderRadius: 12,
    background: bg,
    color: fg,
    fontWeight: 700,
    fontSize: 13,
    border: outline ? '1px solid rgba(255,255,255,0.12)' : 'none',
    cursor: 'pointer',
    fontFamily: "'Space Grotesk',sans-serif",
  };
}

function tabBtnStyle(active) {
  return {
    padding: '10px 20px',
    borderRadius: 999,
    background: active ? colors.lime : 'transparent',
    color: active ? '#0B0C0E' : colors.textMid,
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: '0.04em',
    border: active ? 'none' : '1px solid rgba(255,255,255,0.12)',
    cursor: 'pointer',
    fontFamily: "'Space Grotesk',sans-serif",
  };
}

function CreateAccountPanel() {
  const [holder, setHolder] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    if (!holder.trim()) {
      setError('Enter a name to register this attendee.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const account = await api.createAccount(holder.trim(), email.trim() || undefined);
      if (account.error) {
        setError('Something went wrong. Try again.');
        return;
      }
      setCreated(account);
      setHolder('');
      setEmail('');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ width: 420, borderRadius: 22, background: colors.surfaceDeep, border: '1px solid rgba(255,255,255,0.08)', padding: 28, boxShadow: '0 40px 90px -40px rgba(0,0,0,0.9)' }}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
        Create account
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        Register a walk-up attendee before linking their wristband.
      </div>

      {created ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ borderRadius: 14, background: colors.surfaceAlt, border: '1px solid rgba(255,255,255,0.06)', padding: 16 }}>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>Account created</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 18, color: colors.textPrimary }}>{created.holder}</div>
            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: colors.lime, marginTop: 6 }}>{created.id}</div>
          </div>
          <button onClick={() => setCreated(null)} style={btnStyle('transparent', colors.textMid, true)}>Register another</button>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 12, color: colors.textSecondary }}>Full name</label>
          <input
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            placeholder="Jane Dlamini"
            style={{ background: colors.surfaceAlt, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 12px', color: colors.textPrimary, fontSize: 14 }}
          />
          <label style={{ fontSize: 12, color: colors.textSecondary }}>Email (optional)</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            style={{ background: colors.surfaceAlt, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 12px', color: colors.textPrimary, fontSize: 14 }}
          />
          {error && <div style={{ fontSize: 13, color: colors.redLight }}>{error}</div>}
          <button type="submit" disabled={submitting} style={btnStyle(colors.lime, '#0B0C0E')}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </form>
      )}
    </div>
  );
}
