// ─── Prompt Builder (인스펙터 하단) ───
const escHtml = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// var(--token) → 원본 색상 매핑 (renderPanel에서 갱신)
let tokenColorMap = {};
// 디자인 토큰 이름(--fig- 제거) → hex 매핑 (token 모드 표기용)
let designTokenColorMap = {};

const stripFigPrefix = (name) => String(name).replace(/^--fig-/, '');

const tokenizeValue = (val) => {
  const out = [];
  const rules = [
    [/^#[0-9a-fA-F]{3,8}\b/, 'color'],
    [/^rgba?\([^)]*\)/, 'color-fn'],
    [/^hsla?\([^)]*\)/, 'color-fn'],
    [/^var\([^)]*\)/, 'var-fn'],
    [/^(linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient|calc|min|max|clamp|url|cubic-bezier|translate[XYZ]?|rotate[XYZ]?|scale[XYZ]?|matrix3?d?|perspective|skew[XY]?|blur|drop-shadow|brightness|contrast|saturate|hue-rotate)(?=\()/, 'fn'],
    [/^"[^"]*"/, 'str'],
    [/^'[^']*'/, 'str'],
    [/^-?\d*\.?\d+/, 'num'],
    [/^(px|%|em|rem|deg|rad|turn|s|ms|fr|vh|vw|pt|ch|ex|cm|mm|in|vmin|vmax)\b/, 'unit'],
    [/^(none|auto|inherit|initial|unset|transparent|currentColor|solid|dashed|dotted|bold|normal|center|left|right|top|bottom|flex|block|inline|inline-block|grid|absolute|relative|fixed|sticky|hidden|visible|ease|ease-in|ease-out|ease-in-out|linear|infinite)\b/, 'kw'],
    [/^[a-zA-Z_-][\w-]*/, 'ident'],
    [/^\s+/, 'ws'],
    [/^./, 'punct'],
  ];
  let i = 0;
  while (i < val.length) {
    const rest = val.slice(i);
    for (const [re, type] of rules) {
      const m = rest.match(re);
      if (m) { out.push({ type, text: m[0] }); i += m[0].length; break; }
    }
  }
  return out;
};

const renderTokens = (tokens) => tokens.map(t => {
  if (t.type === 'ws') return t.text;
  if (t.type === 'color')    return `<span class="pb-tok-group"><span class="ins-swatch" style="background-color:${t.text}"></span><span class="pb-tok-color">${escHtml(t.text)}</span></span>`;
  if (t.type === 'color-fn') return `<span class="pb-tok-group"><span class="ins-swatch" style="background-color:${t.text}"></span><span class="pb-tok-fn">${escHtml(t.text)}</span></span>`;
  if (t.type === 'var-fn') {
    const m = t.text.match(/^var\(\s*(--[\w-]+)/);
    const color = m && tokenColorMap[m[1]];
    const swatch = color ? `<span class="ins-swatch" style="background-color:${color}"></span>` : '';
    return `<span class="pb-tok-group">${swatch}<span class="pb-tok-var">${escHtml(t.text)}</span></span>`;
  }
  if (t.type === 'fn')       return `<span class="pb-tok-fn">${escHtml(t.text)}</span>`;
  // ident가 디자인 토큰명과 매칭되면 swatch + var 컬러로 표시
  if (t.type === 'ident' && designTokenColorMap[t.text]) {
    const color = designTokenColorMap[t.text];
    return `<span class="pb-tok-group"><span class="ins-swatch" style="background-color:${color}"></span><span class="pb-tok-var">${escHtml(t.text)}</span></span>`;
  }
  return `<span class="pb-tok-${t.type}">${escHtml(t.text)}</span>`;
}).join('');

const renderChipCode = (key, val) => {
  const valHtml = renderTokens(tokenizeValue(val));
  return `<span class="pb-tok-prop">${escHtml(key)}</span><span class="pb-tok-punct">: </span><span class="pb-chip-val" contenteditable="true" spellcheck="false">${valHtml}</span><span class="pb-tok-punct">;</span>`;
};

const createChip = (rawText) => {
  const m = rawText.match(/^([^:]+):\s*([\s\S]*?);?\s*$/);
  const chip = document.createElement('span');
  chip.className = 'pb-chip';
  chip.contentEditable = 'false';
  if (m && m[1].trim() && !/^[.#]/.test(m[1].trim())) {
    const key = m[1].trim();
    const val = m[2].trim();
    chip.dataset.key = key;
    chip.dataset.val = val;
    chip.innerHTML = `<span class="pb-chip-code">${renderChipCode(key, val)}</span><span class="pb-chip-del" contenteditable="false" role="button" aria-label="remove">×</span>`;
  } else {
    chip.dataset.raw = rawText;
    const valHtml = renderTokens(tokenizeValue(rawText));
    chip.innerHTML = `<span class="pb-chip-code"><span class="pb-chip-val" contenteditable="true" spellcheck="false">${valHtml}</span></span><span class="pb-chip-del" contenteditable="false" role="button" aria-label="remove">×</span>`;
  }
  return chip;
};

// 깜빡임 없이 fade-in: 등장 시점에 inline opacity 0 → 다음 프레임에 WAAPI 애니메이션 시작
const fadeInOnce = (el, duration = 100) => {
  el.style.opacity = '0';
  requestAnimationFrame(() => {
    const anim = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: 'linear', fill: 'forwards' });
    anim.onfinish = () => {
      try { anim.commitStyles(); anim.cancel(); } catch {}
      el.style.opacity = '';
    };
  });
};

const ensureLayerTitle = (selector) => {
  const body = document.getElementById('prompt-builder-body');
  if (!body || !selector) return;
  const exists = body.querySelector(`.pb-layer-title[data-selector="${CSS.escape(selector)}"]`);
  if (exists) return;
  const title = document.createElement('div');
  title.className = 'pb-layer-title';
  title.dataset.selector = selector;
  title.contentEditable = 'false';
  title.textContent = `${selector} 에 대해서`;
  // suffix '해줘'는 항상 맨 끝 — 그 앞에 새 layer-title 삽입
  const suffix = body.querySelector('.pb-text--suffix');
  if (suffix) body.insertBefore(title, suffix);
  else body.appendChild(title);
  fadeInOnce(title);
};

// prompt-builder 액션 버튼들의 가시성을 칩 보유 여부로 토글
const updatePromptBuilderEmptyState = () => {
  const body = document.getElementById('prompt-builder-body');
  const panel = document.getElementById('prompt-builder');
  if (!body || !panel) return;
  const hasChip = !!body.querySelector('.pb-chip');
  panel.classList.toggle('is-empty', !hasChip);
};

