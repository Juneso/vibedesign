import { animate, spring } from 'motion';

// 애니메이션 중복 실행 방지를 위한 추적 객체 (WeakMap을 사용하여 메모리 관리)
const activeAnimations = new WeakMap();
// 인스펙터용 — 최근 safeAnimate 호출 히스토리 (요소당 최대 12개)
const animationHistory = new WeakMap();

/**
 * 특정 요소에서 실행 중인 모든 애니메이션을 중단합니다.
 */
export const stopAnimations = (element) => {
  if (!element) return;
  const controls = activeAnimations.get(element);
  if (controls) {
    controls.forEach(c => {
      try { c.stop(); } catch (e) { }
    });
    activeAnimations.delete(element);
  }
};

let timelineBatch = [];
let timelineTimeout = null;

/**
 * 요소를 안전하게 애니메이션화하고 등록합니다.
 */
export const safeAnimate = (element, props, options = {}) => {
  if (!element) return;
  const control = animate(element, props, options);

  if (!activeAnimations.has(element)) {
    activeAnimations.set(element, []);
  }
  activeAnimations.get(element).push(control);

  // 트리거 함수명 (스택에서 safeAnimate 호출자) — 인스펙터 라벨용
  let trigger = null;
  try {
    const lines = (new Error().stack || '').split('\n');
    for (const line of lines) {
      const m = line.match(/at\s+(?:async\s+)?(\w[\w$]*)/);
      if (!m) continue;
      const name = m[1];
      if (['Error','safeAnimate','animate'].includes(name)) continue;
      trigger = name;
      break;
    }
  } catch {}

  // props 값 from→to 추출 (배열이면 [from, to], 단일값이면 [to])
  const propValues = {};
  for (const [k, v] of Object.entries(props)) {
    propValues[k] = Array.isArray(v) ? v : [v];
  }

  // 인스펙터용 히스토리 기록 — 끝난 애니메이션도 추후에 보여주기 위함
  const histEntry = {
    props: Object.keys(props).join(', '),
    propValues,
    type: options.type || 'tween',
    duration: options.duration ?? null,
    delay: options.delay ?? 0,
    easing: options.ease ?? options.easing ?? 'default',
    stiffness: options.stiffness ?? null,
    damping: options.damping ?? null,
    trigger,
    timestamp: performance.now(),
  };
  if (!animationHistory.has(element)) animationHistory.set(element, []);
  const arr = animationHistory.get(element);
  arr.push(histEntry);
  if (arr.length > 12) arr.shift();

  // --- 타임라인 추출 로직 ---
  if (window.INSPECTOR_MODE_ACTIVE || true) { // Always capture or conditionally? We can always capture and let parent decide.
    const targetName = element.getAttribute('data-inspect') || element.className.split(' ')[0] || element.tagName.toLowerCase();
    
    // Spring 모션인 경우 가상 시간 측정 (0.8s), 기본 duration은 0.3s
    let duration = options.duration || (options.type === 'spring' ? 0.8 : 0.3);
    let delay = options.delay || 0;
    
    timelineBatch.push({
      target: targetName,
      props: Object.keys(props).join(', '),
      type: options.type || 'ease',
      stiffness: options.stiffness || null,
      damping: options.damping || null,
      ease: options.ease || 'default',
      duration: duration,
      delay: delay
    });

    if (timelineTimeout) clearTimeout(timelineTimeout);
    timelineTimeout = setTimeout(() => {
      window.parent.postMessage({ type: 'TIMELINE_UPDATE', payload: [...timelineBatch] }, '*');
      timelineBatch = []; // 초기화
    }, 100);
  }

  return control;
};

// --- Inspector 기능 ---
window.INSPECTOR_MODE_ACTIVE = false;

// iframe embed 안에서 실행 중이면 body에 is-embedded 클래스 부여 → 모바일 보정 마진 등을 끔
if (window.parent !== window) {
  const tag = () => document.body && document.body.classList.add('is-embedded');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tag);
  else tag();
}

let lastHovered = null;
let lastSelected = null;

