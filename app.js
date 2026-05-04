/**
 * 🎨 AI 다이얼러 프로토타입 핵심 로직 (app.js)
 * 
 * [설계 가이드라인]
 * 1. 애니메이션: framer-motion (motion 패키지)을 사용하여 물리 기반(spring) 모션을 구현합니다.
 * 2. 설정(Config): 모든 애니메이션 수치(stiffness, damping, opacity 등)는 `baseConfig`와 각 페이지별 설정 객체에서 관리합니다.
 * 3. 다크모드: body[data-theme="dark"] 속성에 따라 다크모드 전용 수치를 적용합니다.
 * 4. 유지보수: 새로운 인터랙션 추가 시 `safeAnimate` 유틸리티를 사용하여 애니메이션 중복 실행을 방지하세요.
 */
import { animate, spring } from 'motion';

// 애니메이션 중복 실행 방지를 위한 추적 객체 (WeakMap을 사용하여 메모리 관리)
const activeAnimations = new WeakMap();

/**
 * 특정 요소에서 실행 중인 모든 애니메이션을 중단합니다.
 */
const stopAnimations = (element) => {
  if (!element) return;
  const controls = activeAnimations.get(element);
  if (controls) {
    controls.forEach(c => {
      try { c.stop(); } catch (e) { }
    });
    activeAnimations.delete(element);
  }
};


/**
 * 요소를 안전하게 애니메이션화하고 등록합니다.
 * 새로운 애니메이션이 시작될 때 이전 상태와 충돌하지 않도록 관리합니다.
 */
const safeAnimate = (element, props, options) => {
  if (!element) return;
  const control = animate(element, props, options);

  if (!activeAnimations.has(element)) {
    activeAnimations.set(element, []);
  }
  activeAnimations.get(element).push(control);
  return control;
};



const navItems = document.querySelectorAll('.lab-nav-item');
const pages = document.querySelectorAll('.lab-page');

/**
 * 가상 페이지 전환 함수
 * @param {string} targetPage - 이동할 페이지의 data-page 값
 */
const switchPage = (targetPage) => {
  pages.forEach(p => p.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));

  const page = document.querySelector(`.lab-page[data-page="${targetPage}"]`);
  const nav = document.querySelector(`.lab-nav-item[data-page="${targetPage}"]`);

  if (page) page.classList.add('active');
  if (nav) nav.classList.add('active');

  // 토스트 등장 페이지(커스텀)에서 스크롤 트리거 설정
  if (targetPage === 'toast-entrance-custom' && page) {
    const toast = page.querySelector('.floating-toast');
    const scrollArea = page.querySelector('.toast-scroll-area');

    if (toast) {
      // 스크롤 시 토스트 보이기/숨기기 토글 로직
      if (scrollArea && !scrollArea.dataset.scrollListener) {
        scrollArea.dataset.scrollListener = "true";
        let lastToggleTime = 0;

        scrollArea.addEventListener('scroll', () => {
          const now = Date.now();
          // 무분별한 깜빡임 방지를 위한 800ms 쿨다운
          if (now - lastToggleTime < 800) return;

          if (typeof animateToast === 'function') {
            const isVisible = toast.classList.contains('visible');
            animateToast(toast, page, !isVisible);
            lastToggleTime = now;
          }
        });
      }
    }
  }
};

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const target = item.getAttribute('data-page');
    switchPage(target);
  });
});

// ── 글로벌 이벤트 및 초기화 ───────────────────────────────

animate('.header h2', { opacity: [0, 1], x: [-20, 0] }, { duration: 0.5 });

// -- Lottie (애니메이션 소스 로드) --

/**
 * AI 전용 Lottie 애니메이션을 로드합니다.
 */
