import { colors, theme } from '../../../shared/tokens.js';

// These are all functions (not module-level constants) so they read the
// current `colors.*` values on every call — needed for the dark/light
// toggle to actually update already-rendered panels, since `colors` is a
// mutated shared object rather than something threaded through props.
export function btnStyle(bg, fg, outline) {
  return {
    padding: '12px 16px',
    borderRadius: 12,
    background: bg,
    color: fg,
    fontWeight: 700,
    fontSize: 13,
    border: outline ? `1px solid ${colors.border}` : 'none',
    cursor: 'pointer',
    fontFamily: "'Space Grotesk',sans-serif",
  };
}

export function fieldStyle() {
  return {
    background: colors.surfaceAlt,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: '10px 12px',
    color: colors.textPrimary,
    fontSize: 14,
    width: '100%',
  };
}

export function labelStyle() {
  return { fontSize: 12, color: colors.textSecondary };
}

export function tabBtnStyle(active) {
  const isDark = theme.mode !== 'light';
  return {
    padding: '10px 20px',
    borderRadius: 999,
    background: active ? colors.lime : (isDark ? '#000000' : '#FFFFFF'),
    color: active ? '#0B0C0E' : (isDark ? '#FFFFFF' : '#000000'),
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: '0.04em',
    border: active ? 'none' : `1px solid ${colors.border}`,
    cursor: 'pointer',
    fontFamily: "'Manrope',sans-serif",
  };
}

export function cardStyle(maxWidth) {
  return {
    width: '100%',
    maxWidth,
    borderRadius: 22,
    background: colors.surfaceDeep,
    border: `1px solid ${colors.border}`,
    padding: 28,
    boxShadow: '0 40px 90px -40px rgba(0,0,0,0.9)',
  };
}
