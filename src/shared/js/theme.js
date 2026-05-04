/**
 * 다크/라이트 테마를 토글하는 전역 기능
 */
export const toggleTheme = () => {
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  const nextIsDark = !isDark;

  if (isDark) {
    document.body.removeAttribute('data-theme');
  } else {
    document.body.setAttribute('data-theme', 'dark');
  }

  // 모바일 텍스트 토글만 업데이트 (데스크톱은 sun/moon 아이콘 스위치라 CSS로 자동 반영)
  const mobileThemeToggle = document.getElementById('mobile-theme-toggle');
  if (mobileThemeToggle) {
    mobileThemeToggle.textContent = nextIsDark ? '라이트모드 토글' : '다크모드 토글';
  }

  // 메인 iframe + variation 모드의 모든 iframe(.variation-frame iframe)에 broadcast
  const allIframes = document.querySelectorAll('#experiment-frame, .variation-frame iframe');
  allIframes.forEach(f => {
    f.contentWindow?.postMessage({ type: 'THEME_CHANGE', isDark: nextIsDark }, '*');
  });
};

/**
 * 자식(Iframe) 환경에서 부모의 테마 변경 메시지를 수신하는 리스너
 */
export const initIframeThemeListener = () => {
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'THEME_CHANGE') {
      if (e.data.isDark) {
        document.body.setAttribute('data-theme', 'dark');
      } else {
        document.body.removeAttribute('data-theme');
      }
      
      // Dispatch custom event for experiments that need to rerender something based on theme
      window.dispatchEvent(new CustomEvent('themechanged', { detail: { isDark: e.data.isDark } }));
    }
  });

  // Sync initial theme from parent
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'REQUEST_INITIAL_THEME' }, '*');
  } else {
    // 독립 실행(모바일 직접 접근) — 시스템 prefers-color-scheme 따름
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applySystemTheme = (dark) => {
      if (dark) {
        document.body.setAttribute('data-theme', 'dark');
      } else {
        document.body.removeAttribute('data-theme');
      }
    };
    applySystemTheme(mq.matches);
    mq.addEventListener('change', e => applySystemTheme(e.matches));
  }
};
