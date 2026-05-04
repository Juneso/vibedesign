import {
  config, openingPrompts, quickReplies, aiReplies, quoteReply,
  wikiPages, wikiLog, wikiGraph,
} from './config.js';

const root = document.querySelector('.canvas-content');
const views = root.querySelectorAll('.view');

const chatScroll   = root.querySelector('#chat-scroll');
const chatMessages = root.querySelector('#chat-messages');
const chatForm     = root.querySelector('#chat-form');
const chatInput    = root.querySelector('#chat-input');
const suggestionsEl = root.querySelector('#chat-suggestions');

// ── 대화 상태 ─────────────────────────────────
const userAnswers = { why: '', goal: '' };
let chatPhase = 'greeting'; // 'greeting' | 'askWhy' | 'askGoal' | 'free'
let chatStarted = false;
let aiReplyIndex = 0;

// ── view routing ─────────────────────────────
const switchView = (target) => {
  views.forEach((v) => v.classList.toggle('active', v.dataset.view === target));
  if (target === 'chat' && !chatStarted) {
    chatStarted = true;
    startChatFlow();
  }
  if (target === 'notes') {
    renderWiki();
    const ns = root.querySelector('#notes-scroll');
    if (ns) ns.scrollTop = 0;
    initGraph();
    root.querySelector('#graph-toggle-btn')?.classList.add('active');
  }
};

// ── chat 시작 시퀀스 (자연스러운 도입) ────────
function startChatFlow() {
  setTimeout(() => {
    appendMessage('ai', openingPrompts.greeting);
    // 인사 끝나는 시점 = 글자 수 * 100ms
    const greetingDuration = openingPrompts.greeting.length * config.chat.typingMsPerChar;
    setTimeout(() => {
      appendMessage('ai', openingPrompts.askWhy);
      chatPhase = 'askWhy';
      showSuggestions(quickReplies.why);
    }, greetingDuration + 250);
  }, config.chat.seedDelayMs);
}

// ── 메시지 렌더 ─────────────────────────────
function appendMessage(role, text, meta) {
  const wrap = document.createElement('div');
  wrap.className = `msg-wrap ${role}`;
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  if (role === 'ai') {
    [...text].forEach((ch, i) => {
      if (ch === '\n') {
        el.appendChild(document.createElement('br'));
        return;
      }
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

  // AI 메시지 하단에 "위키 저장됨" 메타 배지
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

// ── suggestion chips ─────────────────────────
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

// ── 사용자 발화 ───────────────────────────────
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

  // 'free' — 메모 모드
  setTimeout(() => {
    // 긴 글(인용 포함 가능성) 이면 본문 인용 + 반응 톤으로 응답
    if (text.length > 80) {
      const excerpt = pickExcerpt(text);
      appendMessage('ai', quoteReply({ excerpt }), { savedTo: ['인용'] });
      return;
    }
    const reply = aiReplies[aiReplyIndex % aiReplies.length];
    aiReplyIndex++;
    appendMessage('ai', reply.text, reply.saved ? { savedTo: reply.saved } : undefined);
  }, config.chat.aiReplyDelayMs);
}

// 인용 문단에서 가장 중심에 가까운 한 문장을 발췌 — 데모용 휴리스틱
function pickExcerpt(text) {
  const sentences = text.split(/(?<=[.다요죠임함])\s+/).filter((s) => s.trim().length > 12);
  if (sentences.length === 0) return text.slice(0, 80);
  // 중간쯤 있는 문장이 보통 핵심
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

// ── 액션 라우팅 ─────────────────────────────
root.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  switch (action) {
    case 'open-chat': switchView('chat'); break;
    case 'end-chat': switchView('notes'); break;
    case 'back-home': switchView('home'); break;
    case 'back-notes': switchView('notes'); break;
    case 'open-notes-from-home': switchView('notes'); break;
    case 'toggle-graph': toggleGraph(); break;
  }
});

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

  // 이 노드의 이웃을 깊이 2까지 BFS — 1단계는 강하게, 2단계는 절반 세기로 당김
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
      if (!depth.has(nid)) {
        depth.set(nid, depth.get(cur) + 1);
        queue.push(nid);
      }
    });
  }
  const neighbors = [];
  depth.forEach((d, nid) => {
    if (d === 0) return;
    const node = nodeMap[nid];
    if (!node) return;
    // 1단계 0.06, 2단계 0.025
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

    // 1·2단계 이웃을 거리에 따라 다른 세기로 끌어당김
    neighbors.forEach(({ node, ratio }) => {
      const ox = (nx - origX) * ratio;
      const oy = (ny - origY) * ratio;
      node.el.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px)) scale(1)`;
    });

    redrawEdges(nodeMap, svg);
  };
  const onUp = () => {
    el.classList.remove('dragging');
    // 이웃들 transform 리셋 → CSS spring transition으로 튕기듯 복귀
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
