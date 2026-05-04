import { safeAnimate } from './animation.js';

/**
 * 공통 인터랙션 모듈
 *
 * 컨벤션:
 * - "최종이 0이면 8에서 시작" → translateY 초기값 +8 → 0 (위로 슬라이드 인)
 * - desc delay는 title 애니메이션 '시작' 기준
 * - text exit는 title + desc 동시 200ms linear fadeout
 * - 버튼 그룹은 스태거 없음, 동시 진입
 */

export const DEFAULT_INTERACTIONS = {
  textEntry: {
    titleDuration: 300,
    titleOffsetY: 8,      // 시작 Y (최종 0)
    descDelay: 40,        // title 시작 후 ms
    descDuration: 300,
    descOffsetY: 8,
    easing: 'ease',
  },
  textExit: {
    duration: 200,
    easing: 'linear',
  },
  buttonEntry: {
    duration: 300,
    scaleFrom: 0.98,
    easing: 'ease',
  },
  containerEntry: {       // 키패드 등 컨테이너 전체 등장
    duration: 300,
    scaleFrom: 0.98,
    easing: 'ease',
  },
  exitFade: {
    duration: 200,
    easing: 'linear',
  },
  sttExpand: {
    spring: { stiffness: 450, damping: 40 },
    padding: 10,          // 확장 시 ac-contents 상하 패딩 공제
  },
};

function mergeConfig(userCfg, defaults) {
  if (!userCfg) return defaults;
  const out = { ...defaults };
  for (const k in userCfg) {
    if (userCfg[k] && typeof userCfg[k] === 'object' && !Array.isArray(userCfg[k])) {
      out[k] = { ...defaults[k], ...userCfg[k] };
    } else {
      out[k] = userCfg[k];
    }
  }
  return out;
}

function toSec(ms) { return ms / 1000; }

/**
 * 텍스트 그룹 등장
 * @param titleEl 로띠+타이틀을 감싼 컨테이너
 * @param descEl  디스크립션 컨테이너 (없어도 됨)
 * @param userCfg animConfig.interactions
 * @param lottieInstance 선택: 로띠 인스턴스 (있으면 play 호출)
 */
export function animateTextGroupIn(titleEl, descEl, userCfg, lottieInstance) {
  const cfg = mergeConfig(userCfg, DEFAULT_INTERACTIONS);
  const te = cfg.textEntry;

  if (titleEl) {
    titleEl.style.display = '';
    titleEl.style.opacity = '0';
    titleEl.style.transform = `translateY(${te.titleOffsetY}px)`;
    void titleEl.offsetHeight;

    safeAnimate(titleEl, { opacity: [0, 1], y: [te.titleOffsetY, 0] }, {
      duration: toSec(te.titleDuration),
      ease: te.easing,
    });

    if (lottieInstance && typeof lottieInstance.play === 'function') {
      lottieInstance.play();
    }
  }

  if (descEl) {
    descEl.style.display = '';
    descEl.style.opacity = '0';
    descEl.style.transform = `translateY(${te.descOffsetY}px)`;
    void descEl.offsetHeight;

    setTimeout(() => {
      safeAnimate(descEl, { opacity: [0, 1], y: [te.descOffsetY, 0] }, {
        duration: toSec(te.descDuration),
        ease: te.easing,
      });
    }, te.descDelay);
  }
}

/**
 * 텍스트 그룹 퇴장 — title+desc 동시 200ms linear fadeout
 */
export function animateTextGroupOut(titleEl, descEl, userCfg) {
  const cfg = mergeConfig(userCfg, DEFAULT_INTERACTIONS);
  const tx = cfg.textExit;
  const els = [titleEl, descEl].filter(Boolean);
  els.forEach(el => {
    safeAnimate(el, { opacity: 0 }, {
      duration: toSec(tx.duration),
      ease: tx.easing,
    });
  });
}

/**
 * ARS 버튼 그룹 등장 — 개별 버튼 scale+fade (스태거 없음, 동시 진입)
 * @param buttonEls 버튼 Element 배열 (NodeList OK)
 */
export function animateButtonsIn(buttonEls, userCfg) {
  const cfg = mergeConfig(userCfg, DEFAULT_INTERACTIONS);
  const be = cfg.buttonEntry;
  Array.from(buttonEls).forEach(btn => {
    btn.style.opacity = '0';
    btn.style.transform = `scale(${be.scaleFrom})`;
    void btn.offsetHeight;
    safeAnimate(btn, { opacity: [0, 1], scale: [be.scaleFrom, 1] }, {
      duration: toSec(be.duration),
      ease: be.easing,
    });
  });
}

/**
 * 컨테이너 전체 등장 (키패드 등)
 */
