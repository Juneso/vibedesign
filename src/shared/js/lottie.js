/**
 * AI 전용 Lottie 애니메이션을 로드합니다.
 */
export const loadAiLottie = async (container, speed = 1) => {
  const lottiePlayer = window.lottie || window.bodymovin;
  const isDarkMode = document.body.getAttribute('data-theme') === 'dark';

  if (!lottiePlayer) {
    console.log('loadAiLottie: Lottie 플레이어를 찾을 수 없어 정적 아이콘을 사용합니다.');
    const fallbackSrc = isDarkMode ? '/assets/ai_fill_dark.svg' : '/assets/ai_fill_light.svg';
    container.innerHTML = `<img src="${fallbackSrc}" style="width: 20px; height: 20px; display: block;" alt="AI">`;
    return null;
  }

  // NOTE: When running inside an iframe, path might need adjustment based on base URL
  const lottiePath = `/assets/${isDarkMode ? 'AI-entrance-dark.json' : 'AI-entrance-light.json'}`;

  // 애니메이션 생성 전 JSON 데이터를 먼저 불러옵니다.
  let animData;
  try {
    const resp = await fetch(lottiePath + '?v=' + Date.now());
    animData = await resp.json();
  } catch (e) {
    console.error('loadAiLottie: JSON 로드 실패', e);
    const fallbackSrc = isDarkMode ? '/assets/ai_fill_dark.svg' : '/assets/ai_fill_light.svg';
    container.innerHTML = `<img src="${fallbackSrc}" style="width: 20px; height: 20px; display: block;" alt="AI">`;
    return null;
  }

  container.innerHTML = '';
  const anim = lottiePlayer.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: false,
    autoplay: true,
    animationData: animData,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid meet'
    }
  });

  anim.setSpeed(speed);
  return anim;
};

/**
 * EQ 사운드웨이브 Lottie 애니메이션을 로드합니다. (루프)
 */
export const loadEqLottie = async (container) => {
  const lottiePlayer = window.lottie || window.bodymovin;
  const isDarkMode = document.body.getAttribute('data-theme') === 'dark';

  if (!lottiePlayer) return null;

  const lottiePath = `/assets/${isDarkMode ? 'lottie_eq_active_wave_dark.json' : 'lottie_eq_active_wave.json'}`;

  let animData;
  try {
    const resp = await fetch(lottiePath + '?v=' + Date.now());
    animData = await resp.json();
  } catch (e) {
    console.error('loadEqLottie: 로드 실패', e);
    return null;
  }

  container.innerHTML = '';
  const anim = lottiePlayer.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: animData,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid meet'
    }
  });

  return anim;
};

/**
 * 화살표(Chevron) Lottie 애니메이션을 로드합니다.
 */
export const loadChevronLottie = async (container) => {
  const lottiePlayer = window.lottie || window.bodymovin;
  const isDarkMode = document.body.getAttribute('data-theme') === 'dark';

  if (!lottiePlayer) return null;

  const lottiePath = `/assets/${isDarkMode ? 'lottie_ai_chevron_right_dark.json' : 'lottie_ai_chevron_right.json'}`;

  let animData;
  try {
    const resp = await fetch(lottiePath);
    animData = await resp.json();
  } catch (e) {
    console.error('loadChevronLottie: 로드 실패', e);
    return null;
  }

  container.innerHTML = '';
  const anim = lottiePlayer.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: animData,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid meet'
    }
  });

  return anim;
};
