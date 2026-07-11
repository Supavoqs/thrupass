import React, { useEffect, useRef, useState } from 'react';
import { api, SITE_URL } from './api.js';
import { colors, applyTheme } from '../../shared/tokens.js';
import { btnStyle, tabBtnStyle } from './panels/shared.js';
import HostAuthPanel from './panels/HostAuthPanel.jsx';
import CreateEventPanel from './panels/CreateEventPanel.jsx';
import PayoutPanel from './panels/PayoutPanel.jsx';
import ApprovalsPanel from './panels/ApprovalsPanel.jsx';
import CreateBarTabEventPanel from './panels/CreateBarTabEventPanel.jsx';
import CreatedEventsPanel from './panels/CreatedEventsPanel.jsx';
import LinkWristbandPanel from './panels/LinkWristbandPanel.jsx';
import VendorsPanel from './panels/VendorsPanel.jsx';
import QrScanner from './QrScanner.jsx';
import { getStoredHost, setStoredHost, clearStoredHost } from './session.js';

function initials(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const NAV_TABS = [
  { key: 'reader', label: 'Reader' },
  { key: 'create-event', label: 'Create event & sell tickets' },
  { key: 'created-events', label: 'Created Events' },
  { key: 'bar-tab', label: 'Create Bar Tab Event' },
  { key: 'link-wristband', label: 'Link wristband' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'payout', label: 'Cash payout' },
  { key: 'approvals', label: 'Approvals' },
];

function loadInitialMode() {
  const saved = typeof localStorage !== 'undefined' && localStorage.getItem('thrupass-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

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

// Wordmark + mark — rendered in normal document flow (not a fixed overlay)
// so it can never sit on top of the tab bar on narrow/mobile viewports;
// callers place it in a right-aligned row above their own content. Clicking
// it returns to the landing page.
function CopyrightFooter() {
  return (
    <div style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center', paddingTop: 16, paddingBottom: 8 }}>
      Copyright 2026 ThrusPass Pty Ltd. All rights reserved.
    </div>
  );
}

function BrandCorner() {
  return (
    <a
      href={`${SITE_URL}/`}
      style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
      aria-label="ThruPass home"
    >
      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, letterSpacing: '0.12em', fontSize: 11, color: colors.textPrimary }}>
        THRUPASS
      </span>
      <Logo size={26} />
    </a>
  );
}

function ReadyPanel() {
  return (
    <div style={{ flex: '1 1 340px', minWidth: 300, minHeight: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(90% 80% at 50% 40%, ${hexA(colors.cyan, 0.08)}, transparent 70%)`, borderRight: `1px solid ${colors.borderSoft}`, position: 'relative' }}>
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
    <div style={{ flex: '1 1 340px', minWidth: 300, minHeight: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(90% 80% at 50% 40%, ${hexA(colors.green, 0.14)}, transparent 70%)`, borderRight: `1px solid ${colors.borderSoft}`, animation: 'tp-fade-in 0.25s ease-out' }}>
      <div style={{ width: 128, height: 128, borderRadius: '50%', background: colors.green, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 70px ${hexA(colors.green, 0.4)}` }}>
        <div style={{ width: 48, height: 26, borderLeft: `7px solid #0B0C0E`, borderBottom: `7px solid #0B0C0E`, transform: 'rotate(-45deg)', marginTop: -8 }} />
      </div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 44, color: colors.textPrimary, marginTop: 26, letterSpacing: '-0.01em' }}>ACCESS GRANTED</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <span style={{ padding: '8px 16px', borderRadius: 999, background: hexA(colors.lime, 0.14), color: colors.lime, fontWeight: 700, fontSize: 14 }}>{ticket?.tier || '—'}</span>
        <span style={{ padding: '8px 16px', borderRadius: 999, background: colors.borderSoft, color: colors.textMid, fontSize: 14, fontWeight: 600 }}>
          {ticket?.entryLabel || '1st entry'}
        </span>
      </div>
    </div>
  );
}

function DeniedPanel({ reason }) {
  return (
    <div style={{ flex: '1 1 340px', minWidth: 300, minHeight: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(90% 80% at 50% 40%, ${hexA(colors.red, 0.16)}, transparent 70%)`, borderRight: `1px solid ${colors.borderSoft}`, animation: 'tp-fade-in 0.25s ease-out' }}>
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
    <div style={{ flex: '1 1 260px', minWidth: 260, padding: '30px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
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
      <div style={{ borderRadius: 14, background: colors.surfaceAlt, border: `1px solid ${colors.borderSoft}`, overflow: 'hidden' }}>
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
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 16px', borderBottom: last ? 'none' : `1px solid ${colors.borderSoft}` }}>
      <span style={{ fontSize: 13, color: colors.textSecondary }}>{label}</span>
      <span style={{ fontFamily: mono ? "'Space Mono',monospace" : undefined, fontSize: 13, color: valueColor || colors.textPrimary, fontWeight: mono ? 400 : 600 }}>{value}</span>
    </div>
  );
}

export default function GateReader() {
  const [host, setHost] = useState(getStoredHost);
  const [tab, setTab] = useState(null); // null (idle) | reader | create-event | created-events | bar-tab | link-wristband | payout | approvals
  const [view, setView] = useState('ready'); // ready | granted | denied
  const [lastResult, setLastResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [stats, setStats] = useState({ total: 0, perMinute: 0 });
  const [uid, setUid] = useState(DEMO_UID);
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [mode, setMode] = useState(loadInitialMode);
  const revertTimer = useRef(null);
  const lastSeenTs = useRef(0);
  const uidInputRef = useRef(null);
  const clock = useClock();

  // Mutates the shared `colors` object in place, then this component's
  // `key={mode}` (below) forces a full remount so every inline style re-reads
  // the fresh values — no need to thread theme through every sub-component.
  useEffect(() => {
    applyTheme(mode);
    if (typeof localStorage !== 'undefined') localStorage.setItem('thrupass-theme', mode);
  }, [mode]);

  // RFID keyboard-wedge support: most USB/Bluetooth RFID readers act as a
  // keyboard, typing the tag UID into whatever's focused then sending Enter.
  // Keeping this field focused while on the reader tab means a real reader
  // just works, with no extra hardware APIs.
  useEffect(() => {
    if (tab === 'reader') uidInputRef.current?.focus();
  }, [tab]);

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
  // reader reacts live the way a real kiosk would. Only runs while the
  // Reader tab is actually open, not as soon as the host logs in.
  useEffect(() => {
    if (tab !== 'reader') return;
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
  }, [tab]);

  async function simulateTap(tapUid) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.scan(GATE_ID, tapUid);
      showResult({ ...res, uid: tapUid });
      await refreshFeed();
    } finally {
      setBusy(false);
      uidInputRef.current?.focus();
    }
  }

  function onQrDetect(payload) {
    setQrOpen(false);
    simulateTap(payload);
  }

  function onAuthenticated(hostResult) {
    setStoredHost(hostResult);
    setHost(hostResult);
  }

  function logout() {
    clearStoredHost();
    setHost(null);
    setTab(null);
  }

  if (!host) {
    return (
      <div key={mode} style={{ minHeight: '100vh', background: colors.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 }}>
        <div style={{ width: '100%', maxWidth: 1280, display: 'flex', justifyContent: 'flex-end' }}>
          <BrandCorner />
        </div>
        <HostAuthPanel onAuthenticated={onAuthenticated} />
        <a
          href={`${SITE_URL}/`}
          style={{ fontSize: 13, color: colors.textSecondary, textDecoration: 'underline', fontFamily: "'Space Grotesk',sans-serif" }}
        >
          Return home
        </a>
        <CopyrightFooter />
      </div>
    );
  }

  if (host.status === 'pending') {
    return (
      <div key={mode} style={{ minHeight: '100vh', background: colors.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 }}>
        <div style={{ width: '100%', maxWidth: 1280, display: 'flex', justifyContent: 'flex-end' }}>
          <BrandCorner />
        </div>
        <div style={{ width: '100%', maxWidth: 420, borderRadius: 22, background: colors.surfaceDeep, border: `1px solid ${colors.border}`, padding: 28, textAlign: 'center' }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 10 }}>
            Awaiting approval
          </div>
          <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
            Your host account (<strong>{host.email}</strong>) is waiting for an existing host to approve it. Log out and log back in once you've been approved.
          </div>
          <button onClick={logout} style={{ ...btnStyle(colors.lime, '#0B0C0E'), width: '100%' }}>Log out</button>
        </div>
        <CopyrightFooter />
      </div>
    );
  }

  return (
    <div key={mode} style={{ minHeight: '100vh', background: colors.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: 32, paddingTop: 24, gap: 14 }}>
      <div style={{ width: '100%', maxWidth: 1280, display: 'flex', justifyContent: 'flex-end' }}>
        <BrandCorner />
      </div>

      <div style={{ width: '100%', maxWidth: 1280, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: colors.textSecondary, fontFamily: "'Space Grotesk',sans-serif" }}>Welcome back</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary }}>{host.name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              background: `linear-gradient(135deg, ${colors.lime}, ${colors.cyan})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: '0 0 auto',
            }}
          >
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, color: colors.ink, fontSize: 15 }}>{initials(host.name)}</span>
          </div>
          <button
            onClick={logout}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary, fontSize: 12, fontFamily: "'Space Grotesk',sans-serif", textDecoration: 'underline' }}
          >
            Log out
          </button>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 1280, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        {NAV_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabBtnStyle(tab === t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'approvals' ? (
        <ApprovalsPanel host={host} />
      ) : tab === 'create-event' ? (
        <CreateEventPanel />
      ) : tab === 'created-events' ? (
        <CreatedEventsPanel />
      ) : tab === 'bar-tab' ? (
        <CreateBarTabEventPanel />
      ) : tab === 'link-wristband' ? (
        <LinkWristbandPanel host={host} />
      ) : tab === 'vendors' ? (
        <VendorsPanel />
      ) : tab === 'payout' ? (
        <PayoutPanel />
      ) : tab === 'reader' ? (
      <div style={{ width: '100%', maxWidth: 1280, display: 'flex', gap: 40, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* main reader */}
        <div style={{ flex: '1 1 700px', minWidth: 0, maxWidth: 940, background: colors.surfaceDeep, borderRadius: 26, border: `1px solid ${colors.border}`, overflow: 'hidden', boxShadow: '0 40px 90px -40px rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', padding: '18px 26px', borderBottom: `1px solid ${colors.borderSoft}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Logo />
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, letterSpacing: '0.1em', fontSize: 15, color: colors.textPrimary }}>
                THRUPASS <span style={{ color: colors.textSecondary, fontWeight: 500 }}>CLIENT</span>
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24, fontFamily: "'Space Mono',monospace", fontSize: 13, color: colors.textSecondary }}>
              <span>GATE&nbsp;B · LANE&nbsp;3</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: colors.green }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.green }} />ONLINE
              </span>
              <span>{fmtTime(clock)}</span>
            </div>
          </div>
          <div style={{ minHeight: 380, display: 'flex', flexWrap: 'wrap' }}>
            {view === 'ready' && <ReadyPanel />}
            {view === 'granted' && (
              <GrantedPanel
                ticket={{ ...lastResult?.ticket, entryLabel: lastResult?.reason === 're_entry_ok' ? 're-entry ok' : '1st entry' }}
              />
            )}
            {view === 'denied' && <DeniedPanel reason={lastResult?.reason} />}
            <AttendeePanel view={view} lastResult={lastResult} stats={stats} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', borderTop: `1px solid ${colors.borderSoft}`, fontFamily: "'Space Mono',monospace", fontSize: 12 }}>
            {recent.length === 0 && (
              <div style={{ flex: '1 1 100%', padding: '12px 20px', color: colors.textDim }}>No scans yet — simulate a tap to begin.</div>
            )}
            {recent.slice(0, 3).map((r, i) => (
              <div key={i} style={{ flex: '1 1 200px', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', gap: 8, borderRight: i < 2 ? `1px solid ${colors.borderSoft}` : 'none', color: colors.textSecondary }}>
                <span style={{ color: colors.textMid }}>{fmtTimeSec(r.ts).slice(0, 5)} · {r.holder}</span>
                <span style={{ color: r.result === 'granted' ? colors.green : colors.red }}>
                  {r.result === 'granted' ? 'GRANTED' : (RECENT_SHORT_LABELS[r.reason] || 'DENIED')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* demo controls */}
        <div style={{ flex: '1 1 280px', width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: colors.textSecondary }}>Tap a tag</div>
          <div style={{ borderRadius: 18, background: colors.surfaceDeep, border: `1px solid ${colors.border}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 12, color: colors.textSecondary }}>Tag UID (RFID reader input goes here)</label>
            <input
              ref={uidInputRef}
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') simulateTap(uid); }}
              style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '10px 12px', color: colors.textPrimary, fontFamily: "'Space Mono',monospace", fontSize: 13 }}
            />
            <button onClick={() => simulateTap(uid)} disabled={busy} style={btnStyle(colors.lime, '#0B0C0E')}>Tap reader</button>
            <button onClick={() => setQrOpen(true)} disabled={busy} style={btnStyle('transparent', colors.textMid, true)}>Scan QR code</button>
            <button onClick={() => simulateTap('00:00:00:00:00:00')} disabled={busy} style={btnStyle('transparent', colors.textMid, true)}>Simulate unknown tag</button>
            <button onClick={async () => { await api.block(DEMO_UID); }} disabled={busy} style={btnStyle('transparent', colors.redLight, true)}>Blocklist demo tag</button>
          </div>
          <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.5, fontFamily: "'Space Mono',monospace" }}>
            Sub-100&nbsp;ms decision, works fully offline via cached allowlist.
          </div>
        </div>
      </div>
      ) : (
        <div style={{ width: '100%', maxWidth: 480, textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 1.6 }}>
            Pick a tab above to get started — press <strong style={{ color: colors.textMid }}>Reader</strong> to start scanning gate entries.
          </div>
        </div>
      )}
      {qrOpen && <QrScanner onDetect={onQrDetect} onClose={() => setQrOpen(false)} />}
      <CopyrightFooter />
    </div>
  );
}

