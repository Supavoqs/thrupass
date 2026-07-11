// Design tokens extracted from project/Thru Pass.dc.html — single source of truth
// for the gate-reader web app and the attendee Expo app.

export const darkColors = {
  bg: '#0B0C0E',
  surface: '#16181C',
  surfaceAlt: '#141619',
  surfaceDeep: '#0E1013',
  border: 'rgba(255,255,255,0.08)',
  borderSoft: 'rgba(255,255,255,0.06)',

  lime: '#C8FF3D',
  limeHover: '#dcff7a',
  limeSoft: 'rgba(200,255,61,0.14)',
  cyan: '#4DE1F2',
  cyanSoft: 'rgba(77,225,242,0.08)',
  green: '#57E38A',
  greenSoft: 'rgba(87,227,138,0.16)',
  red: '#FF5A5A',
  redLight: '#FF8A8A',
  redSoft: 'rgba(255,90,90,0.16)',

  textPrimary: '#F4F5F6',
  textSecondary: '#8A9099',
  textMid: '#c9ced4',
  textDim: '#5a616a',

  ink: '#0B0C0E',
};

export const lightColors = {
  bg: '#F5F6F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F1F3',
  surfaceDeep: '#E9EBEE',
  border: 'rgba(0,0,0,0.10)',
  borderSoft: 'rgba(0,0,0,0.07)',

  lime: '#6B9B00',
  limeHover: '#5c8500',
  limeSoft: 'rgba(107,155,0,0.14)',
  cyan: '#0F8FA3',
  cyanSoft: 'rgba(15,143,163,0.10)',
  green: '#1E9E58',
  greenSoft: 'rgba(30,158,88,0.14)',
  red: '#D93636',
  redLight: '#B72B2B',
  redSoft: 'rgba(217,54,54,0.12)',

  textPrimary: '#14161A',
  textSecondary: '#5B6169',
  textMid: '#3C4046',
  textDim: '#9AA0A8',

  ink: '#0B0C0E',
};

// Mutable — components read `colors.*` at render time, so switching theme
// just overwrites these values in place rather than requiring every call
// site to be threaded through context. Pair with remounting the tree (e.g.
// a `key={mode}` on the root) so React actually re-renders with fresh values.
export const colors = { ...darkColors };

// Mutable for the same reason as `colors` above — read `theme.mode` at
// render time rather than threading the active mode through every call site.
export const theme = { mode: 'dark' };

export function applyTheme(mode) {
  theme.mode = mode === 'light' ? 'light' : 'dark';
  Object.assign(colors, theme.mode === 'light' ? lightColors : darkColors);
}

export const fonts = {
  display: 'Space Grotesk',
  body: 'Manrope',
  mono: 'Space Mono',
};

export const radii = {
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 22,
  huge: 26,
  phone: 34,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};
