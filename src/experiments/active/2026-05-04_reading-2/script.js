// 0504 2 — Reading App (앱 셸 + 챗봇 + 위키)
// 메인 라우터 + 기존 chat/wiki 유지 + 새 탭(library/profile)·모달(book-search/quote-add) 진입점.

import {
  config, openingPrompts, quickReplies, aiReplies, quoteReply,
  wikiPages, wikiLog, wikiGraph,
  seedBooks, seedQuotes,
} from './config.js';

import { Books, Quotes, onChange } from './services/storage.js';

import * as homeView    from './views/home.js';
import * as libraryView from './views/library.js';
import * as quoteView   from './views/quote.js';
import * as profileView from './views/profile.js';

const root  = document.querySelector('.canvas-content');
const views = root.querySelectorAll('.view');
const bnav  = root.querySelector('#bnav');

// ── 시드 데이터 (첫 실행 시) ──────────────────
Books.seedIfEmpty(seedBooks);
Quotes.seedIfEmpty(seedQuotes);

// ── 현재 컨텍스트 (어떤 책으로 채팅/위키 진입했는지) ──
let activeBookId = (Books.all().find((b) => b.isCurrent) || Books.all()[0])?.id || null;

// 모듈 init은 한 번만, 진입할 때마다 update 호출
const moduleState = { home: false, library: false, profile: false, quote: false };

// 뷰 모듈에 넘겨주는 의존성 — 모듈끼리 직접 import 안 하도록 람다로 감쌈
const deps = {
  switchTab,
  switchView,
  openChat:        (bookId) => { activeBookId = bookId || activeBookId; openChat(); },
  openNotes:       (bookId) => { activeBookId = bookId || activeBookId; openNotes(); },
  openQuoteAdd:    (preset) => openQuoteAdd(preset),
  openBookSearch:  ()       => openBookSearch(),
  closeModal:      ()       => switchTab(currentTab),
  getActiveBookId: ()       => activeBookId,
};