const loadAiLottie = async (container, speed = 1) => {
  const lottiePlayer = window.lottie || window.bodymovin;
  const isDarkMode = document.body.getAttribute('data-theme') === 'dark';

  if (!lottiePlayer) {
    console.log('loadAiLottie: Lottie 플레이어를 찾을 수 없어 정적 아이콘을 사용합니다.');
    const fallbackSrc = isDarkMode ? 'assets/ai_fill_dark.svg' : 'assets/ai_fill_light.svg';
    container.innerHTML = `<img src="${fallbackSrc}" style="width: 20px; height: 20px; display: block;" alt="AI">`;
    return null;
  }

  const lottiePath = `./assets/${isDarkMode ? 'AI-entrance-dark.json' : 'AI-entrance-light.json'}`;

  // 애니메이션 생성 전 JSON 데이터를 먼저 불러옵니다.
  let animData;
  try {
    const resp = await fetch(lottiePath);
    animData = await resp.json();
  } catch (e) {
    console.error('loadAiLottie: JSON 로드 실패', e);
    const fallbackSrc = isDarkMode ? 'assets/ai_fill_dark.svg' : 'assets/ai_fill_light.svg';
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
 * 화살표(Chevron) Lottie 애니메이션을 로드합니다.
 */
const loadChevronLottie = async (container) => {
  const lottiePlayer = window.lottie || window.bodymovin;
  const isDarkMode = document.body.getAttribute('data-theme') === 'dark';

  if (!lottiePlayer) return null;

  const lottiePath = `./assets/${isDarkMode ? 'lottie_ai_chevron_right_dark.json' : 'lottie_ai_chevron_right.json'}`;

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


// ── 다이얼러 인터랙션 설정 ──────────────────────────────────
/**
 * 다이얼러의 번호 입력 및 AI 등장 로직을 초기화합니다.
 */
const setupDialer = (pageSelector, animConfig) => {
  const targetPages = document.querySelectorAll(pageSelector);
  if (!targetPages || targetPages.length === 0) return;

  targetPages.forEach(page => {
    const aiLottieContainer = page.querySelector('.ai-action-icon');
    let aiLottieAnim = null;

    const dialerDisplay = page.querySelector('.dialer-number h1');
    const kbBanner = page.querySelector('.contact-sync-banner');
    const aiEllipse = page.querySelector('.ai-bg-ellipse');
    const aiGradientCard = page.querySelector('.ai-entrance-container .mcp-card-wrapper');
    const glow = aiGradientCard?.querySelector('.mcp-card-glow');
    const borderEl = aiGradientCard?.querySelector('.mcp-card-glow-inner');
    const aiTopGradient = page.querySelector('.ai-top-gradient');
    const aiLeftGradient = page.querySelector('.ai-left-gradient');
    const aiLottieIcon = page.querySelector('.ai-action-icon > div');
    const deleteBtn = page.querySelector('.btn-delete');
    const keys = page.querySelectorAll('.dialer-keypad-area .key');

    if (!dialerDisplay) return;
    const aiEntranceContainer = page.querySelector('.ai-entrance-container');
    const PREFIX = '1588-';
    let currentNumber = PREFIX;
    let aiAnimated = false;
    let aiHideTimeout = null;

    /**
     * AI 등장 시퀀스를 즉시 숨깁니다.
     */
    const hideAiSequence = (duration = 0.1) => {
      if (aiGradientCard) animate(aiGradientCard, { opacity: 0, scale: 0.98 }, { duration: duration, ease: "linear" });
      if (aiTopGradient) animate(aiTopGradient, { opacity: 0 }, { duration: duration, ease: "linear" });
      if (aiEllipse) animate(aiEllipse, { opacity: 0 }, { duration: duration, ease: "linear" });

      setTimeout(() => {
        if (!aiAnimated && aiEntranceContainer) {
          aiEntranceContainer.style.display = 'none';
          if (aiGradientCard) aiGradientCard.classList.remove('visible');
          if (aiTopGradient) aiTopGradient.style.display = 'none';
          if (aiLottieAnim) aiLottieAnim.stop();
        }
      }, 310);
      aiAnimated = false;
    };

    /**
     * AI 등장 시퀀스를 실행합니다.
     */
    const runAiSequence = () => {
      const isDark = document.body.getAttribute('data-theme') === 'dark';

      // 테마 기반 투명도를 계산하는 헬퍼 함수
      const getOpacity = (base, darkVal = 0.3) => {
        if (!isDark) return base;
        const val = Array.isArray(darkVal) ? darkVal[1] : darkVal;
        return val;
      };

      if (aiEllipse) {
        // 기존에 실행 중인 애니메이션이 있다면 모두 중단 (중첩 방지)
        stopAnimations(aiEllipse);
        if (aiTopGradient) stopAnimations(aiTopGradient);
        if (aiGradientCard) stopAnimations(aiGradientCard);
        if (glow) stopAnimations(glow);

        if (aiEntranceContainer) aiEntranceContainer.style.display = 'block';

        // 1. 초기 상태 설정: 등장 애니메이션이 시작되기 전 깜빡임 방지
        if (aiEllipse) {
          aiEllipse.style.display = 'block';
          aiEllipse.style.opacity = '0';
          const startY = Array.isArray(animConfig.ellipseYIn) ? animConfig.ellipseYIn[0] : (animConfig.ellipseYIn || 0);
          const startScale = Array.isArray(animConfig.ellipseScaleIn) ? animConfig.ellipseScaleIn[0] : (animConfig.ellipseScaleIn || 1);
          aiEllipse.style.transform = `translateX(-50%) translateY(${startY}px) scale(${startScale}) rotate(${animConfig.ellipseRotateIn || 0}deg)`;
        }

        if (aiTopGradient) {
          aiTopGradient.style.opacity = '0';
          const startScale = Array.isArray(animConfig.topGradientScaleIn) ? animConfig.topGradientScaleIn[0] : (animConfig.topGradientScaleIn || 1);
          const startY = Array.isArray(animConfig.topGradientYIn) ? animConfig.topGradientYIn[0] : (animConfig.topGradientYIn || 0);
          aiTopGradient.style.transform = `translateX(-50%) translateY(${startY}px) scale(${startScale})`;
        }



        if (aiGradientCard) {
          aiGradientCard.style.opacity = '0';
          const startY = Array.isArray(animConfig.gradientYIn) ? animConfig.gradientYIn[0] : (animConfig.gradientYIn || 0);
          const startScale = Array.isArray(animConfig.gradientScaleIn) ? animConfig.gradientScaleIn[0] : (animConfig.gradientScaleIn || 1);
          aiGradientCard.style.transform = `translateX(-50%) translateY(${startY}px) scale(${startScale})`;
        }

        if (glow) {
          glow.style.opacity = '0';
          const startScale = Array.isArray(animConfig.glowScaleIn) ? animConfig.glowScaleIn[0] : (animConfig.glowScaleIn || 0.9);
          glow.style.transform = `scale(${startScale})`;
        }

        // Remove special hack to allow standard top: 850px (type-toast) or top: -420px (base) to work consistently

        // 2. 실제 등장 애니메이션 시작
        setTimeout(() => {
          // 배경 타원(Ellipse) 등장
          const ellipseTargetOpacity = Array.isArray(animConfig.ellipseOpacityIn) ? animConfig.ellipseOpacityIn[1] : (animConfig.ellipseOpacityIn || 0.7);
          const darkTargetOpacity = animConfig.darkEllipseOpacityIn || 0.3;
          safeAnimate(aiEllipse, { opacity: [0, getOpacity(ellipseTargetOpacity, darkTargetOpacity)] }, { duration: animConfig.ellipseInDuration, ease: "linear" });
          safeAnimate(aiEllipse, { y: animConfig.ellipseYIn, scale: animConfig.ellipseScaleIn, rotate: animConfig.ellipseRotateIn, x: "-50%" }, animConfig.ellipseSpringIn);

          // 3. 일회성 페이드아웃 처리 (Hold Time이 설정된 경우)
          if (!animConfig.infiniteGlow && animConfig.ellipseHoldTime > 0) {
            setTimeout(() => {
              if (aiEllipse) safeAnimate(aiEllipse, { opacity: 0 }, { duration: animConfig.ellipseOutDuration || 0.5, ease: "linear" });
            }, animConfig.ellipseHoldTime);
          }

          // 4. 상단 그라디언트(Top Gradient) 애니메이션
          if (aiTopGradient && animConfig.showTopGradient) {
            aiTopGradient.style.display = 'block';
            aiTopGradient.style.width = animConfig.topGradientWidth || '395px';
            aiTopGradient.style.height = animConfig.topGradientHeight || '254px';
            const topGradTargetOpacity = Array.isArray(animConfig.topGradientOpacityIn) ? animConfig.topGradientOpacityIn[1] : (animConfig.topGradientOpacityIn || 1);
            const topGradAnim = safeAnimate(aiTopGradient, { opacity: [0, getOpacity(topGradTargetOpacity, 0.2)], scale: animConfig.topGradientScaleIn, y: animConfig.topGradientYIn, x: animConfig.topGradientXIn }, {
              ...animConfig.topGradientSpringIn,
              delay: animConfig.topGradientInDelay
            });

            const topGradPromise = topGradAnim && topGradAnim.finished ? topGradAnim.finished : Promise.resolve(topGradAnim);
            topGradPromise.then(() => {
              // 무한 호흡 효과가 활성화된 경우
              if (animConfig.infiniteGlow) {
                safeAnimate(aiTopGradient, {
                  scale: [1, animConfig.topGradientBreatheScale[1], 1]
                }, {
                  duration: animConfig.topGradientBreatheDuration,
                  repeat: Infinity,
                  ease: "easeInOut"
                });
              }
            });

            // 일정 시간 후 자동으로 사라지는 옵션 (One-shot)
            if (!animConfig.infiniteGlow && animConfig.topGradientHoldTime > 0) {
              setTimeout(() => {
                safeAnimate(aiTopGradient, { opacity: 0 }, { duration: 1, ease: "linear" });
              }, animConfig.topGradientHoldTime);
            }
          }

          // 5. 왼쪽 그라디언트(Left Gradient) 애니메이션
          if (aiLeftGradient && animConfig.showLeftGradient) {
            aiLeftGradient.style.display = 'block';

            // 등장
            const leftGradTargetOpacity = Array.isArray(animConfig.leftGradientOpacityIn) ? animConfig.leftGradientOpacityIn[1] : (animConfig.leftGradientOpacityIn || 1);
            safeAnimate(aiLeftGradient, { opacity: [0, getOpacity(leftGradTargetOpacity, 0.3)] }, { duration: animConfig.leftGradientInDuration || 0.2, ease: "linear", delay: animConfig.leftGradientInDelay || 0 });
            safeAnimate(aiLeftGradient, { x: animConfig.leftGradientXIn || ["-100%", "10%"], y: animConfig.leftGradientYIn !== undefined ? animConfig.leftGradientYIn : 0 }, { ...animConfig.leftGradientSpringIn, delay: animConfig.leftGradientInDelay || 0 });

            // 일정 시간 후 사라지는 옵션
            if (!animConfig.infiniteGlow && animConfig.leftGradientHoldTime > 0) {
              setTimeout(() => {
                safeAnimate(aiLeftGradient, { opacity: 0 }, { duration: animConfig.leftGradientOutDuration || 0.5, ease: "linear" });
              }, animConfig.leftGradientHoldTime);
            }
          }


          // 6. 야광(Glow) 효과 및 테두리 회전 효과
          if (glow) {
            const runGlow = () => {
              glow.style.display = 'block';

              // 야광 효과 등장
              const targetOpacity = animConfig.glowOpacityIn !== undefined ? animConfig.glowOpacityIn : [0, 0.7];
              const targetScale = animConfig.glowScaleIn !== undefined ? animConfig.glowScaleIn : [0.8, 1];

              const targetOpacityVal = Array.isArray(targetOpacity) ? targetOpacity[1] : (targetOpacity || 0.7);
              const entrance = safeAnimate(glow,
                { opacity: [0, getOpacity(targetOpacityVal, 0.3)], scale: targetScale },
                { duration: animConfig.glowInDuration || 0.15, ease: animConfig.glowInEase || "easeOut" }
              );

              // 무한 회전 루프 (CSS 변수 활용)
              if (animConfig.glowRotationDuration > 0) {
                const rotationRepeat = animConfig.glowRotationRepeat !== undefined ? animConfig.glowRotationRepeat : Infinity;
                const glowControl = animate((progress) => {
                  const angle = progress * 360;
                  glow.style.setProperty('--glow-rotate', `${angle}deg`);
                }, { duration: animConfig.glowRotationDuration, repeat: rotationRepeat, ease: "linear" });

                if (!activeAnimations.has(glow)) activeAnimations.set(glow, []);
                activeAnimations.get(glow).push(glowControl);
              }

              // 야광 효과 호흡(Breathe) - 등장이 끝난 후 시작
              entrance.finished.then(() => {
                if (animConfig.glowBreatheScale && animConfig.glowBreatheDuration > 0) {
                  const breatheRepeat = animConfig.glowBreatheRepeat !== undefined ? animConfig.glowBreatheRepeat : Infinity;
                  safeAnimate(glow,
                    {
                      scale: animConfig.glowBreatheScale,
                      opacity: isDark ? [0.1, 0.3] : (animConfig.glowBreatheOpacity || [0.2, 0.5])
                    },
                    { duration: animConfig.glowBreatheDuration, repeat: breatheRepeat, ease: "easeOut", repeatType: "reverse" }
                  );
                }
              });

              // 야광 효과 페이드아웃 처리 (glowMode에 따라 성능 최적화)
              const mode = animConfig.glowMode || 'oneshot';
              if (mode === 'oneshot' && animConfig.glowHoldTime > 0) {
                setTimeout(() => {
                  safeAnimate(glow, { opacity: 0 }, { duration: 0.6, ease: "linear" }).finished.then(() => {
                    glow.style.display = 'none';
                  });

                  if (borderEl) {
                    animate((p) => {
                      borderEl.style.setProperty('--border-opacity', Math.max(0, 1 - p).toString());
                    }, { duration: 0.3, ease: "linear" });
                  }
                }, animConfig.glowHoldTime);
              }
            };

            if (animConfig.glowInDelay > 0) {
              setTimeout(runGlow, (animConfig.glowInDelay) * 1000);
            } else {
              runGlow();
            }
          }

          // 7. 메인 AI 그라디언트 카드(Modal) 등장
          // 특정 딜레이 후에 모달을 부드럽게 띄웁니다.
          setTimeout(() => {
            if (aiGradientCard) {
              aiGradientCard.classList.add('visible');

              // CSS 변수들을 카드 요소에 주입하여 모션 제어
              aiGradientCard.style.setProperty('--rotation-duration', `${animConfig.cardRotationDuration}s`);
              aiGradientCard.style.setProperty('--rotation-easing', animConfig.rotationEasing);
              aiGradientCard.style.setProperty('--card-rotation-opacity', animConfig.rotationOpacity || (isDark ? '1' : '0.7'));

              if (!isDark) {
                aiGradientCard.style.setProperty('--card-rotation-gradient', animConfig.rotationGradient);
              } else {
                aiGradientCard.style.removeProperty('--card-rotation-gradient');
              }

              animate(aiGradientCard, { y: animConfig.gradientYIn, scale: animConfig.gradientScaleIn, x: "-50%" }, animConfig.gradientSpringIn);
              animate(aiGradientCard, { opacity: animConfig.gradientOpacityIn || 1 }, { duration: animConfig.gradientInDuration, ease: "linear", delay: animConfig.gradientOpacityDelay || 0 });

              // 카드 내부의 Lottie 아이콘 로드
              const gradientIconBox = aiGradientCard.querySelector('.mcp-icon-box');
              if (gradientIconBox) {
                (async () => {
                  const gradientAnim = await loadAiLottie(gradientIconBox, 1.0);
                  if (gradientAnim) {
                    setTimeout(() => {
                      gradientIconBox.style.opacity = '1';
                      gradientAnim.setSpeed(1.0);
                    }, 100);
                  }
                })();
              }
            }
          }, animConfig.showModalDelay || 100);
        }, animConfig.initialDelay);

        // 7초 후 자동 숨김 로직 (AI 시퀀스 유지 시간 조절)
        if (aiHideTimeout) clearTimeout(aiHideTimeout);
        aiHideTimeout = setTimeout(() => {
          if (aiAnimated && currentNumber === '1588-1688') {
            console.log('AI 시퀀스: 7초 후 자동 숨김 실행');
            hideAiSequence(0.2);
          }
        }, 6000);
      }
    };

    /**
     * 번호판 디스플레이를 업데이트하고 AI 트리거 여부를 확인합니다.
     */
    const updateDisplay = () => {
      dialerDisplay.textContent = currentNumber;

      if (kbBanner) {
        if (currentNumber === '1588-1688') {
          kbBanner.classList.add('visible');

          // 트리거 번호가 일치하면 AI 시퀀스 실행
          if (!aiAnimated) {
            aiAnimated = true;
            runAiSequence();
          }
        } else {
          // 번호가 지워지면 AI 요소들 숨김
          kbBanner.classList.remove('visible');
          if (aiHideTimeout) clearTimeout(aiHideTimeout);
          hideAiSequence();
        }
      }
    };

    if (aiGradientCard) {
      aiGradientCard.addEventListener('click', (e) => {
        e.stopPropagation();
        hideAiSequence();
        if (aiHideTimeout) clearTimeout(aiHideTimeout);
      });
    }

    // Automatic Trigger for special pages
    const isOneShotPage = pageSelector.includes('ai-impact-entrance') ||
      pageSelector.includes('ai-recent-gradient-adjust') ||
      pageSelector.includes('ai-snappy-entrance') ||
      pageSelector.includes('ai-recent-entrance') ||
      pageSelector.includes('ai-call-log-entrance');

    /* 
    if (isOneShotPage && !aiAnimated) {
      aiAnimated = true;
      runAiSequence();
    }
    */

    // Click trigger for background image
    const recentBg = page.querySelector('.recent-bg-img');
    if (recentBg) {
      recentBg.addEventListener('click', () => {
        if (!aiAnimated) {
          aiAnimated = true;
          runAiSequence();
        }
      });
    }

    // "나중에" 버튼 클릭 시 상태 초기화
    const dismissBtn = page.querySelector('.mcp-btn-secondary');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentNumber = PREFIX;
        updateDisplay();
      });
    }

    if (keys) {
      keys.forEach(key => {
        key.addEventListener('click', () => {
          const numSpan = key.querySelector('.num');
          if (!numSpan) return; // skip * and # glyph keys without .num

          const digit = numSpan.textContent;
          currentNumber += digit;
          updateDisplay();
        });
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        // Don't delete past the prefix
        if (currentNumber.length > PREFIX.length) {
          currentNumber = currentNumber.slice(0, -1);
          updateDisplay();
        }
      });
    }

    // 물리 키보드 입력 지원 (데스크톱 환경용)
    const handleKeyDown = (e) => {
      const activePage = document.querySelector('.lab-page.active');
      if (activePage !== page) return;

      if (e.key >= '0' && e.key <= '9') {
        currentNumber += e.key;
        updateDisplay();
      } else if (e.key === 'Backspace') {
        if (currentNumber.length > PREFIX.length) {
          currentNumber = currentNumber.slice(0, -1);
          updateDisplay();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // 배경 이미지 클릭 시 테스트용 자동 입력 트리거
    const bgImg = page.querySelector('.recent-bg-img');
    if (bgImg) {
      bgImg.addEventListener('click', () => {
        currentNumber = '1588-1688';
        updateDisplay();
      });
    }

    // 초기 화면 렌더링
    updateDisplay();
  });
};

/**
 * 💡 [핵심 설정] baseConfig
 * 애니메이션의 물리 수치(stiffness, damping)와 타이밍을 중앙 관리합니다.
 */
const baseConfig = {
  // --- 공통 전역 설정 ---
  initialDelay: 100,          // 페이지 진입 후 시퀀스 시작 전 대기 (ms)
  showModalDelay: 100,         // 모달 등장 지연 시간 (ms)

  // --- 배경 파동 효과 설정 ---
  ellipseOpacityIn: [0, 0.5],
  darkEllipseOpacityIn: [0, 0.2],
  ellipseInDuration: 0.2,
  ellipseYIn: [540, 440],
  ellipseScaleIn: [0.6, 1.2],
  ellipseRotateIn: 0,
  ellipseSpringIn: { type: "spring", stiffness: 200, damping: 40 },
  ellipseOutDuration: 0.5,
  ellipseHoldTime: 600,

  // --- 모달 카드 효과 설정 ---
  gradientYIn: [70, 0],
  gradientScaleIn: [0.9, 1],
  gradientSpringIn: { type: "spring", stiffness: 220, damping: 40 },
  gradientOpacityIn: [0, 1],
  gradientInDuration: 0.2,
  gradientOpacityDelay: 0,

  // --- 모달 라인 효과 설정 ---
  cardRotationDuration: 3,
  rotationEasing: "linear",
  rotationOpacity: 0.7,
  rotationGradient: "conic-gradient(from 180deg at 50% 50%, rgba(234, 249, 255, 1) 0deg, rgba(234, 249, 255, 1) 72deg, rgba(97, 207, 179, 1) 144deg, rgba(41, 181, 203, 1) 180deg, rgba(65, 144, 240, 1) 216deg, rgba(234, 249, 255, 1) 288deg, rgba(234, 249, 255, 1) 360deg)",

  // --- 야광(Glow) 효과 설정 ---
  glowMode: 'infinite',
  glowBreatheScale: [0.9, 1],
  glowBreatheOpacity: [0.8, 1],
  glowBreatheDuration: 1,

  // --- 전역 상단 그라디언트(Beam) 설정 ---
  showTopGradient: true,
  topGradientYIn: [-100, -55],
  topGradientScaleIn: [2.5, 1],
  topGradientOpacityIn: [0, 0.85],
  topGradientXIn: "-50%",
  topGradientSpringIn: { type: "spring", stiffness: 170, damping: 25 },
  topGradientInDelay: 0.1,
  topGradientBreatheDuration: 3,
  topGradientHoldTime: 900,
  topGradientWidth: "395px",
  topGradientHeight: "254px",

  // --- 토스트(Toast) 전용 설정 ---
  toastRotationOpacity: 1,
  toastStartY: -10,           // 등장 시작 Y 위치
  toastEndY: -40,             // 최종 목적지 Y 위치
  toastEllipseStartY: -120,    // 토스트 배경 타원 시작 Y
  toastEllipseEndY: -150,      // 토스트 배경 타원 목적지 Y
  toastLightShadow: "0 2px 50px rgba(37, 221, 255, 0.20), 0 2px 20px rgba(0, 152, 224, 0.30)",
  toastDarkShadow: "0 2px 20px rgba(66, 124, 205, 0.30), 0 2px 50px rgba(0, 145, 171, 0.20)",
};

// --- 다이얼러 설정 적용 ---
setupDialer('section.lab-page[data-page="ai-dialer-base"], section.lab-page[data-page="ai-recent-gradient-adjust"], section.lab-page[data-page="toast-entrance-custom"]', baseConfig);




// ── Utility Functions ──────────────────────
function updateCallLogBackground(activePage, isCallEnded, isDark) {
  if (!activePage) return;
  const bgImg = activePage.querySelector('.call-end-bg-img');
  if (bgImg && isCallEnded) {
    bgImg.src = isDark ? '/assets/call-end-dark.png' : '/assets/call-end.png';
  }
}

// ── 🍞 토스트 토글 인터랙션 ──────────────────────
const callBtns = document.querySelectorAll('.biz-call-btn');
let isToastVisible = false;
let toastHideTimeout = null;

/**
 * 플로팅 토스트의 등장/퇴장 애니메이션을 제어합니다.
 */
const animateToast = async (toast, activePage, show = true, duration = 0.1) => {
  if (!toast) return;
  // 현재 상태와 동일하게 요청된 경우 무시 (중복 실행 방지)
  if (show && toast.classList.contains('visible')) return;
  if (!show && !toast.classList.contains('visible')) return;
  const pageId = activePage?.getAttribute('data-page') || '';
  const isCallEnded = pageId.includes('ai-call-log-entrance');

  const config = baseConfig;

  // Custom offsets per page type for the ellipse only
  // 토스트 배경 타원 Y 위치 설정
  const ellipseY = config.toastEllipseEndY;


  if (show) {
    if (toast) {
      stopAnimations(toast);
      toast.classList.add('visible');

      // Apply toast rotation opacity from config
      const isDarkMode = document.body.getAttribute('data-theme') === 'dark';

      // Update background image for call log entrance based on theme
      updateCallLogBackground(activePage, isCallEnded, isDarkMode);

      const toastOpacity = baseConfig.toastRotationOpacity || 1;
      toast.style.setProperty('--toast-rotation-opacity', toastOpacity);

      // 테마별 그림자 효과(Drop Shadow) 적용
      const currentShadow = isDarkMode ? config.toastDarkShadow : config.toastLightShadow;
      if (currentShadow) {
        toast.style.setProperty('--toast-shadow', currentShadow);
      }

      // 시작 위치 명시적 설정 (CSS와의 간섭 방지)
      const toastStartY = config.toastStartY;
      toast.style.transform = `translateX(-50%) translateY(${toastStartY}px) scale(0.95)`;

      const toastEndY = config.toastEndY;
      // 중앙 정렬을 유지하며 위로 솟아오르는 스프링 모션 실행
      safeAnimate(toast,
        { y: [toastStartY, toastEndY], scale: [0.95, 1], x: ["-50%", "-50%"] },
        { type: "spring", stiffness: 450, damping: 50, delay: 0 }
      );
      safeAnimate(toast, { opacity: [0, 1] }, { duration: 0.15, ease: "linear", delay: 0 });

      // Lottie 시작을 위한 지연 시간
      const toastLottieContainer = toast.querySelector('.ft-ai-icon, .mcp-ai-icon, [id^="ai-lottie"]');
      if (toastLottieContainer) {
        toastLottieContainer.style.opacity = '0';
        setTimeout(async () => {
          const anim = await loadAiLottie(toastLottieContainer, 1);
          if (anim) {
            anim.setSpeed(1);
            toastLottieContainer.style.opacity = '1';
          }
        }, 50);
      }

      // 쉐브론 Lottie 로드
      const toastChevronContainer = toast.querySelector('.ft-chevron');
      if (toastChevronContainer) {
        loadChevronLottie(toastChevronContainer);
      }
    }

    // 토스트 등장 페이지 파동 효과
    const aiEllipse = activePage?.querySelector('.ai-bg-ellipse');

    // Safety: Hide all other ellipses across the app to prevent duplicates/overlap
    document.querySelectorAll('.ai-bg-ellipse').forEach(el => {
      if (el !== aiEllipse) el.style.opacity = '0';
    });

    if (aiEllipse) {
      stopAnimations(aiEllipse);
      const aiEntranceContainer = activePage.querySelector('.ai-entrance-container');
      if (aiEntranceContainer) aiEntranceContainer.style.display = 'block';

      const isDarkMode = document.body.getAttribute('data-theme') === 'dark';
      // 유저 요청으로 설정에서 제거됨: 기본값 0 사용
      let startOpacity = isDarkMode ? (config.ellipseDarkOpacity ?? 0) : (config.ellipseLightOpacity ?? 0);

      const startY = config.toastEllipseStartY;
      const ellipseY = config.toastEllipseEndY;

      safeAnimate(aiEllipse, { opacity: [0, startOpacity] }, { duration: 0.2, ease: "linear", delay: 0 });
      safeAnimate(aiEllipse,
        {
          y: [startY, ellipseY],
          scale: [1, 1], // 고정 스케일
          x: ["-50%", "-50%"]
        },
        { type: "spring", stiffness: 250, damping: 40 }
      );

      /* Toast background breathing effect disabled per user request
      if (baseConfig.infiniteGlow) {
        safeAnimate(aiEllipse, {
          scale: baseConfig.ellipseBreatheScale || [1, 1.2],
          opacity: [Math.max(0, startOpacity - 0.2), startOpacity]
        }, {
          duration: baseConfig.ellipseBreatheDuration || 2,
          repeat: Infinity,
          direction: "alternate",
          ease: "easeInOut"
        });
      } else {
        setTimeout(() => {
          safeAnimate(aiEllipse, { opacity: 0 }, { duration: 0.5, ease: "linear" });
        }, 700);
      }
      */

      // AI 요소 숨김: 6초 후 자동 숨김 처리 (사용자 피드백 반영)
      if (toastHideTimeout) clearTimeout(toastHideTimeout);
      toastHideTimeout = setTimeout(() => {
        if (toast.classList.contains('visible')) {
          console.log('토스트: 6초 후 자동 숨김 실행');
          animateToast(toast, activePage, false, 0.2);
          isToastVisible = false;
        }
      }, 6000);
    }
  } else {
    if (toastHideTimeout) clearTimeout(toastHideTimeout);
    toast.classList.remove('visible');
    safeAnimate(toast,
      { opacity: [1, 0], scale: [1, 0.98], x: ["-50%", "-50%"] },
      { duration: duration, ease: "linear" }
    );
    // 토스트 닫기 시 배경 타원도 함께 페이드아웃
    const aiEllipse = activePage?.querySelector('.ai-bg-ellipse');
    if (aiEllipse) {
      stopAnimations(aiEllipse);
      safeAnimate(aiEllipse, { opacity: 0 }, { duration: duration, ease: "linear" });
    }
  }
};

if (callBtns.length > 0) {
  callBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const activePage = document.querySelector('.lab-page.active');
      const toast = activePage?.querySelector('.floating-toast');

      if (toast && !toast.classList.contains('visible')) {
        animateToast(toast, activePage, true);
        isToastVisible = true;
      } else if (toast) {
        animateToast(toast, activePage, false);
        isToastVisible = false;
      }
    });
  });
}

