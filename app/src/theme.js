// Local copy of shared/tokens.js. Metro's production bundler (used by
// `expo export`, unlike the `expo start` dev server) can't resolve files
// outside the project root, so this app keeps its own copy rather than
// depending on cross-package resolution.

export const colors = {
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