const addChipToBuilder = (rawText, selector) => {
  const body = document.getElementById('prompt-builder-body');
  if (!body) return;
  if (selector) ensureLayerTitle(selector);
  // ' 해줘' 접미는 한 번만 만들고 고정. 매번 제거/재생성하면 깜빡거림
  let haeJweo = body.querySelector('.pb-text--suffix');
  if (!haeJweo) {
    // 기존 텍스트 노드 형태 정리 (구버전 호환)
    body.childNodes.forEach(n => {
      if (n.nodeType === 3 && /^\s*해줘\s*$/.test(n.nodeValue)) n.remove();
      else if (n.nodeType === 1 && n.classList?.contains('pb-text') && /^\s*해줘\s*$/.test(n.textContent)) n.remove();
    });
    haeJweo = document.createElement('span');
    haeJweo.className = 'pb-text pb-text--suffix';
    haeJweo.textContent = ' 해줘';
    body.appendChild(haeJweo);
    fadeInOnce(haeJweo);
  }
  const chip = createChip(rawText);
  // 해당 selector의 layer 영역 끝(다음 layer-title 직전 또는 suffix 직전)에 삽입
  let insertBefore = haeJweo;
  if (selector) {
    const title = body.querySelector(`.pb-layer-title[data-selector="${CSS.escape(selector)}"]`);
    if (title) {
      let node = title.nextSibling;
      while (node && !(node.nodeType === 1 && node.classList?.contains('pb-layer-title'))) {
        node = node.nextSibling;
      }
      insertBefore = node || haeJweo;
    }
  }
  body.insertBefore(chip, insertBefore);
  fadeInOnce(chip);
  body.scrollTop = body.scrollHeight;
  updatePromptBuilderEmptyState();
};

const serializePromptBody = (body) => {
  let out = '';
  const walk = (node) => {
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) {
        out += child.nodeValue;
      } else if (child.nodeType === 1) {
        if (child.classList && child.classList.contains('pb-chip')) {
          const key = child.dataset.key;
          const val = child.dataset.val ?? (child.querySelector('.pb-chip-val')?.textContent ?? '').trim();
          out += key ? `${key}: ${val};` : (child.dataset.raw || '');
        } else if (child.tagName === 'BR') {
          out += '\n';
        } else if (child.tagName === 'DIV') {
          if (out && !out.endsWith('\n')) out += '\n';
          walk(child);
          if (!out.endsWith('\n')) out += '\n';
        } else {
          walk(child);
        }
      }
    });
  };
  walk(body);
  return out.replace(/[ \t]+\n/g, '\n').trim();
};

const flashBtn = (btn, duration = 800) => {
  btn.classList.add('is-flash');
  setTimeout(() => btn.classList.remove('is-flash'), duration);
};

// ─── Edit History (Vite edit-trail에서 푸시) ─────────────────────────
const HISTORY_MAX = 20;
const HISTORY_VISIBLE = 4;
const HISTORY_LS_KEY = 'pb-edit-history';
let editHistory = []; // 최신 → 오래된 순 (unshift)
// localStorage에서 복구 (새로고침 후에도 유지)
try {
  const raw = localStorage.getItem(HISTORY_LS_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) editHistory = parsed.slice(0, HISTORY_MAX);
  }
} catch {}
const persistHistory = () => {
  try { localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(editHistory)); } catch {}
};

const formatRelativeTime = (ts) => {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / (60 * 60_000))}h ago`;
};

// 프롬프트 빌더와 같은 chevron SVG (16px)
const HISTORY_CHEVRON = `<svg class="pb-history-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

const renderHistory = (expanded = false) => {
  const panel = document.getElementById('pb-history');
  const list = document.getElementById('pb-history-list');
  if (!panel || !list) return;
  // 비어있으면 섹션 자체 숨김
  if (editHistory.length === 0) {
    panel.hidden = true;
    panel.classList.add('is-empty');
    list.innerHTML = '';
    return;
  }
  panel.hidden = false;
  panel.classList.remove('is-empty');

  const limit = expanded ? HISTORY_VISIBLE : 1;
  const items = editHistory.slice(0, limit);
  list.innerHTML = items.map((entry, i) => {
    const tokens = renderTokens(tokenizeValue(entry.line));
    // chevron은 첫 row의 우측 끝에만. 펼침 토글 역할
    const chevronBtn = i === 0
      ? `<button class="pb-history-toggle" type="button" aria-label="펼치기/접기" data-toggle="1">${HISTORY_CHEVRON}</button>`
      : `<span class="pb-history-toggle pb-history-toggle--placeholder"></span>`;
    return `
      <div class="pb-history-row" data-idx="${i}" title="${escHtml(entry.line)} · ${escHtml(entry.file)}">
        <span class="pb-history-time">${formatRelativeTime(entry.ts)}</span>
        <span class="pb-history-line">${tokens}</span>
        ${chevronBtn}
      </div>`;
  }).join('');

  // 펼침/접기 토글 (chevron만 처리, row click과 분리)
  list.querySelector('[data-toggle="1"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = panel.classList.toggle('is-expanded');
    renderHistory(isExpanded);
  });
  // row 클릭 → 칩 추가
  list.querySelectorAll('.pb-history-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.pb-history-toggle')) return;
      const idx = +row.getAttribute('data-idx');
      const entry = editHistory[idx];
      if (!entry) return;
      const fileTag = entry.file.split('/').pop() || 'edit';
      addChipToBuilder(`${entry.line};`, fileTag);
    });
  });
};

const pushEditHistory = (file, lines, ts) => {
  for (const line of lines) {
    editHistory.unshift({ file, line, ts });
  }
  while (editHistory.length > HISTORY_MAX) editHistory.pop();
  persistHistory();
  const expanded = document.getElementById('pb-history')?.classList.contains('is-expanded');
  renderHistory(!!expanded);
};
// 시간 라벨은 새로고침 시에만 갱신 (실시간 카운팅 안 함)