// 토스트 영역 클릭 시 닫기 (글로벌)
document.querySelectorAll('.floating-toast').forEach(toast => {
  toast.addEventListener('click', () => {
    if (isToastVisible) {
      const activePage = document.querySelector('.lab-page.active');
      animateToast(toast, activePage, false);
      isToastVisible = false;
    }
  });
});

// 통화 종료 화면 배경 클릭 시 토스트 보이기/숨기기
const callEndBgs = document.querySelectorAll('.call-end-bg-img');
callEndBgs.forEach(bg => {
  bg.addEventListener('click', () => {
    const activePage = bg.closest('.lab-page');
    const toast = activePage?.querySelector('.floating-toast');
    if (!toast) return;

    if (!toast.classList.contains('visible')) {
      animateToast(toast, activePage, true);
      isToastVisible = true;
    } else {
      animateToast(toast, activePage, false);
      isToastVisible = false;
    }
  });
});

// ── 📱 모바일 네비게이션 로직 ──────────────────────────────
const mobileNavToggle = document.getElementById('mobile-nav-toggle');
const mobileNavOverlay = document.getElementById('mobile-nav-overlay');
const mobileNavClose = document.getElementById('mobile-nav-close');
const mobileNavItems = document.querySelectorAll('.mobile-nav-list li');