// ── 탭 전환 (홈/서재/내정보) ──────────────────
let currentTab = 'home';
function switchTab(tabName) {
  currentTab = tabName;
  switchView(tabName);
  // bnav 활성 칩
  bnav.querySelectorAll('.bnav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  showBnav(true);
}

// ── 뷰 전환 (모든 view) ──────────────────────
function switchView(target) {
  views.forEach((v) => v.classList.toggle('active', v.dataset.view === target));

  // 메인 탭 모듈 라이프사이클
  if (target === 'home') {
    if (!moduleState.home) { homeView.init(deps); moduleState.home = true; }
    else homeView.update(deps);
  }
  if (target === 'library') {
    if (!moduleState.library) { libraryView.init(deps); moduleState.library = true; }
    else libraryView.update(deps);
  }
  if (target === 'profile') {
    if (!moduleState.profile) { profileView.init(deps); moduleState.profile = true; }
    else profileView.update(deps);
  }

  // bnav 보일지 결정 — 메인 탭만 노출
  const isMainTab = ['home', 'library', 'profile'].includes(target);
  showBnav(isMainTab);

  // 챗 / 노트 진입 시 처리
  if (target === 'chat' && !chatStarted) {
    chatStarted = true;
    setChatTitleFromBook();
    startChatFlow();
  }
  if (target === 'notes') {
    setWikiTitleFromBook();
    renderWiki();
    const ns = root.querySelector('#notes-scroll');
    if (ns) ns.scrollTop = 0;
    if (!graphInited) initGraph();
    root.querySelector('#graph-toggle-btn')?.classList.add('active');
  }
}

function showBnav(visible) { bnav.classList.toggle('hidden', !visible); }

// ── 챗/위키 진입 헬퍼 ────────────────────────
function openChat() { switchView('chat'); }
function openNotes() { switchView('notes'); }
function openBookSearch() {
  switchView('book-search');
  if (!moduleState.library) { libraryView.init(deps); moduleState.library = true; }
  libraryView.openSearch?.(deps);
}
function openQuoteAdd(preset) {
  switchView('quote-add');
  if (!moduleState.quote) { quoteView.init(deps); moduleState.quote = true; }
  quoteView.open?.({ ...deps, preset, defaultBookId: activeBookId });
}

function setChatTitleFromBook() {
  const b = Books.get(activeBookId);
  const el = root.querySelector('#chat-book-title');
  if (el && b) el.textContent = `${b.title} 메모 세션`;
}
function setWikiTitleFromBook() {
  const b = Books.get(activeBookId);
  const el = root.querySelector('#wiki-book-title');
  if (el && b) el.textContent = `${b.title} 위키`;
}

// ── 액션 라우팅 ─────────────────────────────
root.addEventListener('click', (e) => {
  // data-tab → 탭 전환
  const tabEl = e.target.closest('[data-tab]');
  if (tabEl) {
    e.preventDefault();
    const bookEl = e.target.closest('[data-book-id]');
    if (bookEl?.dataset.action === 'open-chat') {
      activeBookId = bookEl.dataset.bookId;
      openChat();
      return;
    }
    switchTab(tabEl.dataset.tab);
    return;
  }

  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const bookId = actionEl.dataset.bookId;

  switch (action) {
    case 'open-chat':
      if (bookId) activeBookId = bookId;
      openChat();
      break;
    case 'end-chat':
      openNotes();
      break;
    case 'end-chat-back':
      switchTab(currentTab);
      break;
    case 'notes-back':
      switchTab(currentTab);
      break;
    case 'back-notes':
      openNotes();
      break;
    case 'open-notes-from-home':
      if (bookId) activeBookId = bookId;
      openNotes();
      break;
    case 'open-quote-add':
      openQuoteAdd();
      break;
    case 'open-book-search':
      openBookSearch();
      break;
    case 'back-from-book-search':
    case 'back-from-quote-add':
      switchTab(currentTab);
      break;
    case 'toggle-graph':
      toggleGraph();
      break;
  }
});

// ── 데이터 변경 시 홈 갱신 ────────────────────
onChange(() => {
  if (moduleState.home && root.querySelector('.view-home').classList.contains('active')) {
    homeView.update(deps);
  }
});

// ============================================================
// 이하: 기존 chat / wiki / graph 로직 (그대로 유지)
// ============================================================

const chatScroll    = root.querySelector('#chat-scroll');
const chatMessages  = root.querySelector('#chat-messages');
const chatForm      = root.querySelector('#chat-form');
const chatInput     = root.querySelector('#chat-input');
const suggestionsEl = root.querySelector('#chat-suggestions');

const userAnswers = { why: '', goal: '' };
let chatPhase = 'greeting';
let chatStarted = false;
let aiReplyIndex = 0;

function startChatFlow() {
  setTimeout(() => {
    appendMessage('ai', openingPrompts.greeting);
    const greetingDuration = openingPrompts.greeting.length * config.chat.typingMsPerChar;
    setTimeout(() => {
      appendMessage('ai', openingPrompts.askWhy);
      chatPhase = 'askWhy';
      showSuggestions(quickReplies.why);
    }, greetingDuration + 250);
  }, config.chat.seedDelayMs);
}

function appendMessage(role, text, meta) {
  const wrap = document.createElement('div');
  wrap.className = `msg-wrap ${role}`;
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  if (role === 'ai') {
    [...text].forEach((ch, i) => {
      if (ch === '\n') { el.appendChild(document.createElement('br')); return; }
      const span = document.createElement('span');
      span.className = 'typing-char';
      span.textContent = ch;
      span.style.animationDelay = `${i * config.chat.typingMsPerChar}ms`;
      el.appendChild(span);
    });
  } else {
    el.textContent = text;
  }
  wrap.appendChild(el);

  if (role === 'ai' && meta?.savedTo?.length) {
    const badge = document.createElement('div');
    badge.className = 'msg-saved';
    badge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>위키 저장됨 · ${meta.savedTo.map((p) => `<b>${p}</b>`).join(' · ')}`;
    badge.style.opacity = '0';
    wrap.appendChild(badge);
    const totalDelay = text.length * config.chat.typingMsPerChar + config.chat.savedBadgeDelayMs;
    setTimeout(() => { badge.style.opacity = ''; }, totalDelay);
  }

  chatMessages.appendChild(wrap);
  requestAnimationFrame(() => { chatScroll.scrollTop = chatScroll.scrollHeight; });
}

function showSuggestions(items) {
  suggestionsEl.innerHTML = '';
  items.forEach((label) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggestion-chip';
    btn.textContent = label;
    btn.addEventListener('click', () => sendUserText(label));
    suggestionsEl.appendChild(btn);
  });
  suggestionsEl.removeAttribute('hidden');
}
function hideSuggestions() {
  suggestionsEl.setAttribute('hidden', '');
  suggestionsEl.innerHTML = '';
}

function sendUserText(text) {
  if (!text) return;
  appendMessage('user', text);
  hideSuggestions();
  handleUserReply(text);
}

chatForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  sendUserText(text);
});

function handleUserReply(text) {
  if (chatPhase === 'askWhy') {
    userAnswers.why = text;
    patchMetaPage('why-i-read', text);
    setTimeout(() => {
      const ack = openingPrompts.ackWhy({ why: text });
      appendMessage('ai', ack, { savedTo: ['내가 이 책을 읽는 이유'] });
      const ackDuration = ack.length * config.chat.typingMsPerChar;
      setTimeout(() => {
        appendMessage('ai', openingPrompts.askGoal);
        chatPhase = 'askGoal';
        showSuggestions(quickReplies.goal);
      }, ackDuration + 250);
    }, config.chat.aiReplyDelayMs);
    return;
  }
  if (chatPhase === 'askGoal') {
    userAnswers.goal = text;
    patchMetaPage('reading-goal', text);
    setTimeout(() => {
      const ack = openingPrompts.ackGoal({ goal: text });
      appendMessage('ai', ack, { savedTo: ['이 책에서 얻고 싶은 것'] });
      const ackDuration = ack.length * config.chat.typingMsPerChar;
      setTimeout(() => {
        appendMessage('ai', openingPrompts.startMemo);
        chatPhase = 'free';
      }, ackDuration + 250);
    }, config.chat.aiReplyDelayMs);
    return;
  }
  setTimeout(() => {
    if (text.length > 80) {
      const excerpt = pickExcerpt(text);
      appendMessage('ai', quoteReply({ excerpt }), { savedTo: ['인용'] });
      // 위키 자동 저장 — 인용 페이지에 추가
      Quotes.add({ bookId: activeBookId, text, page: '', memo: '' });
      return;
    }
    const reply = aiReplies[aiReplyIndex % aiReplies.length];
    aiReplyIndex++;
    appendMessage('ai', reply.text, reply.saved ? { savedTo: reply.saved } : undefined);
  }, config.chat.aiReplyDelayMs);
}

function pickExcerpt(text) {
  const sentences = text.split(/(?<=[.다요죠임함])\s+/).filter((s) => s.trim().length > 12);
  if (sentences.length === 0) return text.slice(0, 80);
  const mid = sentences[Math.floor(sentences.length / 2)] || sentences[0];
  return mid.length > 120 ? mid.slice(0, 120) + '…' : mid;
}

function patchMetaPage(id, text) {
  const page = wikiPages.find((p) => p.id === id);
  if (!page) return;
  page.summary = text || page.summary;
  page.body = `# ${page.title}\n\n> ${text || '(아직 적지 않음)'}\n\n## 연결된 페이지\n${
    id === 'why-i-read' ? '- [[이 책에서 얻고 싶은 것]]' : '- [[내가 이 책을 읽는 이유]]'
  }`;
}

// ── wiki render ──────────────────────────────
function renderWiki() {
  const list = root.querySelector('#wiki-pages');
  list.innerHTML = '';
  const sorted = [...wikiPages].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  sorted.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'wiki-page-item';
    li.dataset.pageId = p.id;
    li.innerHTML = `
      <div class="wpi-row">
        <span class="wpi-kind kind-${p.kind}">${kindLabel(p.kind)}</span>
        <h4 class="wpi-title">${p.title}</h4>
        ${p.isNew ? '<span class="wpi-new">NEW</span>' : ''}
        ${p.pinned ? '<span class="wpi-pin">📌</span>' : ''}
      </div>
      <p class="wpi-summary">${p.summary}</p>
      <div class="wpi-links">
        ${p.links.map((l) => `<span class="wpi-link">[[${l}]]</span>`).join('')}
        <span class="wpi-updated">${p.updated}</span>
      </div>
    `;
    li.addEventListener('click', () => openPageDetail(p.id));
    list.appendChild(li);
  });
  root.querySelector('#wiki-count').textContent = `${wikiPages.length}개`;

  const logEl = root.querySelector('#wiki-log');
  logEl.innerHTML = wikiLog.map((l) => `
    <li class="wiki-log-item">
      <span class="wlog-ts">${l.ts}</span>
      <span class="wlog-kind kind-${l.kind}">${l.kind}</span>
      <span class="wlog-text">${l.text}</span>
    </li>
  `).join('');
}

function kindLabel(k) {
  return ({ concept: '개념', compare: '비교', meta: '메타', collection: '모음' })[k] || k;
}

function openPageDetail(id) {
  const page = wikiPages.find((p) => p.id === id);
  if (!page) return;
  const body = root.querySelector('#page-detail-body');
  body.innerHTML = renderMarkdown(page.body);
  switchView('page-detail');
}

function renderMarkdown(md) {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\[\[([^\]]+)\]\]/g, '<a class="wikilink">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  if (html.includes('| ---')) {
    const lines = html.split('\n');
    const out = [];
    let inTable = false;
    for (const line of lines) {
      if (line.startsWith('|')) {
        if (!inTable) { out.push('<table>'); inTable = true; }
        if (line.includes('---')) continue;
        const cells = line.split('|').slice(1, -1).map((c) => c.trim());
        out.push('<tr>' + cells.map((c) => `<td>${c}</td>`).join('') + '</tr>');
      } else {
        if (inTable) { out.push('</table>'); inTable = false; }
        out.push(line);
      }
    }
    if (inTable) out.push('</table>');
    html = out.join('\n');
  }
  html = html.replace(/(^|\n)((?:- .+(?:\n|$))+)/g, (_, p1, block) => {
    const items = block.trim().split('\n').map((l) => `<li>${l.replace(/^- /, '')}</li>`).join('');
    return `${p1}<ul>${items}</ul>`;
  });
  html = html.split(/\n{2,}/).map((blk) => {
    if (/^<(h1|h2|ul|table|blockquote)/.test(blk.trim())) return blk;
    return `<p>${blk.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  return html;
}

// ── graph ────────────────────────────────────
let graphInited = false;
function toggleGraph() {
  const card = root.querySelector('#wiki-graph-card');
  const btn = root.querySelector('#graph-toggle-btn');
  const isHidden = card.hasAttribute('hidden');
  if (isHidden) {
    card.removeAttribute('hidden');
    btn.classList.add('active');
  } else {
    card.setAttribute('hidden', '');
    btn.classList.remove('active');
  }
}

function initGraph() {
  graphInited = true;
  const canvas = root.querySelector('#wiki-canvas');
  const svg = root.querySelector('#wiki-edges');
  const layer = root.querySelector('#wiki-nodes');
  requestAnimationFrame(() => {
    const rect = canvas.getBoundingClientRect();
    const W = rect.width || 320;
    const H = rect.height || config.wiki.canvasH;
    const nodeMap = {};
    wikiGraph.nodes.forEach((n) => {
      const el = document.createElement('div');
      el.className = 'wiki-node' + (n.center ? ' center' : '');
      el.dataset.id = n.id;
      el.dataset.label = n.label;
      el.style.left = `${n.x * W}px`;
      el.style.top  = `${n.y * H}px`;
      el.addEventListener('click', () => openPageDetail(n.id));
      layer.appendChild(el);
      nodeMap[n.id] = { el, x: n.x * W, y: n.y * H };
      enableDrag(el, nodeMap, n.id, canvas, svg);
    });
    const centerId = (wikiGraph.nodes.find((n) => n.center) || {}).id;
    wikiGraph.edges.forEach(([a, b]) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.dataset.a = a; line.dataset.b = b;
      if (a === centerId || b === centerId) line.classList.add('connected-to-center');
      svg.appendChild(line);
    });
    redrawEdges(nodeMap, svg);
  });
}

function redrawEdges(nodeMap, svg) {
  svg.querySelectorAll('line').forEach((line) => {
    const a = nodeMap[line.dataset.a];
    const b = nodeMap[line.dataset.b];
    if (!a || !b) return;
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
  });
}

function enableDrag(el, nodeMap, id, canvas, svg) {
  let startX, startY, origX, origY, moved = false;
  const adj = {};
  wikiGraph.edges.forEach(([a, b]) => {
    (adj[a] ??= new Set()).add(b);
    (adj[b] ??= new Set()).add(a);
  });
  const depth = new Map([[id, 0]]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    if (depth.get(cur) >= 2) continue;
    (adj[cur] || []).forEach((nid) => {
      if (!depth.has(nid)) { depth.set(nid, depth.get(cur) + 1); queue.push(nid); }
    });
  }
  const neighbors = [];
  depth.forEach((d, nid) => {
    if (d === 0) return;
    const node = nodeMap[nid];
    if (!node) return;
    neighbors.push({ node, ratio: d === 1 ? 0.06 : 0.025 });
  });

  const onMove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    const rect = canvas.getBoundingClientRect();
    let nx = origX + dx;
    let ny = origY + dy;
    nx = Math.max(12, Math.min(rect.width - 12, nx));
    ny = Math.max(12, Math.min(rect.height - 28, ny));
    nodeMap[id].x = nx; nodeMap[id].y = ny;
    el.style.left = `${nx}px`; el.style.top = `${ny}px`;
    neighbors.forEach(({ node, ratio }) => {
      const ox = (nx - origX) * ratio;
      const oy = (ny - origY) * ratio;
      node.el.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px)) scale(1)`;
    });
    redrawEdges(nodeMap, svg);
  };
  const onUp = () => {
    el.classList.remove('dragging');
    neighbors.forEach(({ node }) => { node.el.style.transform = ''; });
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (moved) {
      el.dataset.suppressClick = '1';
      setTimeout(() => delete el.dataset.suppressClick, 0);
    }
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    moved = false;
    el.classList.add('dragging');
    startX = e.clientX; startY = e.clientY;
    origX = nodeMap[id].x; origY = nodeMap[id].y;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
  el.addEventListener('click', (e) => {
    if (el.dataset.suppressClick) e.stopPropagation();
  }, true);
}

// ── 부팅 ─────────────────────────────────────
switchTab('home');
