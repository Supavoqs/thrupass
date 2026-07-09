import React, { createContext, useContext, useState } from 'react';
import { colors, applyTheme } from './theme.js';

const ThemeContext = createContext({ colors, mode: 'dark', toggle: () => {} });

function loadInitialMode() {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('thrupass-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  }
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    const initial = loadInitialMode();
    applyTheme(initial); // mutate before first render so initial styles are correct
    return initial;
  });

  function toggle() {
    setMode((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next); // mutate synchronously, before children re-render with the new mode
      if (typeof localStorage !== 'undefined') localStorage.setItem('thrupass-theme', next);
      return next;
    });
  }

  return <ThemeContext.Provider value={{ colors, mode, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