// 현재 iframe에 로드된 실험 폴더 — 그 폴더 안 변경만 history로 표시
let currentExpFolder = null;
const updateExpFolder = () => {
  const iframe = document.getElementById('experiment-frame');
  const src = iframe?.getAttribute('src') || '';
  // src/experiments/{active|archive|playground|...}/{name}/...
  const m = src.match(/(src\/experiments\/[^/]+\/[^/?#]+)/);
  currentExpFolder = m ? m[1] : null;
};
// iframe load될 때마다 갱신
const setupFolderTracking = () => {
  const iframe = document.getElementById('experiment-frame');
  iframe?.addEventListener('load', updateExpFolder);
  updateExpFolder();
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupFolderTracking);
} else {
  setupFolderTracking();
}

// Vite HMR 채널 — 부모 창에서만 활성
if (typeof import.meta !== 'undefined' && import.meta.hot) {
  import.meta.hot.on('edit-trail', (data) => {
    if (!data || !Array.isArray(data.lines)) return;
    // 현재 보고있는 실험 폴더 안 변경만 표시
    if (currentExpFolder && !data.file.startsWith(currentExpFolder)) return;
    pushEditHistory(data.file, data.lines, data.ts || Date.now());
  });
}

// ─── Variation Mode (3분할 phone + 칩 컬럼) ─────────────────────────
const VARIATION_COUNT = 3;

// 특정 iframe에만 override 송신 (메인 sendOverride는 메인 iframe 대상)
const sendOverrideToIframe = (iframe, key, value, selector) => {
  if (!iframe?.contentWindow || !key) return;
  if (key.includes('.')) {
    iframe.contentWindow.postMessage({ type: 'CONFIG_OVERRIDE', path: key, value }, '*');
  } else if (selector) {
    iframe.contentWindow.postMessage({ type: 'STYLE_OVERRIDE', selector, key, value }, '*');
  }
};

// 칩 컬럼 렌더 + 편집 핸들러 (해당 iframe에만 적용)
const renderVariationChipsColumn = (chipsBox, baseChips, iframe) => {
  chipsBox.innerHTML = '';
  if (baseChips.length === 0) {
    chipsBox.innerHTML = `<div style="opacity:0.5; font-size:11px; padding:4px;">칩 없음 — 메인 프롬프트 테이블에 칩을 추가한 뒤 진입해보세요</div>`;
    return;
  }
  baseChips.forEach(c => {
    const text = c.key ? `${c.key}: ${c.val};` : (c.raw || '');
    const chip = createChip(text);
    if (c.selector) chip.dataset.selector = c.selector;
    chipsBox.appendChild(chip);
    chipsBox.appendChild(document.createTextNode(' '));
  });

  // 칩 value 편집 시 → 이 컬럼 iframe에만 override 송신
  chipsBox.addEventListener('blur', (e) => {
    const valEl = e.target.closest?.('.pb-chip-val');
    if (!valEl) return;
    const chip = valEl.closest('.pb-chip');
    if (!chip) return;
    const key = chip.dataset.key;
    const newVal = valEl.textContent.trim();
    if (key) {
      chip.dataset.val = newVal;
      const codeSpan = chip.querySelector('.pb-chip-code');
      if (codeSpan) codeSpan.innerHTML = renderChipCode(key, newVal);
      sendOverrideToIframe(iframe, key, newVal, chip.dataset.selector);
    } else if (chip.dataset.raw != null) {
      chip.dataset.raw = newVal;
      valEl.innerHTML = renderTokens(tokenizeValue(newVal));
    }
  }, true);

  // Enter 차단 (편집 중)
  chipsBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest?.('.pb-chip-val')) {
      e.preventDefault();
      e.target.blur();
    }
  });

  // × 클릭 → 칩 제거 (이 컬럼 iframe에 revert 송신)
  chipsBox.addEventListener('mousedown', (e) => {
    const del = e.target.closest?.('.pb-chip-del');
    if (!del) return;
    e.preventDefault();
    e.stopPropagation();
    const chip = del.closest('.pb-chip');
    if (!chip) return;
    const key = chip.dataset.key;
    if (key && iframe?.contentWindow) {
      if (key.includes('.')) {
        iframe.contentWindow.postMessage({ type: 'CONFIG_REVERT', path: key }, '*');
      } else if (chip.dataset.selector) {
        iframe.contentWindow.postMessage({ type: 'STYLE_REVERT', selector: chip.dataset.selector, key }, '*');
      }
    }
    chip.remove();
  });
};

const enterVariationMode = () => {
  const layout = document.querySelector('.lab-layout');
  const grid = document.getElementById('variation-grid');
  const mainIframe = document.getElementById('experiment-frame');
  if (!layout || !grid || !mainIframe) return;
  const src = mainIframe.getAttribute('src');
  if (!src) return;

  // 메인 prompt-builder 칩 스냅샷
  const body = document.getElementById('prompt-builder-body');
  const baseChips = body
    ? Array.from(body.querySelectorAll('.pb-chip')).map(chip => ({
        key: chip.dataset.key || null,
        val: chip.dataset.val ?? '',
        raw: chip.dataset.raw || null,
        selector: (() => {
          let cur = chip.previousSibling;
          while (cur) {
            if (cur.nodeType === 1 && cur.classList?.contains('pb-layer-title')) return cur.dataset.selector;
            cur = cur.previousSibling;
          }
          return null;
        })(),
      }))
    : [];

  grid.innerHTML = '';
  for (let i = 0; i < VARIATION_COUNT; i++) {
    const col = document.createElement('div');
    col.className = 'variation-col';
    col.dataset.idx = String(i);

    const frame = document.createElement('div');
    frame.className = 'variation-frame';
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.dataset.idx = String(i);
    frame.appendChild(iframe);

    // iframe scale — content area의 가로/세로 모두 고려. border + box-sizing 영향으로 한쪽만 쓰면 1~2px 짤림
    const applyScale = () => {
      const w = frame.clientWidth;
      const h = frame.clientHeight;
      if (!w || !h) return;
      const scale = Math.min(w / 393, h / 852);
      iframe.style.transform = `translate(-50%, -50%) scale(${scale})`;
    };
    requestAnimationFrame(applyScale);
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(applyScale).observe(frame);
    }

    const chipsBox = document.createElement('div');
    chipsBox.className = 'variation-chips';

    const adopt = document.createElement('button');
    adopt.className = 'variation-adopt';
    adopt.type = 'button';
    adopt.textContent = '채택';
    adopt.addEventListener('click', () => adoptVariation(i));

    col.appendChild(frame);
    col.appendChild(chipsBox);
    col.appendChild(adopt);
    grid.appendChild(col);

    // iframe load 후 현재 테마 + 칩 값 baseline 적용
    iframe.addEventListener('load', () => {
      // animConfig/retriggerMode 초기화 대기 (script.js init 완료 시점)
      setTimeout(() => {
        // 부모 다크/라이트 동기화
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        iframe.contentWindow?.postMessage({ type: 'THEME_CHANGE', isDark }, '*');
        // 메인 prompt-builder 칩 baseline 적용
        baseChips.forEach(c => {
          if (c.key) sendOverrideToIframe(iframe, c.key, c.val, c.selector);
        });
      }, 200);
    });

    // 칩 컬럼은 iframe과 페어링
    renderVariationChipsColumn(chipsBox, baseChips, iframe);
  }
  grid.hidden = false;
  layout.classList.add('is-variation-mode');
  document.getElementById('pb-variation')?.classList.add('is-on');
};