// 요소 자체에 outline을 그리면 그 요소의 opacity(예: 0.12)에 같이 깎임.
// 별도 오버레이 div를 body에 띄워 항상 또렷한 가이드를 보여줌.
const ensureOverlay = (which) => {
  const id = which === 'select' ? '__inspector_overlay_select' : '__inspector_overlay_hover';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = `position:fixed; pointer-events:none; box-sizing:border-box; display:none; z-index:${which === 'select' ? 999999 : 999998};`;
    el.style.outline = which === 'select' ? '2px solid rgb(66,201,235)' : '1px dashed rgba(66,201,235,0.85)';
    el.style.outlineOffset = '-1px';
    document.body.appendChild(el);
  }
  return el;
};
const positionOverlay = (overlay, target) => {
  if (!target) { overlay.style.display = 'none'; return; }
  const r = target.getBoundingClientRect();
  overlay.style.left = r.left + 'px';
  overlay.style.top = r.top + 'px';
  overlay.style.width = r.width + 'px';
  overlay.style.height = r.height + 'px';
  overlay.style.display = 'block';
};
const hideOverlay = (overlay) => { if (overlay) overlay.style.display = 'none'; };

const clearHoverOutline = () => {
  hideOverlay(document.getElementById('__inspector_overlay_hover'));
  lastHovered = null;
};
// 인스펙터 모드 시 모든 자손 요소(버튼 포함)의 cursor를 crosshair로 덮어쓰는 스타일
const ensureInspectorCursorStyle = () => {
  if (document.getElementById('__inspector_cursor_style')) return;
  const style = document.createElement('style');
  style.id = '__inspector_cursor_style';
  style.textContent = `
    body.__inspector-active, body.__inspector-active * { cursor: crosshair !important; }
    /* elementsFromPoint이 pointer-events:none 요소를 건너뛰기 때문에 인스펙터 모드에서만 풀어줌 */
    body.__inspector-active * { pointer-events: auto; }
  `;
  document.head.appendChild(style);
};
const setInspectorMode = (active) => {
  if (window.INSPECTOR_MODE_ACTIVE === active) return;
  window.INSPECTOR_MODE_ACTIVE = active;
  ensureInspectorCursorStyle();
  document.body.classList.toggle('__inspector-active', active);
  if (!active) {
    clearHoverOutline();
  }
};

// iframe 자체에서 shift 감지
window.addEventListener('keydown', (e) => { if (e.key === 'Shift') setInspectorMode(true); });
window.addEventListener('keyup',   (e) => { if (e.key === 'Shift') setInspectorMode(false); });
window.addEventListener('blur', () => setInspectorMode(false));

// 칩 override가 적용된 원본 값 보관 — 칩 제거(revert) 시 복원용
const styleOverrideOriginals = new WeakMap(); // element → { camelProp: originalInline }
const findStyleTarget = (selector) => {
  let target = null;
  try {
    if (lastSelected && lastSelected.matches?.(selector)) target = lastSelected;
  } catch {}
  if (!target) target = document.querySelector(selector);
  return target;
};

// 부모(프롬프트 테이블)에서 칩 수정 → 인라인 style 적용 (세션 override)
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'STYLE_OVERRIDE') return;
  const { selector, key, value } = e.data;
  if (!selector || !key) return;
  const target = findStyleTarget(selector);
  if (!target) return;
  const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  // 첫 override 시 원본 인라인 값 백업
  let saved = styleOverrideOriginals.get(target);
  if (!saved) { saved = {}; styleOverrideOriginals.set(target, saved); }
  if (!(camel in saved)) saved[camel] = target.style[camel] || '';
  try { target.style[camel] = value; } catch {}
});

// 칩 제거 → 인라인 style 원복
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'STYLE_REVERT') return;
  const { selector, key } = e.data;
  if (!selector || !key) return;
  const target = findStyleTarget(selector);
  if (!target) return;
  const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const saved = styleOverrideOriginals.get(target);
  if (!saved || !(camel in saved)) return;
  try { target.style[camel] = saved[camel]; } catch {}
  delete saved[camel];
});

