// RN/RN-Web 공유 토큰. 웹: body[data-theme] 관찰 / 네이티브: Appearance API.
import { useEffect, useState } from 'react';
import { Platform, Appearance } from 'react-native';

const lightTokens = {
  bg: '#FFFFFF',
  fg: '#0F0E0E',
  fgSecondary: 'rgba(15,14,14,0.62)',
  fgTertiary: 'rgba(15,14,14,0.38)',
  accent: '#8B3A1F',
  accentSoft: 'rgba(139, 58, 31, 0.08)',
  hairline: 'rgba(0,0,0,0.07)',
  pillBg: 'rgba(255, 220, 210, 0.55)',
  pillFg: '#4A2A22',
  pillBorder: 'rgba(180, 90, 70, 0.08)',
  inputBg: 'rgba(0,0,0,0.04)',
  navBg: 'rgba(255,255,255,0.85)',
};
const darkTokens = {
  bg: '#16110F',
  fg: '#F5EFEC',
  fgSecondary: 'rgba(245,239,236,0.62)',
  fgTertiary: 'rgba(245,239,236,0.38)',
  accent: '#D96A48',
  accentSoft: 'rgba(217, 106, 72, 0.14)',
  hairline: 'rgba(255,255,255,0.08)',
  pillBg: 'rgba(180, 90, 70, 0.22)',
  pillFg: '#F4D9CF',
  pillBorder: 'rgba(255,255,255,0.05)',
  inputBg: 'rgba(255,255,255,0.06)',
  navBg: 'rgba(22, 17, 15, 0.85)',
};

const isWeb = Platform.OS === 'web';

const isDarkWeb = () =>
  typeof document !== 'undefined' &&
  document.body?.getAttribute('data-theme') === 'dark';

const useThemeWeb = () => {
  const [dark, setDark] = useState(isDarkWeb());
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDarkWeb()));
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    const onMsg = (e) => {
      if (e.data?.type === 'THEME_CHANGE') {
        document.body.setAttribute('data-theme', e.data.isDark ? 'dark' : '');
      }
      if (e.data?.type === 'REQUEST_INITIAL_THEME') return;
    };
    window.addEventListener('message', onMsg);
    try { window.parent?.postMessage({ type: 'REQUEST_INITIAL_THEME' }, '*'); } catch {}
    return () => { obs.disconnect(); window.removeEventListener('message', onMsg); };
  }, []);
  return dark ? darkTokens : lightTokens;
};

const useThemeNative = () => {
  const [dark, setDark] = useState(Appearance.getColorScheme() === 'dark');
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setDark(colorScheme === 'dark');
    });
    return () => sub.remove();
  }, []);
  return dark ? darkTokens : lightTokens;
};

export const useTheme = isWeb ? useThemeWeb : useThemeNative;