export function animateContainerIn(containerEl, userCfg) {
  const cfg = mergeConfig(userCfg, DEFAULT_INTERACTIONS);
  const ce = cfg.containerEntry;
  if (!containerEl) return;
  containerEl.style.opacity = '0';
  containerEl.style.transform = `scale(${ce.scaleFrom})`;
  void containerEl.offsetHeight;
  safeAnimate(containerEl, { opacity: [0, 1], scale: [ce.scaleFrom, 1] }, {
    duration: toSec(ce.duration),
    ease: ce.easing,
  });
}

/**
 * 일괄 페이드 아웃 — ARS/키패드 퇴장, 또는 다수 요소
 */
export function animateFadeOut(elements, userCfg) {
  const cfg = mergeConfig(userCfg, DEFAULT_INTERACTIONS);
  const ex = cfg.exitFade;
  const arr = Array.isArray(elements) || elements instanceof NodeList
    ? Array.from(elements) : [elements];
  arr.filter(Boolean).forEach(el => {
    safeAnimate(el, { opacity: 0 }, {
      duration: toSec(ex.duration),
      ease: ex.easing,
    });
  });
}

/**
 * STT 패널 확장/축소 토글
 * @param sttEl     STT 패널 (높이 변화 대상)
 * @param contentsEl ac-contents 컨테이너 (기준 높이)
 * @param userCfg   animConfig.interactions
 * @param expanded  true면 확장, false면 축소
 * @param collapsedHeight 축소 시 원래 높이 (px, 선택)
 */
export function toggleSttExpand(sttEl, contentsEl, userCfg, expanded, collapsedHeight) {
  const cfg = mergeConfig(userCfg, DEFAULT_INTERACTIONS);
  const se = cfg.sttExpand;
  if (!sttEl || !contentsEl) return;

  let targetHeight;
  if (expanded) {
    // STT 카드의 현재 위치 기준으로 contents 하단까지의 여유 공간 계산
    const cardRect = sttEl.getBoundingClientRect();
    const contentsRect = contentsEl.getBoundingClientRect();
    const availableBelow = contentsRect.bottom - cardRect.top;
    targetHeight = availableBelow - se.padding;
  } else {
    targetHeight = collapsedHeight != null ? collapsedHeight : sttEl.dataset.collapsedHeight;
    if (!targetHeight) return;
  }

  safeAnimate(sttEl, { height: targetHeight + 'px' }, {
    type: 'spring',
    stiffness: se.spring.stiffness,
    damping: se.spring.damping,
  });
}

/**
 * 복합 그룹 등장 — 텍스트(title + desc) + 버튼을 한 번에 진입.
 * .ac-hidden 클래스를 제거하고 기본 CSS 의존성 대신 JS 애니메이션으로 구동.
 *
 * 권장 selector (default):
 *   title:   .ac-textgroup__inner, .ac-ars__header
 *   desc:    .ac-suggest__desc
 *   buttons: .ac-suggest__btn, .ac-ars__btn
 * 페이지별 override가 필요하면 sel 객체 전달.
 */
const DEFAULT_SEL = {
  title: '.ac-textgroup__inner, .ac-ars__header',
  desc: '.ac-suggest__desc',
  buttons: '.ac-suggest__btn, .ac-ars__btn',
};

export function showGroup(groupEl, userCfg, sel = DEFAULT_SEL) {
  if (!groupEl) return;
  groupEl.classList.remove('ac-hidden');
  groupEl.style.opacity = '';
  groupEl.style.visibility = '';
  const title = groupEl.querySelector(sel.title);
  const desc = sel.desc ? groupEl.querySelector(sel.desc) : null;
  const btns = sel.buttons ? groupEl.querySelectorAll(sel.buttons) : [];
  animateTextGroupIn(title, desc, userCfg);
  if (btns.length) animateButtonsIn(btns, userCfg);
}

export function hideGroup(groupEl, userCfg, sel = DEFAULT_SEL) {
  if (!groupEl) return;
  const cfg = mergeConfig(userCfg, DEFAULT_INTERACTIONS);
  const parts = Array.from(groupEl.querySelectorAll(
    [sel.title, sel.desc, sel.buttons].filter(Boolean).join(', ')
  ));
  const list = parts.length ? parts : [groupEl];
  animateFadeOut(list, userCfg);
  setTimeout(() => {
    groupEl.classList.add('ac-hidden');
    list.forEach(el => { if (el) el.style.opacity = ''; });
  }, cfg.exitFade.duration);
}

/**
 * 비활성화 상태 토글 — pointer-events + .is-disabled
 */
export function setDisabled(el, disabled) {
  if (!el) return;
  el.classList.toggle('is-disabled', !!disabled);
}

/**
 * 비활성 체크 — 클릭 이벤트 가드용
 */
export function isDisabled(el) {
  return !!el && el.classList.contains('is-disabled');
}