if (mobileNavToggle && mobileNavOverlay) {
  console.log('Mobile nav elements found');
  mobileNavToggle.addEventListener('click', (e) => {
    console.log('Mobile nav toggle clicked');
    e.preventDefault();
    e.stopPropagation();
    mobileNavOverlay.classList.add('active');
  });

  const closeMenu = () => {
    mobileNavOverlay.classList.remove('active');
  };

  if (mobileNavClose) {
    mobileNavClose.addEventListener('click', closeMenu);
  }

  mobileNavOverlay.addEventListener('click', (e) => {
    if (e.target === mobileNavOverlay) closeMenu();
  });

  if (mobileNavItems) {
    mobileNavItems.forEach(item => {
      // Ignore theme toggle list item
      if (item.classList.contains('theme-toggle')) return;

      item.addEventListener('click', () => {
        const targetPage = item.getAttribute('data-page');

        // Update UI
        mobileNavItems.forEach(li => li.classList.remove('active'));
        item.classList.add('active');

        // Switch Page
        switchPage(targetPage);

        // Close Menu
        closeMenu();
      });
    });
  }

  // --- 테마 전환 (라이트/다크) ---
  const desktopThemeToggle = document.getElementById('theme-toggle');
  const mobileThemeToggle = document.getElementById('mobile-theme-toggle');

  const toggleTheme = () => {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const nextIsDark = !isDark;

    if (isDark) {
      document.body.removeAttribute('data-theme');
      if (desktopThemeToggle) desktopThemeToggle.textContent = '다크모드';
      if (mobileThemeToggle) mobileThemeToggle.textContent = '다크모드 토글';
    } else {
      document.body.setAttribute('data-theme', 'dark');
      if (desktopThemeToggle) desktopThemeToggle.textContent = '라이트모드';
      if (mobileThemeToggle) mobileThemeToggle.textContent = '라이트모드 토글';
    }

    // 통화 기록 페이지 배경 이미지 실시간 업데이트
    const activeCallLogPage = document.querySelector('.lab-page[data-page="ai-call-log-entrance"].active');
    if (activeCallLogPage) {
      updateCallLogBackground(activeCallLogPage, true, nextIsDark);
    }

    // 활성화된 토스트의 그림자 실시간 업데이트
    const activePage = document.querySelector('.lab-page.active');
    if (activePage) {
      const pageId = activePage.getAttribute('data-page') || '';
      let config = window.defaultToastAnimConfig; // 기본값 폴백
      if (pageId === 'toast-entrance') config = window.toastEntranceConfig;
      else if (pageId === 'toast-entrance-custom') config = window.toastEntranceCustomConfig;
      else if (pageId === 'ai-call-log-entrance') config = window.callLogEntranceConfig;
      else if (pageId === 'ai-call-log-entrance-custom') config = window.callLogEntranceCustomConfig;

      if (config) {
        const toast = activePage.querySelector('.floating-toast');
        if (toast) {
          const currentShadow = nextIsDark ? config.toastDarkShadow : config.toastLightShadow;
          if (currentShadow) toast.style.setProperty('--toast-shadow', currentShadow);
        }
      }
    }

    // 모든 쉐브론 아이콘을 현재 테마에 맞춰 새로고침
    document.querySelectorAll('.ft-chevron').forEach(el => loadChevronLottie(el));
  };

  if (desktopThemeToggle) desktopThemeToggle.addEventListener('click', toggleTheme);
  if (mobileThemeToggle) mobileThemeToggle.addEventListener('click', () => {
    toggleTheme();
    closeMenu();
  });

  // 모든 쉐브론 아이콘 초기 로드
  document.querySelectorAll('.ft-chevron').forEach(el => loadChevronLottie(el));
}