const exitVariationMode = () => {
  const layout = document.querySelector('.lab-layout');
  const grid = document.getElementById('variation-grid');
  if (!layout || !grid) return;
  grid.hidden = true;
  grid.innerHTML = '';
  layout.classList.remove('is-variation-mode');
  document.getElementById('pb-variation')?.classList.remove('is-on');
};

// 메인 chip에 대한 layer-title selector 찾기
const findMainChipLayerSelector = (chip) => {
  let cur = chip.previousSibling;
  while (cur) {
    if (cur.nodeType === 1 && cur.classList?.contains('pb-layer-title')) return cur.dataset.selector || null;
    cur = cur.previousSibling;
  }
  return null;
};

const adoptVariation = (idx) => {
  const grid = document.getElementById('variation-grid');
  const col = grid?.querySelector(`.variation-col[data-idx="${idx}"]`);
  const mainBody = document.getElementById('prompt-builder-body');
  const mainIframe = document.getElementById('experiment-frame');
  if (!col || !mainBody) { exitVariationMode(); return; }

  const variantChips = Array.from(col.querySelectorAll('.pb-chip'));
  const mainChips = Array.from(mainBody.querySelectorAll('.pb-chip'));

  variantChips.forEach(vChip => {
    const key = vChip.dataset.key;
    const newVal = vChip.dataset.val;
    const vSelector = vChip.dataset.selector || null;
    if (!key || newVal == null) return;

    // (key, selector) 매칭으로 메인 칩 찾기
    const target = mainChips.find(mc => {
      if (mc.dataset.key !== key) return false;
      const mSel = findMainChipLayerSelector(mc);
      return mSel === vSelector;
    });
    if (!target) return;

    // 메인 칩 값/렌더 갱신
    target.dataset.val = newVal;
    const codeSpan = target.querySelector('.pb-chip-code');
    if (codeSpan) codeSpan.innerHTML = renderChipCode(key, newVal);

    // 메인 iframe에도 override 송신 → 즉시 시각 반영
    if (mainIframe?.contentWindow) {
      if (key.includes('.')) {
        mainIframe.contentWindow.postMessage({ type: 'CONFIG_OVERRIDE', path: key, value: newVal }, '*');
      } else if (vSelector) {
        mainIframe.contentWindow.postMessage({ type: 'STYLE_OVERRIDE', selector: vSelector, key, value: newVal }, '*');
      }
    }
  });

  exitVariationMode();
};

const initPromptBuilder = () => {
  const body = document.getElementById('prompt-builder-body');
  const copyBtn = document.getElementById('pb-copy');
  const clearBtn = document.getElementById('pb-clear');
  const toggleBtn = document.getElementById('pb-toggle');
  const variationBtn = document.getElementById('pb-variation');
  const panel = document.getElementById('prompt-builder');
  if (!body || !copyBtn || !clearBtn) return;

  variationBtn?.addEventListener('click', () => {
    const layout = document.querySelector('.lab-layout');
    if (layout?.classList.contains('is-variation-mode')) {
      exitVariationMode();
    } else {
      enterVariationMode();
    }
  });

  // 초기 렌더 (비어있으면 섹션 자체 숨김)
  renderHistory(false);
  updatePromptBuilderEmptyState();

  // 접힘 상태 복원
  try {
    if (localStorage.getItem('pb-collapsed') === '1') panel?.classList.add('is-collapsed');
  } catch {}
  toggleBtn?.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    try { localStorage.setItem('pb-collapsed', collapsed ? '1' : '0'); } catch {}
  });

  copyBtn.addEventListener('click', () => {
    const text = serializePromptBody(body);
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => flashBtn(copyBtn));
  });

  clearBtn.addEventListener('click', () => {
    body.querySelectorAll('.pb-chip').forEach(chip => revertChipOverride(chip));
    body.innerHTML = '';
    flashBtn(clearBtn, 280);
    updatePromptBuilderEmptyState();
    // variation 모드 활성 상태였으면 종료
    if (document.querySelector('.lab-layout')?.classList.contains('is-variation-mode')) {
      exitVariationMode();
    }
  });

  // 칩 하나의 override 원복 (× 클릭 + Clear 양쪽에서 재사용)
  const revertChipOverride = (chip) => {
    const key = chip.dataset.key;
    if (!key) return;
    const iframe = document.getElementById('experiment-frame');
    if (!iframe?.contentWindow) return;
    if (key.includes('.')) {
      iframe.contentWindow.postMessage({ type: 'CONFIG_REVERT', path: key }, '*');
    } else {
      const layerTitle = findLayerTitleForChip(chip);
      const selector = layerTitle?.dataset.selector;
      if (selector) {
        iframe.contentWindow.postMessage({ type: 'STYLE_REVERT', selector, key }, '*');
      }
    }
  };

  // 칩 × 버튼 클릭 → revert + 제거
  body.addEventListener('mousedown', (e) => {
    const del = e.target.closest('.pb-chip-del');
    if (del) {
      e.preventDefault();
      e.stopPropagation();
      const chip = del.closest('.pb-chip');
      if (chip) {
        revertChipOverride(chip);
        const next = chip.nextSibling;
        chip.remove();
        if (next && next.nodeType === 3 && /^\s$/.test(next.nodeValue)) next.remove();
        updatePromptBuilderEmptyState();
      }
    }
  });

  // value 편집 중 Enter 차단
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest && e.target.closest('.pb-chip-val')) {
      e.preventDefault();
      e.target.blur();
    }
  });

  // 칩의 직전 layer-title (DOM 역방향 탐색) — 어떤 셀렉터에 적용할지 알아내기 위함
  const findLayerTitleForChip = (chip) => {
    let cur = chip.previousSibling;
    while (cur) {
      if (cur.nodeType === 1 && cur.classList?.contains('pb-layer-title')) return cur;
      cur = cur.previousSibling;
    }
    return null;
  };

  // iframe에 세션 override 송신 — 본 코드 안 건드리고 메모리에서만 적용
  const sendOverride = (key, value, selector) => {
    const iframe = document.getElementById('experiment-frame');
    if (!iframe?.contentWindow) return;
    // path 형식 (containerArs.btnOpacityDuration) → config 모션 값
    if (key.includes('.')) {
      iframe.contentWindow.postMessage({
        type: 'CONFIG_OVERRIDE',
        path: key, value,
      }, '*');
    } else {
      iframe.contentWindow.postMessage({
        type: 'STYLE_OVERRIDE',
        selector, key, value,
      }, '*');
    }
  };

  // value blur → 재토큰화 + iframe 적용
  body.addEventListener('blur', (e) => {
    const val = e.target.closest && e.target.closest('.pb-chip-val');
    if (!val) return;
    const chip = val.closest('.pb-chip');
    if (!chip) return;
    const key = chip.dataset.key;
    const newVal = val.textContent.trim();
    if (key) {
      // key:val 칩 — 재토큰화 + override 송신
      chip.dataset.val = newVal;
      const codeSpan = chip.querySelector('.pb-chip-code');
      if (codeSpan) codeSpan.innerHTML = renderChipCode(key, newVal);
      const layerTitle = findLayerTitleForChip(chip);
      const selector = layerTitle?.dataset.selector;
      sendOverride(key, newVal, selector);
    } else if (chip.dataset.raw != null) {
      // raw 칩 (애니메이션 등) — 토큰만 재렌더 (override 송신 X, 의미 모르므로)
      chip.dataset.raw = newVal;
      val.innerHTML = renderTokens(tokenizeValue(newVal));
    }
  }, true);
};

