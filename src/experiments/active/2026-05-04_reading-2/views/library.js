// 서재 탭 + 책 추가 모달
import { Books, onChange } from '../services/storage.js';
import { searchBooks } from '../services/books-api.js';

let mounted = false;
let unsub = null;
let searchState = { query: '', loading: false, error: null, results: [] };
let debounceTimer = null;
let searchInputEl = null;

export function init(deps) {
  if (!mounted) {
    mounted = true;
    unsub = onChange((kind) => {
      if (kind !== 'books') return;
      renderLibrary(deps);
      // 검색 모달이 열려있으면 added 상태 갱신
      if (document.querySelector('#book-search-root .search-bar')) renderResults();
    });
  }
  renderLibrary(deps);
}

export function update(deps) {
  renderLibrary(deps);
}

// ── 서재 탭 ─────────────────────────────────
function renderLibrary(deps) {
  const root = document.querySelector('#library-root');
  if (!root) return;
  const books = Books.all();
  const count = books.length;

  const header = `
    <header class="tab-header" style="display:flex; align-items:flex-end; justify-content:space-between;">
      <div>
        <h1 class="tab-title">서재</h1>
        <p class="tab-sub">${count}권 보관 중</p>
      </div>
      <button class="icon-btn" data-action="open-book-search" aria-label="책 추가">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </header>`;

  if (!count) {
    root.innerHTML = `
      ${header}
      <div class="empty-state">
        <p class="empty-state-title">서재가 비어 있어요</p>
        <p class="empty-state-text">읽고 있거나 읽고 싶은 책을 추가해보세요.</p>
        <button class="cta-pill" data-action="open-book-search" style="margin-top:12px;">+ 책 추가</button>
      </div>`;
    return;
  }

  root.innerHTML = `
    ${header}
    <div class="book-grid">
      ${books.map((b) => `
        <div class="book-grid-item" data-book-id="${b.id}" data-action="open-chat">
          <div class="book-cover">${b.cover ? `<img src="${b.cover}" alt="${escapeHtml(b.title)}" />` : ''}</div>
          <p class="bg-title">${escapeHtml(b.title)}</p>
          <p class="bg-author">${escapeHtml((b.authors || []).join(', '))}</p>
        </div>
      `).join('')}
    </div>`;
}

// ── 책 검색 모달 ────────────────────────────
export function openSearch(deps) {
  const root = document.querySelector('#book-search-root');
  if (!root) return;
  searchState = { query: '', loading: false, error: null, results: [] };

  root.innerHTML = `
    <div class="search-bar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="book-search-input" placeholder="제목, 저자로 검색" autocomplete="off" />
    </div>
    <div id="book-search-results"></div>`;

  searchInputEl = root.querySelector('#book-search-input');
  searchInputEl.addEventListener('input', onSearchInput);
  searchInputEl.focus();

  // 결과 영역 click delegation — 추가 버튼/행 클릭
  root.querySelector('#book-search-results').addEventListener('click', onResultsClick);
  renderResults();
}

function onSearchInput(e) {
  const q = e.target.value;
  searchState.query = q;
  clearTimeout(debounceTimer);
  if (!q.trim()) {
    searchState = { query: q, loading: false, error: null, results: [] };
    renderResults();
    return;
  }
  searchState.loading = true;
  searchState.error = null;
  renderResults();
  debounceTimer = setTimeout(async () => {
    const queried = q;
    try {
      const results = await searchBooks(queried);
      if (searchState.query !== queried) return; // stale
      searchState.results = results;
      searchState.loading = false;
      renderResults();
    } catch (err) {
      if (searchState.query !== queried) return;
      searchState.loading = false;
      searchState.error = err.message || '검색 중 오류가 났어요';
      renderResults();
    }
  }, 300);
}

function onResultsClick(e) {
  const li = e.target.closest('.result-item');
  if (!li) return;
  const id = li.dataset.bookId;
  if (!id || li.classList.contains('added')) return;
  const item = searchState.results.find((b) => b.id === id);
  if (!item) return;
  Books.add(item);
  // onChange 리스너가 renderResults 호출
}

function renderResults() {
  const root = document.querySelector('#book-search-results');
  if (!root) return;
  const { query, loading, error, results } = searchState;

  if (loading) {
    root.innerHTML = `<div class="empty-state"><p class="empty-state-text">검색 중…</p></div>`;
    return;
  }
  if (error) {
    root.innerHTML = `<div class="empty-state"><p class="empty-state-title">검색 실패</p><p class="empty-state-text">${escapeHtml(error)}</p></div>`;
    return;
  }
  if (!query.trim()) {
    root.innerHTML = `<div class="empty-state"><p class="empty-state-text">제목이나 저자를 입력해보세요.</p></div>`;
    return;
  }
  if (!results.length) {
    root.innerHTML = `<div class="empty-state"><p class="empty-state-text">"${escapeHtml(query)}"에 대한 결과가 없어요.</p></div>`;
    return;
  }

  root.innerHTML = `
    <ul class="result-list">
      ${results.map((b) => {
        const exists = !!Books.get(b.id);
        const year = (b.publishedDate || '').slice(0, 4);
        const extra = [b.publisher, year, b.pageCount ? `${b.pageCount}쪽` : ''].filter(Boolean).join(' · ');
        return `
          <li class="result-item${exists ? ' added' : ''}" data-book-id="${b.id}">
            <div class="result-cover">${b.cover ? `<img src="${b.cover}" alt="${escapeHtml(b.title)}" />` : ''}</div>
            <div class="result-meta">
              <p class="result-title">${escapeHtml(b.title)}</p>
              <p class="result-author">${escapeHtml((b.authors || []).join(', '))}</p>
              ${extra ? `<p class="result-extra">${escapeHtml(extra)}</p>` : ''}
            </div>
            <button class="result-add"${exists ? ' disabled' : ''}>${exists ? '추가됨' : '추가'}</button>
          </li>`;
      }).join('')}
    </ul>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
