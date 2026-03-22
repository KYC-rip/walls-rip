import { useState, useEffect } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';
type ResolvedTheme = 'dark' | 'light';
type Contrast = 'default' | 'high';
export type FontScale = 'default' | 'large' | 'xl';
export type Skin = 'terminal' | 'clean' | 'monero';

const ZOOM_VALUES: Record<FontScale, number> = {
  default: 1,
  large: 1.15,
  xl: 1.3,
};

const SKIN_LABELS: Record<Skin, string> = {
  terminal: 'Terminal',
  clean: 'Clean',
  monero: 'Monero',
};

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system';
    const saved = localStorage.getItem('theme-mode');
    return (saved === 'dark' || saved === 'light' || saved === 'system') ? saved : 'system';
  });

  const [contrast, setContrast] = useState<Contrast>(() => {
    if (typeof window === 'undefined') return 'high';
    const saved = localStorage.getItem('contrast');
    if (saved === 'high' || saved === 'default') return saved as Contrast;
    return 'high';
  });

  const [fontScale, setFontScale] = useState<FontScale>(() => {
    if (typeof window === 'undefined') return 'default';
    const saved = localStorage.getItem('PREF_FONT_SIZE');
    if (saved === 'default' || saved === 'large' || saved === 'xl') return saved as FontScale;
    return 'default';
  });

  const [skin, setSkinState] = useState<Skin>(() => {
    if (typeof window === 'undefined') return 'terminal';
    const saved = localStorage.getItem('theme-skin');
    if (saved === 'terminal' || saved === 'clean' || saved === 'monero') return saved;
    return 'terminal';
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');

  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');

    const applyTheme = (targetTheme: ResolvedTheme) => {
      setResolvedTheme(targetTheme);
      root.classList.remove('light', 'dark');
      root.classList.add(targetTheme);
      metaThemeColor?.setAttribute('content', targetTheme === 'light' ? '#f8fafc' : '#050505');
    };

    const handleSystemChange = () => {
      if (mode === 'system') applyTheme(mediaQuery.matches ? 'dark' : 'light');
    };

    if (mode === 'system') {
      applyTheme(mediaQuery.matches ? 'dark' : 'light');
      mediaQuery.addEventListener('change', handleSystemChange);
    } else {
      applyTheme(mode);
    }

    localStorage.setItem('theme-mode', mode);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, [mode]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle('high-contrast', contrast === 'high');
    localStorage.setItem('contrast', contrast);
  }, [contrast]);

  useEffect(() => {
    document.documentElement.style.zoom = String(ZOOM_VALUES[fontScale]);
    localStorage.setItem('PREF_FONT_SIZE', fontScale);
  }, [fontScale]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('skin-terminal', 'skin-clean', 'skin-monero');
    root.classList.add(`skin-${skin}`);
    localStorage.setItem('theme-skin', skin);
  }, [skin]);

  const cycleTheme = () => {
    setModeState(prev => prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system');
  };

  const toggleContrast = () => setContrast(prev => prev === 'default' ? 'high' : 'default');

  const cycleFontScale = () => {
    setFontScale(prev => prev === 'default' ? 'large' : prev === 'large' ? 'xl' : 'default');
  };

  const cycleSkin = () => {
    setSkinState(prev => prev === 'terminal' ? 'clean' : prev === 'clean' ? 'monero' : 'terminal');
  };

  return {
    mode, resolvedTheme, cycleTheme,
    contrast, toggleContrast,
    fontScale, cycleFontScale,
    skin, skinLabel: SKIN_LABELS[skin], cycleSkin,
  };
}