export const initInspector = () => {
  const inspectorPanel = document.getElementById('inspector-panel');
  const iframeContainer = document.getElementById('experiment-frame');
  const inspectorContent = document.getElementById('inspector-content');

  if (!inspectorPanel || !iframeContainer || !inspectorContent) return;

  initPromptBuilder();

  let lastPayload = null;
  const BG_FMT_KEY = 'inspector-bg-format';
  const stored = (() => { try { return localStorage.getItem(BG_FMT_KEY); } catch { return null; } })();
  let bgFormat = (['raw','hex','rgb','token'].includes(stored) ? stored : 'hex'); // 'raw' | 'hex' | 'rgb' | 'token'
  const persistFmt = () => { try { localStorage.setItem(BG_FMT_KEY, bgFormat); } catch {} };

  const renderFmtToggle = () => {
    const host = document.getElementById('inspector-fmt-toggle');
    if (!host) return;
    host.innerHTML = `
      <div class="ins-fmt-toggle">
        <button data-fmt="hex" class="${bgFormat==='hex'?'is-on':''}">Hex</button>
        <button data-fmt="rgb" class="${bgFormat==='rgb'?'is-on':''}">RGB</button>
        <button data-fmt="token" class="${bgFormat==='token'?'is-on':''}">Token</button>
      </div>`;
    host.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const f = btn.getAttribute('data-fmt');
        bgFormat = (bgFormat === f) ? 'raw' : f;
        persistFmt();
        renderFmtToggle();
        if (lastPayload) renderPanel();
      });
    });
  };
  renderFmtToggle();

  // 패널은 항상 open (상시 노출)
  inspectorPanel.classList.add('open');
  inspectorContent.innerHTML = '<div class="ins-placeholder">Shift 키를 누른 채로<br/>레이어를 클릭해 검사</div>';

  // ─── Shift 키 상태를 iframe에 동기화 ───
  const sendShift = (active) => {
    if (iframeContainer.contentWindow) {
      iframeContainer.contentWindow.postMessage({ type: 'SET_SHIFT', active }, '*');
    }
  };
  window.addEventListener('keydown', (e) => { if (e.key === 'Shift') sendShift(true); });
  window.addEventListener('keyup',   (e) => { if (e.key === 'Shift') sendShift(false); });
  window.addEventListener('blur',    () => sendShift(false));

  // ─── 색상 변환 헬퍼 ───
  const expandHex = (hex) => {
    if (/^#[0-9a-fA-F]{3,4}$/.test(hex)) {
      return ('#' + hex.slice(1).split('').map(c => c+c).join('')).toLowerCase();
    }
    return hex.toLowerCase();
  };
  const rgbToHex = (rgbStr) => {
    const m = rgbStr.match(/rgba?\(([^)]+)\)/);
    if (!m) return rgbStr;
    const parts = m[1].split(/[,/\s]+/).filter(Boolean);
    if (parts.length < 3) return rgbStr;
    const [r, g, b] = parts.slice(0, 3).map(n => parseInt(n));
    if ([r,g,b].some(v => isNaN(v))) return rgbStr;
    let hex = '#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join('');
    if (parts[3] !== undefined) {
      const a = parseFloat(parts[3]);
      if (!isNaN(a) && a < 1) {
        hex += Math.round(a * 255).toString(16).padStart(2,'0');
      }
    }
    return hex.toLowerCase();
  };
  const hexToRgb = (hex) => {
    const h = expandHex(hex).slice(1);
    const r = parseInt(h.slice(0,2), 16);
    const g = parseInt(h.slice(2,4), 16);
    const b = parseInt(h.slice(4,6), 16);
    if (h.length === 8) {
      const a = +(parseInt(h.slice(6,8), 16) / 255).toFixed(2);
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  };
  const toCanonHex = (color) => {
    if (color.startsWith('#')) return expandHex(color);
    if (color.startsWith('rgb')) return rgbToHex(color);
    return color;
  };

  const placeholderHtml = '<div class="ins-placeholder">Shift 키를 누른 채로<br/>레이어를 클릭해 검사</div>';

  let treeOpen = false;
  let displayedTree = null;       // 현재 트리 패널이 보여주는 스냅샷
  let pendingTreeRefresh = false; // 트리 노드 클릭으로 navigate한 직후만 true
  const renderFamilyTree = () => {
    const panel = document.getElementById('family-tree');
    const body = document.getElementById('family-tree-body');
    if (!panel || !body) return;
    const tree = displayedTree || [];
    const show = treeOpen && tree.length > 0;
    panel.hidden = !show;
    // 헤더 버튼 active 상태 동기화
    inspectorContent.querySelector('.ins-tree-toggle')?.classList.toggle('is-on', treeOpen);
    if (!show) { body.innerHTML = ''; return; }
    const escAttr = (s) => String(s).replace(/"/g, '&quot;');
    // 노드 위치를 기반으로 트리 프리픽스(│ ├ └) 계산
    const buildPrefix = (i) => {
      const n = tree[i];
      const parts = [];
      for (let c = 0; c < n.depth; c++) {
        let hasLater = false;
        for (let j = i + 1; j < tree.length; j++) {
          if (tree[j].depth < c) break;
          if (tree[j].depth === c) { hasLater = true; break; }
        }
        parts.push(hasLater ? '│ ' : '  ');
      }
      if (n.depth > 0) {
        let isLast = true;
        for (let j = i + 1; j < tree.length; j++) {
          if (tree[j].depth < n.depth) break;
          if (tree[j].depth === n.depth) { isLast = false; break; }
        }
        parts[n.depth - 1] = isLast ? '└ ' : '├ ';
      }
      return parts.join('');
    };
    body.innerHTML = tree.map((n, i) => {
      const prefix = buildPrefix(i);
      if (n.kind === 'ellipsis') {
        return `<div class="ftree-node is-ellipsis"><span class="ftree-prefix">${prefix}</span>…</div>`;
      }
      const cls = ['ftree-node', n.isTarget ? 'is-target' : '', `ftree-${n.kind}`].filter(Boolean).join(' ');
      return `<button class="${cls}" data-tree-id="${n.id}"><span class="ftree-prefix">${prefix}</span>${escAttr(n.label)}</button>`;
    }).join('');
    body.querySelectorAll('[data-tree-id]').forEach(el => {
      el.addEventListener('click', () => {
        if (el.classList.contains('is-target')) return;
        const id = parseInt(el.getAttribute('data-tree-id'), 10);
        if (iframeContainer.contentWindow) {
          pendingTreeRefresh = true; // 다음 INSPECTOR_SELECT 시 트리 갱신
          iframeContainer.contentWindow.postMessage({ type: 'INSPECTOR_PICK_TREE', id }, '*');
        }
      });
    });
    // target 노드를 패널 세로 중앙에 위치시킴
    const tgt = body.querySelector('.is-target');
    if (tgt) {
      const off = tgt.offsetTop - (body.clientHeight - tgt.offsetHeight) / 2;
      body.scrollTop = Math.max(0, off);
    }
  };

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'INSPECTOR_SELECT') {
      lastPayload = e.data.payload;
      renderPanel();
      // 트리는 노드 클릭으로 navigate한 경우에만 갱신, 외부 select는 기존 트리 유지
      if (pendingTreeRefresh && lastPayload?.tree) {
        displayedTree = lastPayload.tree;
        pendingTreeRefresh = false;
        renderFamilyTree();
      } else {
        // 토글 active 상태만 동기화 (panel.hidden은 그대로)
        inspectorContent.querySelector('.ins-tree-toggle')?.classList.toggle('is-on', treeOpen);
      }
    }
    // INSPECTOR_DESELECT는 보더만 숨기는 신호 — 패널 정보는 유지하므로 별도 처리 없음
  });

  // 뷰포트(iframe 주변) 빈 영역 클릭 → iframe에 보더 숨김 신호 (패널 정보 유지)
  const labViewport = document.querySelector('.lab-viewport');
  if (labViewport) {
    labViewport.addEventListener('click', (e) => {
      if (e.target === labViewport && iframeContainer.contentWindow) {
        iframeContainer.contentWindow.postMessage({ type: 'INSPECTOR_CLEAR_SELECT' }, '*');
      }
    });
  }

  function renderPanel() {
    if (!lastPayload) return;
    const { selector, styleGroups, animations, tokenIndex = {}, elementVars = {}, varHexMap = {} } = lastPayload;

    // tokenIndex 역매핑 (token name → hex) — prompt builder의 var() swatch에 사용
    tokenColorMap = {};
    designTokenColorMap = {};
    for (const [hex, name] of Object.entries(tokenIndex)) {
      tokenColorMap[name] = hex;
      designTokenColorMap[stripFigPrefix(name)] = hex;
    }
    // varHexMap (전체 토큰 → hex) 추가 매핑 — priority에서 밀려난 alias도 swatch 보이게
    for (const [name, hex] of Object.entries(varHexMap)) {
      if (!tokenColorMap[name]) tokenColorMap[name] = hex;
      const stripped = stripFigPrefix(name);
      if (!designTokenColorMap[stripped]) designTokenColorMap[stripped] = hex;
    }

    const escAttr = (s) => String(s).replace(/"/g, '&quot;');
    // row hover 시 우측에 복사 아이콘, 클릭 후엔 ✓ 로 잠시 바뀜
    const checkSpan = `<span class="ins-row-copy" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span><span class="ins-check">✓</span>`;

    const splitTopLevelCommas = (s) => {
      const out = []; let depth = 0; let buf = '';
      for (const ch of s) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
        buf += ch;
      }
      if (buf.trim()) out.push(buf.trim());
      return out;
    };
    const formatGradientInner = (gradStr) =>
      gradStr.replace(/(linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient)\(([^]*)\)/g, (m, name, inner) => {
        const parts = splitTopLevelCommas(inner);
        return `${name}(\n  ${parts.join(',\n  ')}\n)`;
      });
    const formatLineBreaks = (raw) => {
      let v = raw;
      if (raw.length > 80) {
        const parts = splitTopLevelCommas(raw);
        if (parts.length > 1 && !/gradient\(/.test(raw)) {
          v = parts.join(',\n');
        }
      }
      if (/gradient\(/.test(v)) v = formatGradientInner(v);
      return v;
    };

    const colorRe = /(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\([^)]*\)|hsla?\([^)]*\))/g;
    // hex 모드에서는 6자리만 표시 (alpha 분리 정책). 토큰이 있으면 토큰 우선.
    // propName: token 모드에서 elementVars[propName]을 hex reverse lookup보다 우선 사용
    const convertColors = (str, fmt, propName) => {
      if (fmt === 'raw' || fmt == null) return str;
      // token 모드: 매칭된 CSS rule에서 직접 var() 추출 (정확)
      if (fmt === 'token' && propName && elementVars[propName]) {
        return stripFigPrefix(elementVars[propName]);
      }
      return str.replace(colorRe, (m) => {
        if (m.startsWith('hsl')) return m;
        if (fmt === 'hex') {
          const canon = toCanonHex(m); // lowercase
          // 8자리면 alpha 떼고 6자리로 (대문자)
          return canon.length === 9 ? canon.slice(0, 7).toUpperCase() : canon.toUpperCase();
        }
        if (fmt === 'rgb') {
          if (m.startsWith('rgb')) return m;
          return hexToRgb(m);
        }
        if (fmt === 'token') {
          const norm = toCanonHex(m);
          const name = tokenIndex[norm];
          return name ? stripFigPrefix(name) : '-';
        }
        return m;
      });
    };

    // 단일 색상 값이면 alpha 분리 — { hex: '#XXXXXX', alpha: 0.x }
    // 아니면 null
    const splitSingleColorAlpha = (raw) => {
      const trimmed = raw.trim();
      const match = trimmed.match(/^(#(?:[0-9a-fA-F]{8})|rgba?\([^)]*\))$/);
      if (!match) return null;
      const canon = toCanonHex(trimmed);
      if (canon.length !== 9) return null;
      const hex6 = canon.slice(0, 7).toUpperCase();
      const alpha = +(parseInt(canon.slice(7), 16) / 255).toFixed(2);
      return { hex: hex6, alpha };
    };
    const withSwatches = (formatted) => {
      let out = formatted.replace(colorRe, (m) =>
        `<span class="ins-swatch" style="background-color:${m}"></span>${m}`
      );
      // var(--token) 형태도 색상 미리보기 (tokenColorMap 매칭 시)
      out = out.replace(/var\(\s*(--[\w-]+)\s*\)/g, (full, name) => {
        const c = tokenColorMap[name];
        return c ? `<span class="ins-swatch" style="background-color:${c}"></span>${full}` : full;
      });
      // design token 이름(--fig- 제거된 형태)도 swatch 노출
      out = out.replace(/\b([a-z][a-z0-9-]+)\b/g, (full, name) => {
        const c = designTokenColorMap[name];
        return c ? `<span class="ins-swatch" style="background-color:${c}"></span>${full}` : full;
      });
      return out;
    };
    const renderValue = (raw, fmt, propName) => withSwatches(formatLineBreaks(convertColors(raw, fmt, propName)));

    // 색상 포맷은 모든 섹션에 동일하게 적용 (typography color, box border 등 포함)
    const fmtForGroup = () => bgFormat;

    const treeBtnHtml = `<button class="ins-tree-toggle" type="button" title="레이어 트리 보기" aria-label="레이어 트리 보기"><svg width="10" height="12" viewBox="0 0 12 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 5 6 2 9 5"/><polyline points="3 9 6 12 9 9"/></svg></button>`;

    let html = `
      <div class="ins-title-row" data-copy="${escAttr(selector)}">
        ${treeBtnHtml}
        <div class="ins-title">${selector}</div>
        ${checkSpan}
      </div>
      <div class="ins-divider"></div>`;

    for (const [groupName, props] of Object.entries(styleGroups)) {
      const fmt = fmtForGroup();
      html += `
        <div class="ins-section">
          <div class="ins-section-head">
            <span class="ins-section-title">${groupName}</span>
          </div>
          <div class="ins-rows">
            ${Object.entries(props).map(([k, v]) => {
              // hex 모드 + 단일 색상 + alpha → opacity sub-row 추가
              if (fmt === 'hex') {
                const split = splitSingleColorAlpha(v);
                if (split && split.alpha < 1) {
                  return `
                    <div class="ins-row" data-copy="${escAttr(`${k}: ${split.hex};`)}">
                      <div class="ins-row-key">${k}</div>
                      <div class="ins-row-val"><span class="ins-swatch" style="background-color:${v}"></span>${split.hex}</div>
                      ${checkSpan}
                    </div>
                    <div class="ins-row ins-row--sub" data-copy="${escAttr(`opacity: ${split.alpha};`)}">
                      <div class="ins-row-key">↳ opacity</div>
                      <div class="ins-row-val">${split.alpha}</div>
                      ${checkSpan}
                    </div>`;
                }
              }
              const displayedV = convertColors(v, fmt, k);
              return `
                <div class="ins-row" data-copy="${escAttr(`${k}: ${displayedV};`)}">
                  <div class="ins-row-key">${k}</div>
                  <div class="ins-row-val">${renderValue(v, fmt, k)}</div>
                  ${checkSpan}
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    if (animations && animations.length) {
      // 트리거별 그룹핑 (없으면 'unknown')
      const groups = new Map();
      for (const a of animations) {
        const key = a.trigger || (a.source === 'live' ? 'live' : 'unknown');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(a);
      }

      // 각 그룹의 maxTime 계산 (delay + duration)
      const groupTotalEnd = (arr) => Math.max(...arr.map(a => (a.delay || 0) + (a.duration || 300)));

      // 라벨 추측 (props 기반 한국어 별칭)
      const inferLabel = (a) => {
        const p = (a.propValues && Object.keys(a.propValues)) || [];
        if (p.includes('opacity')) {
          const [from, to] = a.propValues.opacity || [];
          if (from === 0 && to === 1) return '페이드인';
          if (from === 1 && to === 0) return '페이드아웃';
          return '페이드';
        }
        if (p.includes('y') || p.includes('scale') || p.includes('x')) return '등장';
        return a.props || 'animate';
      };

      // 타이밍 라벨 (Spring vs ease/linear)
      const timingLabel = (a) => {
        if (a.type === 'spring' && a.stiffness != null) {
          return `Spring (${a.stiffness}, ${a.damping})`;
        }
        const ms = a.duration != null ? `${Math.round(a.duration)}ms` : '';
        const ease = (a.easing && a.easing !== 'default') ? ` ${a.easing}` : '';
        return `${ms}${ease}`.trim();
      };

      // props 변화 표기 — opacity 0→1, y [30, 0] 등
      const propsChangeText = (a) => {
        const pv = a.propValues || {};
        const parts = [];
        for (const [k, v] of Object.entries(pv)) {
          if (Array.isArray(v) && v.length === 2) parts.push(`${k} ${v[0]}→${v[1]}`);
          else if (Array.isArray(v) && v.length === 1) parts.push(`${k} ${v[0]}`);
          else parts.push(k);
        }
        return parts.join(', ');
      };

      let timelineHtml = '';
      let groupIdx = 0;
      for (const [trigger, arr] of groups) {
        groupIdx++;
        const maxT = groupTotalEnd(arr);
        // 각 bar의 start/end 시간만 tick으로 표시 (중복 제거)
        const tickSet = new Set();
        for (const a of arr) {
          const s = a.delay || 0;
          const e = s + (a.duration || 300);
          tickSet.add(s);
          tickSet.add(e);
        }
        const ticks = [...tickSet].sort((a, b) => a - b);

        const axisHtml = ticks.map(t => `<span class="ins-tl-tick" style="left:${(t / maxT) * 100}%">${Math.round(t)}ms</span>`).join('');

        const rowsHtml = arr.map(a => {
          const start = a.delay || 0;
          const dur = a.duration || 300;
          const end = start + dur;
          const left = (start / maxT) * 100;
          const width = ((end - start) / maxT) * 100;
          const label = inferLabel(a);
          const change = propsChangeText(a);
          const tim = timingLabel(a);
          const copyText = `${label} — ${change} (${tim})`;
          const animJson = escAttr(JSON.stringify(a));
          return `
            <div class="ins-tl-row" data-copy="${escAttr(copyText)}" data-anim="${animJson}">
              <div class="ins-tl-bar" style="left:${left}%; width:${width}%">
                <span class="ins-tl-bar-label">${label}</span>
                <span class="ins-tl-bar-prop">${change}</span>
                <span class="ins-tl-bar-tim">${tim}</span>
              </div>
              ${checkSpan}
            </div>`;
        }).join('');

        timelineHtml += `
          <div class="ins-tl-group">
            <div class="ins-tl-axis">${axisHtml}</div>
            <div class="ins-tl-rows-wrap">${rowsHtml}</div>
          </div>`;
      }

      html += `
        <div class="ins-section">
          <div class="ins-section-head">
            <span class="ins-section-title">Animations</span>
          </div>
          <div class="ins-tl">${timelineHtml}</div>
        </div>`;
    }

    inspectorContent.innerHTML = html;

    // 애니메이션 데이터 → animConfig path 추론
    const getByPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
    const eq = (a, b) => {
      if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
      return a === b;
    };
    const findInScope = (root, target, prefix = '') => {
      if (root == null) return null;
      // 대상 값과 정확히 매치되는 첫 path 반환
      for (const k of Object.keys(root)) {
        const v = root[k];
        const path = prefix ? `${prefix}.${k}` : k;
        if (eq(v, target)) return path;
        // 1000배 매치 (s↔ms 변환 케이스)
        if (typeof v === 'number' && typeof target === 'number' && Math.abs(v - target * 1000) < 0.5) return path;
        if (typeof v === 'object' && v != null && !Array.isArray(v)) {
          const found = findInScope(v, target, path);
          if (found) return found;
        }
      }
      return null;
    };
    const resolveAnimToChips = (anim) => {
      const animConfig = lastPayload?.animConfig;
      const triggerPaths = lastPayload?.triggerPaths || {};
      if (!animConfig) return [];
      const scopePath = anim.trigger ? triggerPaths[anim.trigger] : null;
      const scope = scopePath ? getByPath(animConfig, scopePath) : animConfig;
      const scopePrefix = scopePath || '';
      if (!scope) return [];

      const chips = [];
      const addChip = (target) => {
        const path = findInScope(scope, target, scopePrefix);
        if (path) {
          // 화면에 표시할 값은 animConfig 원본값 (예: btnDuration=450 ms 형태)
          const origVal = getByPath(animConfig, path);
          chips.push({ key: path, val: origVal });
        }
      };

      // duration / delay / easing
      if (typeof anim.duration === 'number') addChip(anim.duration / 1000); // ms→s, findInScope가 *1000도 시도
      if (typeof anim.delay === 'number' && anim.delay > 0) addChip(anim.delay);
      if (anim.easing && anim.easing !== 'linear' && anim.easing !== 'default') addChip(anim.easing);
      if (anim.type === 'spring' && anim.stiffness != null) addChip(anim.stiffness);
      if (anim.type === 'spring' && anim.damping != null) addChip(anim.damping);

      // propValues (from→to). from을 검색 — 보통 config에 from 값이 박힘
      if (anim.propValues) {
        for (const v of Object.values(anim.propValues)) {
          if (Array.isArray(v) && v.length === 2) {
            // 배열 자체 매치 시도 (e.g. [30, 0] → gradientYIn)
            addChip(v);
            // from 단독도 시도 (e.g. 0.95 → btnScaleFrom)
            addChip(v[0]);
          }
        }
      }

      // 중복 제거
      const seen = new Set();
      return chips.filter(c => {
        if (seen.has(c.key)) return false;
        seen.add(c.key);
        return true;
      });
    };

    // 클릭 가능한 모든 row
    inspectorContent.querySelectorAll('[data-copy]').forEach(row => {
      row.addEventListener('click', (e) => {
        const text = row.getAttribute('data-copy');
        const isTitle = row.classList.contains('ins-title-row');
        const animJson = row.getAttribute('data-anim');
        if (isTitle) {
          ensureLayerTitle(selector);
        } else if (animJson) {
          // 타임라인 row → animConfig path로 분해해 다중 칩 추가
          try {
            const anim = JSON.parse(animJson);
            const resolved = resolveAnimToChips(anim);
            if (resolved.length) {
              for (const { key, val } of resolved) {
                const valText = JSON.stringify(val);
                addChipToBuilder(`${key}: ${valText};`, selector);
              }
            } else {
              // path 못 찾음 → fallback raw 칩
              addChipToBuilder(text, selector);
            }
          } catch {
            addChipToBuilder(text, selector);
          }
        } else {
          addChipToBuilder(text, selector);
        }
        navigator.clipboard.writeText(text).catch(() => {});
        row.classList.add('is-copied');
        setTimeout(() => row.classList.remove('is-copied'), 800);
      });
    });

    // 트리 토글 버튼 — title row 클릭(복사)으로 버블링되지 않게 stopPropagation
    inspectorContent.querySelector('.ins-tree-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      treeOpen = !treeOpen;
      if (treeOpen) displayedTree = lastPayload?.tree || []; // 토글로 열 때 현재 target 기준 스냅샷
      renderFamilyTree();
    });

  }

  // 테마 변경 시 패널 자동 갱신
  const requestRefresh = () => {
    if (lastPayload && iframeContainer.contentWindow) {
      setTimeout(() => {
        iframeContainer.contentWindow.postMessage({ type: 'INSPECTOR_REFRESH' }, '*');
      }, 16);
    }
  };
  const themeObserver = new MutationObserver(() => requestRefresh());
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
};
