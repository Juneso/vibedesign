// 홈 탭 — 지금 읽는 책 / 최근 인용 / 서재 가로스크롤
import { Books, Quotes, onChange } from '../services/storage.js';

let mounted = false;
let unsub = null;

export function init(deps) {
  if (mounted) { render(deps); return; }
  mounted = true;
  unsub = onChange(() => render(deps));
  render(deps);
}

export function update(deps) {
  if (mounted) render(deps);
}

function render({ openChat, openNotes, openQuoteAdd, switchTab }) {
  renderCurrent(openChat, openNotes);
  renderQuotes();
  renderShelf(switchTab);
}

function renderCurrent(openChat, openNotes) {
  const root = document.querySelector('#current-book');
  if (!root) return;
  const books = Books.all();
  const cur = books.find((b) => b.isCurrent) || books[0];
  if (!cur) {
    root.innerHTML = `
      <div class="empty-state" style="text-align:left; padding:0">
        <p class="empty-state-title">아직 등록된 책이 없어요</p>
        <p class="empty-state-text">서재 탭에서 책을 추가해보세요.</p>
      </div>`;
    return;
  }
  root.innerHTML = `
    <div class="book-cover">
      ${cur.cover ? `<img src="${cur.cover}" alt="${escapeHtml(cur.title)}" />` : ''}
    </div>
    <div class="current-book-meta">
      <h3 class="current-book-title">${escapeHtml(cur.title)}</h3>
      <p class="current-book-author">${escapeHtml((cur.authors || []).join(', '))}</p>
      <div class="current-book-actions">
        <button class="cta-pill" data-action="open-chat" data-book-id="${cur.id}">메모 시작</button>
        <button class="cta-pill cta-pill--ghost" data-action="open-notes-from-home" data-book-id="${cur.id}">위키 보기</button>
      </div>
    </div>
  `;
}

function renderQuotes() {
  const root = document.querySelector('#recent-quotes');
  if (!root) return;
  const quotes = Quotes.all().slice(0, 5);
  if (!quotes.length) {
    root.outerHTML = `
      <ul class="recent-quotes" id="recent-quotes">
        <li class="empty-state" style="border-bottom:none">
          <p class="empty-state-title">아직 저장된 인용이 없어요</p>
          <p class="empty-state-text">아래 + 버튼으로 마음에 드는 문장을 저장해보세요.</p>
        </li>
      </ul>`;
    return;
  }
  root.innerHTML = quotes.map((q) => {
    const book = Books.get(q.bookId);
    return `
      <li class="recent-quote-item">
        <p class="rq-text">${escapeHtml(q.text)}</p>
        <div class="rq-meta">
          <span class="rq-book">${escapeHtml(book?.title || '책 미지정')}</span>
          ${q.page ? `<span>p.${escapeHtml(q.page)}</span>` : ''}
          <span>${formatRelative(q.createdAt)}</span>
        </div>
      </li>
    `;
  }).join('');
}

function renderShelf(switchTab) {
  const root = document.querySelector('#home-shelf-row');
  if (!root) return;
  const books = Books.all();
  if (books.length <= 1) {
    root.innerHTML = `
      <button class="shelf-item" data-tab="library" style="display:flex; align-items:center; justify-content:center; width:120px; height:124px; border-radius:6px; border:1px dashed var(--hairline); color:var(--text-tertiary); background:transparent; font-size:12px; font-family:inherit;">
        + 책 추가
      </button>`;
    return;
  }
  root.innerHTML = books.map((b) => `
    <div class="shelf-item" data-book-id="${b.id}" data-action="open-chat">
      <div class="book-cover">${b.cover ? `<img src="${b.cover}" alt="${escapeHtml(b.title)}" />` : ''}</div>
      <p class="shelf-title">${escapeHtml(b.title)}</p>
      <p class="shelf-author">${escapeHtml((b.authors || []).join(', '))}</p>
    </div>
  `).join('');
}

// utils
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function formatRelative(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}