// 모션 config 값 세션 override — animConfig deep-set 후 현재 컨테이너 다시 재생
const parseConfigValue = (raw) => {
  const s = String(raw).trim();
  // JSON 배열/객체/숫자/불리언 시도
  try { return JSON.parse(s); } catch {}
  // "1.5s" 같은 단위 보존 문자열
  return s;
};
const deepSet = (obj, path, value) => {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') return false;
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return true;
};
// config path → 원본 값 (칩 제거 시 복원)
const configOverrideOriginals = new Map();
const getByPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

window.addEventListener('message', (e) => {
  if (e.data?.type !== 'CONFIG_OVERRIDE') return;
  const { path, value } = e.data;
  if (!path || !window.__animConfig) return;
  // 첫 override 시 원본 백업
  if (!configOverrideOriginals.has(path)) {
    configOverrideOriginals.set(path, getByPath(window.__animConfig, path));
  }
  const ok = deepSet(window.__animConfig, path, parseConfigValue(value));
  if (!ok) return;
  if (typeof window.__retriggerMode === 'function') {
    requestAnimationFrame(() => window.__retriggerMode());
  }
});

// 칩 제거 → animConfig 원복 + 재트리거
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'CONFIG_REVERT') return;
  const { path } = e.data;
  if (!path || !window.__animConfig) return;
  if (!configOverrideOriginals.has(path)) return;
  deepSet(window.__animConfig, path, configOverrideOriginals.get(path));
  configOverrideOriginals.delete(path);
  if (typeof window.__retriggerMode === 'function') {
    requestAnimationFrame(() => window.__retriggerMode());
  }
});

// 부모에서 전달하는 shift 상태 (parent 창에 포커스 있을 때)
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SET_SHIFT') {
    setInspectorMode(!!e.data.active);
  }
});

// 자기 자신이 직접 텍스트 노드를 가지면 true
const hasOwnDirectText = (el) => {
  for (const n of el.childNodes) {
    if (n.nodeType === 3 && n.nodeValue.trim()) return true;
  }
  return false;
};

const hasRealBorder = (cs) => {
  const sides = ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'];
  return sides.some(s => parseFloat(cs[s]) > 0);
};

// 인스펙터에서 제외할 요소
// - body/html 제외
// - "그루핑 전용" (가시 스타일·텍스트 모두 없는) 요소 제외
const isInspectable = (el) => {
  if (!el || el === document.body || el === document.documentElement) return false;
  const cs = getComputedStyle(el);
  const hasVisual = (
    cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
    cs.backgroundImage !== 'none' ||
    cs.boxShadow !== 'none' ||
    cs.filter !== 'none' ||
    cs.backdropFilter !== 'none' ||
    cs.transform !== 'none' ||
    cs.opacity !== '1' ||
    cs.borderRadius !== '0px' ||
    hasRealBorder(cs)
  );
  if (hasVisual) return true;
  if (hasOwnDirectText(el)) return true;
  // 활성 애니메이션이 있어도 인스펙트 가능 (모션 정보 보기 위함)
  try { if (el.getAnimations && el.getAnimations({ subtree: false }).length > 0) return true; } catch {}
  return false;
};

// 자기 + 모든 조상의 누적 opacity가 0인지 검사 (보이지 않는 오버레이는 호버 제외)
const isVisuallyVisible = (el) => {
  let cur = el;
  while (cur && cur !== document.documentElement) {
    const cs = getComputedStyle(cur);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    cur = cur.parentElement;
  }
  return true;
};

// 커서 위치에서 z-stack 위쪽부터 훑어 보이는 첫 inspectable 요소 반환
// elementsFromPoint는 pointer-events:none 요소도 포함 → bg-gradient 등도 잡힘
const pickInspectAt = (x, y) => {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    if (!isInspectable(el)) continue;
    if (!isVisuallyVisible(el)) continue;
    return el;
  }
  return null;
};

// 짧은 셀렉터 생성 (id > class chain)
const buildSelector = (el) => {
  if (el.id) return `#${el.id}`;
  const cls = (el.className && typeof el.className === 'string')
    ? el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('is-')).slice(0, 2).join('.')
    : '';
  return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
};

