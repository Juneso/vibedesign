// 인용(quote) 추가 모달 — owned by quote-eng
// Renders form into #quote-add-root; controls #quote-save-btn in modal header.
import { Books, Quotes } from '../services/storage.js';

const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

// Module-scoped state so we can rebind cleanly across open() calls.
let currentBookId = null;
let currentDeps   = null;
let saveHandler   = null;
let pickSheetEl   = null;

export function init(_deps) {
  // No persistent setup needed; everything is wired in open().
}

export function open(deps) {
  currentDeps = deps || {};
  const root  = document.querySelector('#quote-add-root');
  const saveBtn = document.getElementById('quote-save-btn');
  if (!root) return;

  const books = Books.all();

  // Empty state: no books at all.
  if (!books.length) {
    root.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-title">아직 등록된 책이 없어요</p>
        <p class="empty-state-desc">먼저 라이브러리에 책을 추가한 뒤 인용을 남겨보세요.</p>
      </div>
    `;
    if (saveBtn) {
      saveBtn.disabled = true;
      detachSave(saveBtn);
    }
    return;
  }

  // Pick default book.
  currentBookId = (deps?.defaultBookId && books.find((b) => b.id === deps.defaultBookId))
    ? deps.defaultBookId
    : books[0].id;

  // Render form shell.
  root.innerHTML = `
    <div class="quote-form">
      <div class="field">
        <label class="field-label">책</label>
        <button class="book-selector" type="button" data-book-selector>
          ${renderBookSelectorInner(currentBookId)}
        </button>
      </div>

      <div class="field">
        <label class="field-label">인용</label>
        <textarea class="input-base quote-form-text" data-quote-text
          placeholder="책의 한 문장을 그대로 옮겨 적어보세요" rows="5"></textarea>
      </div>

      <div class="field">
        <label class="field-label">페이지 (선택)</label>
        <input class="input-base" type="text" inputmode="numeric"
          data-quote-page placeholder="예: 142" />
      </div>

      <div class="field">
        <label class="field-label">내 메모 (선택)</label>
        <textarea class="input-base" data-quote-memo
          placeholder="이 문장이 마음에 걸린 이유를 짧게 적어보세요" rows="3"></textarea>
      </div>
    </div>
  `;

  const selectorBtn = root.querySelector('[data-book-selector]');
  const textEl      = root.querySelector('[data-quote-text]');
  const pageEl      = root.querySelector('[data-quote-page]');
  const memoEl      = root.querySelector('[data-quote-memo]');

  selectorBtn?.addEventListener('click', () => openBookPickSheet());

  const recompute = () => updateSaveDisabled(saveBtn, textEl);
  textEl?.addEventListener('input', recompute);
  pageEl?.addEventListener('input', recompute);
  memoEl?.addEventListener('input', recompute);

  // Rebind save handler cleanly.
  if (saveBtn) {
    detachSave(saveBtn);
    saveHandler = () => handleSave({ saveBtn, textEl, pageEl, memoEl });
    saveBtn.addEventListener('click', saveHandler);
    saveBtn.classList.remove('is-success');
    saveBtn.textContent = '저장';
    updateSaveDisabled(saveBtn, textEl);
  }
}

function detachSave(saveBtn) {
  if (saveHandler) {
    saveBtn.removeEventListener('click', saveHandler);
    saveHandler = null;
  }
}

function updateSaveDisabled(saveBtn, textEl) {
  if (!saveBtn) return;
  const ok = !!currentBookId && !!textEl?.value.trim();
  saveBtn.disabled = !ok;
}

function handleSave({ saveBtn, textEl, pageEl, memoEl }) {
  if (!currentBookId || !textEl?.value.trim()) return;
  const saved = Quotes.add({
    bookId: currentBookId,
    text:   textEl.value,
    page:   pageEl?.value.trim() || '',
    memo:   memoEl?.value.trim() || '',
  });
  if (!saved) return;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.classList.add('is-success');
    saveBtn.textContent = '저장됨';
  }
  setTimeout(() => {
    try { currentDeps?.closeModal?.(); } catch {}
  }, 400);
}

// ── Book selector inner content ─────────────────
function renderBookSelectorInner(bookId) {
  const book = Books.get(bookId);
  if (!book) {
    return `
      <div class="book-selector-meta">
        <p class="bs-title">책을 선택하세요</p>
      </div>
      <svg class="book-selector-chev" width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }
  return `
    ${renderCover(book)}
    <div class="book-selector-meta">
      <p class="bs-title">${escapeHtml(book.title || '')}</p>
      <p class="bs-author">${escapeHtml((book.authors || []).join(', '))}</p>
    </div>
    <svg class="book-selector-chev" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

function renderCover(book) {
  if (book?.cover) {
    return `<div class="book-cover"><img src="${escapeHtml(book.cover)}" alt="" /></div>`;
  }
  return `<div class="book-cover"></div>`;
}

// ── Bottom sheet for picking a book ─────────────
function openBookPickSheet() {
  closeBookPickSheet();
  const host = document.querySelector('.canvas-content') || document.body;
  const books = Books.all();

  const sheet = document.createElement('div');
  sheet.className = 'book-pick-sheet open';
  sheet.style.position = 'fixed';
  sheet.innerHTML = `
    <div class="book-pick-panel">
      <div class="bps-handle"></div>
      <h3 class="bps-title">책 선택</h3>
      <div class="bps-list">
        ${books.map((b) => `
          <button class="book-selector" type="button" data-pick-id="${escapeHtml(b.id)}">
            ${renderCover(b)}
            <div class="book-selector-meta">
              <p class="bs-title">${escapeHtml(b.title || '')}</p>
              <p class="bs-author">${escapeHtml((b.authors || []).join(', '))}</p>
            </div>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  // Backdrop click (anywhere outside the panel) closes the sheet.
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) closeBookPickSheet();
  });

  sheet.querySelectorAll('[data-pick-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-pick-id');
      if (id) selectBook(id);
      closeBookPickSheet();
    });
  });

  host.appendChild(sheet);
  pickSheetEl = sheet;
}

function closeBookPickSheet() {
  if (pickSheetEl?.parentNode) pickSheetEl.parentNode.removeChild(pickSheetEl);
  pickSheetEl = null;
}

function selectBook(bookId) {
  currentBookId = bookId;
  const root = document.querySelector('#quote-add-root');
  const selectorBtn = root?.querySelector('[data-book-selector]');
  if (selectorBtn) selectorBtn.innerHTML = renderBookSelectorInner(bookId);
  const saveBtn = document.getElementById('quote-save-btn');
  const textEl  = root?.querySelector('[data-quote-text]');
  updateSaveDisabled(saveBtn, textEl);
}