const collectStyles = (el) => {
  const c = window.getComputedStyle(el);
  // 카테고리별로 의미있는 키만 추림
  const groups = {
    'Typography': hasOwnDirectText(el) ? {
      'font-size': c.fontSize,
      'font-weight': c.fontWeight,
      'line-height': c.lineHeight,
      'letter-spacing': c.letterSpacing,
      'color': c.color,
      'text-align': c.textAlign,
    } : {},
    'Box': {
      'width': c.width,
      'height': c.height,
      'padding': c.padding,
      'margin': c.margin,
      'background-color': c.backgroundColor !== 'rgba(0, 0, 0, 0)' ? c.backgroundColor : null,
      'background-image': c.backgroundImage !== 'none' ? c.backgroundImage : null,
      'border': hasRealBorder(c) ? c.border : null,
      'border-radius': c.borderRadius !== '0px' ? c.borderRadius : null,
    },
    'Effects': {
      'box-shadow': c.boxShadow !== 'none' ? c.boxShadow : null,
      'opacity': c.opacity !== '1' ? c.opacity : null,
      'filter': c.filter !== 'none' ? c.filter : null,
      'backdrop-filter': c.backdropFilter !== 'none' ? c.backdropFilter : null,
      'transform': c.transform !== 'none' ? c.transform : null,
    },
  };
  // null 제거
  for (const g in groups) {
    for (const k in groups[g]) if (groups[g][k] == null) delete groups[g][k];
    if (Object.keys(groups[g]).length === 0) delete groups[g];
  }
  return groups;
};

// WAAPI 활성 애니메이션 + safeAnimate 히스토리 합산
const collectActiveAnimations = (el) => {
  const out = [];
  // 1) 현재 진행 중인 WAAPI 애니메이션
  try {
    el.getAnimations({ subtree: false }).forEach(a => {
      const eff = a.effect;
      const timing = eff?.getTiming?.() || {};
      const kf = eff?.getKeyframes?.() || [];
      out.push({
        source: 'live',
        playState: a.playState,
        duration: timing.duration,
        delay: timing.delay,
        easing: timing.easing,
        iterations: timing.iterations,
        props: kf.length ? Object.keys(kf[0]).filter(k => k !== 'composite' && k !== 'computedOffset' && k !== 'offset' && k !== 'easing').join(', ') : '',
      });
    });
  } catch {}
  // 2) safeAnimate 호출 히스토리 — 시그니처별로 dedupe (가장 최신만 유지)
  const hist = animationHistory.get(el) || [];
  const seen = new Map();
  for (const h of hist) {
    const sig = `${h.props}|${h.type}|${h.duration}|${h.delay}|${h.easing}|${h.stiffness}|${h.damping}`;
    seen.set(sig, h);
  }
  for (const h of seen.values()) {
    out.push({
      source: 'history',
      playState: 'finished',
      duration: h.duration != null ? h.duration * 1000 : null,
      delay: typeof h.delay === 'number' ? h.delay : 0,
      easing: h.easing,
      iterations: 1,
      props: h.props,
      propValues: h.propValues || {},
      type: h.type,
      stiffness: h.stiffness,
      damping: h.damping,
      trigger: h.trigger || null,
    });
  }
  return out;
};

// :root 기준 CSS 변수 → hex 색 매핑 (token 변환용)
const rgbStrToHex = (rgb) => {
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[,/\s]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const [r, g, b] = parts.slice(0, 3).map(n => parseInt(n));
  if ([r,g,b].some(v => isNaN(v))) return null;
  let hex = '#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join('');
  if (parts[3] !== undefined) {
    const a = parseFloat(parts[3]);
    if (!isNaN(a) && a < 1) {
      hex += Math.round(a * 255).toString(16).padStart(2,'0');
    }
  }
  return hex.toLowerCase();
};
// 모든 --fig-* 변수 → 해석된 hex 매핑 (인스펙터 swatch 미리보기용)
// getPropertyValue는 alias chain을 resolve하지 않아서 probe element로 실제 색 읽음
const buildVarHexMap = () => {
  const cs = getComputedStyle(document.body);
  const names = [];
  for (let i = 0; i < cs.length; i++) {
    const n = cs[i];
    if (n.startsWith('--fig-') && !n.startsWith('--fig-grad-') && !n.startsWith('--fig-shadow-')) {
      names.push(n);
    }
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;';
  document.body.appendChild(probe);
  const out = {};
  for (const n of names) {
    probe.style.color = '';
    probe.style.color = `var(${n})`;
    const v = getComputedStyle(probe).color;
    const hex = rgbStrToHex(v);
    if (hex) out[n] = hex;
  }
  probe.remove();
  return out;
};

const buildTokenIndex = () => {
  // body에서 읽어야 body[data-theme="dark"] override까지 반영됨
  const cs = getComputedStyle(document.body);
  const candidates = {};
  for (let i = 0; i < cs.length; i++) {
    const name = cs[i];
    if (!name.startsWith('--')) continue;
    const value = cs.getPropertyValue(name).trim();
    if (!value) continue;
    let hex = null;
    if (value.startsWith('#')) hex = value.toLowerCase();
    else if (value.startsWith('rgb')) hex = rgbStrToHex(value);
    if (hex) {
      if (!candidates[hex]) candidates[hex] = [];
      candidates[hex].push(name);
    }
  }
  // 3뎁스 component > 2뎁스 semantic > 1뎁스 primitives — 디자인 의도에 가까운 가장 구체 토큰을 표시
  const priority = (name) => {
    if (name.includes('--fig-buttons-') || name.includes('--fig-sliders-') ||
        name.includes('--fig-selectioncontrols-') || name.includes('--fig-component-')) return 0;
    if (name.includes('--fig-onsurface-') || name.includes('--fig-surface-')) return 1;
    if (name.includes('--fig-primitives-') || name.includes('--fig-transparent-')) return 2;
    return 1;
  };
  // 같은 priority + 같은 hex일 때 alpha-XX 인덱스 작은 것 우선 (alpha-06 < alpha-10)
  const aliasIndex = (name) => {
    const m = name.match(/-alpha-(\d+)$/) || name.match(/-(\d+)(?:-base)?$/);
    return m ? parseInt(m[1], 10) : 999;
  };
  // 컴포넌트 state 우선: enabled/base > selected/pressed > disabled
  const stateOrder = (name) => {
    if (name.endsWith('-enabled') || name.endsWith('-base')) return 0;
    if (name.endsWith('-selected') || name.endsWith('-pressed')) return 1;
    if (name.endsWith('-disabled')) return 2;
    return 0;
  };
  const out = {};
  for (const [hex, names] of Object.entries(candidates)) {
    names.sort((a, b) =>
      priority(a) - priority(b) ||
      stateOrder(a) - stateOrder(b) ||
      aliasIndex(a) - aliasIndex(b)
    );
    out[hex] = names[0];
  }
  return out;
};

// 가계도 트리 — id → element 매핑 (클릭 시 element 복원용)
let lastFamilyElements = [];

// target 주변 family tree (조상 2뎁스, 자손 2뎁스, 형제, 최대 8줄)
const buildFamilyTree = (target) => {
  const elements = [];
  const nodes = [];
  const MAX_LINES = 12;
  const isLayoutRoot = (el) => !el || el === document.documentElement || el === document.body;

  const addNode = (el, depth, kind, isTarget = false) => {
    if (nodes.length >= MAX_LINES) return false;
    const id = elements.length;
    elements.push(el);
    nodes.push({ id, label: buildSelector(el), depth, kind, isTarget });
    return true;
  };
  // 조상 체인 (root까지, body/html 제외) — DOM 순서대로 위에서부터
  const ancestors = [];
  let a = target.parentElement;
  while (a && !isLayoutRoot(a)) { ancestors.unshift(a); a = a.parentElement; }
  ancestors.forEach((el, i) => addNode(el, i, 'ancestor'));

  const targetDepth = ancestors.length;
  const parent = target.parentElement;
  const siblings = parent ? Array.from(parent.children).filter(c => c.nodeType === 1) : [target];
  const ti = siblings.indexOf(target);

  // 이전 형제 → target → target의 자식/손자 → 이후 형제, 12줄까지
  for (let i = 0; i < ti && nodes.length < MAX_LINES; i++) {
    addNode(siblings[i], targetDepth, 'sibling');
  }
  addNode(target, targetDepth, 'target', true);
  const children = Array.from(target.children).filter(c => c.nodeType === 1);
  for (const ch of children) {
    if (nodes.length >= MAX_LINES) break;
    addNode(ch, targetDepth + 1, 'descendant');
    const gcs = Array.from(ch.children).filter(c => c.nodeType === 1);
    for (const gc of gcs) {
      if (nodes.length >= MAX_LINES) break;
      addNode(gc, targetDepth + 2, 'descendant');
    }
  }
  for (let i = ti + 1; i < siblings.length && nodes.length < MAX_LINES; i++) {
    addNode(siblings[i], targetDepth, 'sibling');
  }

  return { nodes, elements };
};

const setSelectedTracking = (newEl) => {
  lastSelected = newEl;
};

// element에 매칭되는 CSS rule들에서 사용된 var() 이름 추출 — token 모드에서 hex reverse lookup보다 우선 사용
// rule.cssText 통째로 파싱 (rule.style[i]가 일부 환경에서 shorthand만 보고 누락하는 케이스 회피)
// 상속되는 prop(color 등)은 자기 자신에 없으면 부모 체인까지 거슬러 올라가 찾음 — 같은 hex를 공유하는 다른 토큰(예: buttons-*)이 reverse lookup에서 잘못 선택되는 문제 방지
const INHERITED_PROPS = new Set([
  'color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-transform', 'text-indent',
  'visibility', 'cursor', 'list-style', 'word-break', 'white-space', 'direction',
]);
const collectDirectVars = (el) => {
  const out = {};
  const recordVar = (prop, varName) => {
    out[prop] = varName;
    if (prop === 'background') out['background-color'] = varName;
    else if (prop === 'border') {
      out['border-top-color'] = varName;
      out['border-right-color'] = varName;
      out['border-bottom-color'] = varName;
      out['border-left-color'] = varName;
      out['border-color'] = varName;
    } else if (prop === 'border-color') {
      out['border-top-color'] = varName;
      out['border-right-color'] = varName;
      out['border-bottom-color'] = varName;
      out['border-left-color'] = varName;
    } else if (/^border-(top|right|bottom|left)$/.test(prop)) {
      out[prop + '-color'] = varName;
    } else if (prop === 'outline') out['outline-color'] = varName;
  };
  const parseCssText = (cssText) => {
    const bodyMatch = cssText.match(/\{([\s\S]*)\}/);
    if (!bodyMatch) return;
    const body = bodyMatch[1];
    const propRe = /([a-z-]+)\s*:\s*([^;]+);/g;
    let m;
    while ((m = propRe.exec(body))) {
      const prop = m[1].trim();
      const value = m[2].trim();
      const v = value.match(/var\(\s*(--[\w-]+)/);
      if (v) recordVar(prop, v[1]);
    }
  };
  const visit = (rule) => {
    if (!rule) return;
    if (rule.type === 1) {
      try { if (!el.matches(rule.selectorText)) return; } catch { return; }
      try { parseCssText(rule.cssText); } catch {}
    } else if (rule.cssRules) {
      for (const r of rule.cssRules) visit(r);
    }
  };
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    if (!rules) continue;
    for (const rule of rules) visit(rule);
  }
  if (el.style.cssText) {
    const propRe = /([a-z-]+)\s*:\s*([^;]+);?/g;
    let m;
    while ((m = propRe.exec(el.style.cssText))) {
      const prop = m[1].trim();
      const v = m[2].trim().match(/var\(\s*(--[\w-]+)/);
      if (v) recordVar(prop, v[1]);
    }
  }
  return out;
};
const extractElementVars = (el) => {
  const out = collectDirectVars(el);
  // 상속 prop이 본인에 없으면 가장 가까운 ancestor에서 찾아 채움 (computed 값을 만든 var()를 정확히 표시)
  let parent = el.parentElement;
  while (parent && parent.nodeType === 1) {
    const pv = collectDirectVars(parent);
    for (const prop of Object.keys(pv)) {
      if (INHERITED_PROPS.has(prop) && !out[prop]) out[prop] = pv[prop];
    }
    parent = parent.parentElement;
  }
  return out;
};

const sendSelectionPayload = (target) => {
  const fam = buildFamilyTree(target);
  lastFamilyElements = fam.elements;
  const payload = {
    selector: buildSelector(target),
    tag: target.tagName.toLowerCase(),
    id: target.id || null,
    classes: (target.className && typeof target.className === 'string') ? target.className.trim().split(/\s+/) : [],
    text: (target.textContent || '').trim().slice(0, 60),
    styleGroups: collectStyles(target),
    animations: collectActiveAnimations(target),
    tokenIndex: buildTokenIndex(),
    elementVars: extractElementVars(target),
    varHexMap: buildVarHexMap(),
    tree: fam.nodes,
    // 애니메이션 칩 → config path 매핑용
    animConfig: window.__animConfig || null,
    triggerPaths: window.__triggerConfigPaths || {},
  };
  window.parent.postMessage({ type: 'INSPECTOR_SELECT', payload }, '*');
};

// 부모로부터 refresh 요청 (테마 변경 후) — 마지막 선택 요소를 다시 수집
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'INSPECTOR_REFRESH') {
    if (lastSelected && lastSelected.isConnected) {
      sendSelectionPayload(lastSelected);
    }
  }
});

// mousemove로 z-stack을 훑어 (pointer-events:none 포함) 보이는 첫 요소를 잡음
const updateHoverOverlay = (target) => {
  const overlay = ensureOverlay('hover');
  if (!target || target === lastSelected) hideOverlay(overlay);
  else positionOverlay(overlay, target);
};
const updateSelectOverlay = (target) => {
  const overlay = ensureOverlay('select');
  positionOverlay(overlay, target);
};

document.addEventListener('mousemove', (e) => {
  const showOutline = window.INSPECTOR_MODE_ACTIVE || e.shiftKey;
  if (!showOutline) return;
  const target = pickInspectAt(e.clientX, e.clientY);
  if (target === lastHovered) return;
  lastHovered = target;
  updateHoverOverlay(target);
});

// 보더만 숨김 — 패널 정보는 유지
const clearSelection = () => {
  hideOverlay(ensureOverlay('select'));
  lastSelected = null;
};


document.addEventListener('click', (e) => {
  if (!window.INSPECTOR_MODE_ACTIVE) return;
  e.preventDefault();
  e.stopPropagation();
  const stack = document.elementsFromPoint(e.clientX, e.clientY)
    .filter(el => isInspectable(el) && isVisuallyVisible(el));
  const target = stack[0] || null;
  if (!target) {
    clearSelection();
    return;
  }
  setSelectedTracking(target);
  updateSelectOverlay(target);
  hideOverlay(ensureOverlay('hover'));
  sendSelectionPayload(target);
}, true);

// 부모로부터 deselect / 트리 노드 선택 요청
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'INSPECTOR_CLEAR_SELECT') {
    hideOverlay(ensureOverlay('select'));
    lastSelected = null;
  }
  if (e.data && e.data.type === 'INSPECTOR_PICK_TREE') {
    const id = e.data.id;
    const el = lastFamilyElements[id];
    if (el && el.isConnected) {
      setSelectedTracking(el);
      updateSelectOverlay(el);
      sendSelectionPayload(el);
    }
  }
});

// shift 없이 클릭 → 보더만 숨김 (패널 정보 유지)
document.addEventListener('click', (e) => {
  if (e.shiftKey) return;
  if (!lastSelected) return;
  hideOverlay(ensureOverlay('select'));
  lastSelected = null;
});

// 스크롤/리사이즈/애니메이션 따라 위치 갱신
const repositionOverlays = () => {
  if (lastSelected) updateSelectOverlay(lastSelected);
  if (lastHovered && lastHovered !== lastSelected) updateHoverOverlay(lastHovered);
};
window.addEventListener('scroll', repositionOverlays, true);
window.addEventListener('resize', repositionOverlays);
