// 0504 2 — localStorage 기반 영속화
// Books / Quotes를 저장하고 페이지 새로고침 후에도 복원.

const KEY_BOOKS  = 'reading-app-2:books';
const KEY_QUOTES = 'reading-app-2:quotes';

const read  = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
  catch { return fallback; }
};
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── Books ────────────────────────────────────
export const Books = {
  all:    () => read(KEY_BOOKS, []),
  get:    (id) => Books.all().find((b) => b.id === id),
  add:    (book) => {
    const list = Books.all();
    const id = book.id || uid();
    if (list.find((b) => b.id === id)) return id; // 중복 방지
    list.unshift({ ...book, id, addedAt: Date.now() });
    write(KEY_BOOKS, list);
    notify('books');
    return id;
  },
  remove: (id) => {
    write(KEY_BOOKS, Books.all().filter((b) => b.id !== id));
    notify('books');
  },
  seedIfEmpty: (seedBooks) => {
    if (Books.all().length === 0) {
      write(KEY_BOOKS, seedBooks.map((b) => ({ ...b, id: b.id || uid(), addedAt: Date.now() })));
      notify('books');
    }
  },
};

// ── Quotes ───────────────────────────────────
export const Quotes = {
  all:    () => read(KEY_QUOTES, []),
  byBook: (bookId) => Quotes.all().filter((q) => q.bookId === bookId),
  get:    (id) => Quotes.all().find((q) => q.id === id),
  add:    ({ bookId, text, page = '', memo = '' }) => {
    if (!bookId || !text?.trim()) return null;
    const list = Quotes.all();
    const q = { id: uid(), bookId, text: text.trim(), page, memo, createdAt: Date.now() };
    list.unshift(q);
    write(KEY_QUOTES, list);
    notify('quotes');
    return q;
  },
  remove: (id) => {
    write(KEY_QUOTES, Quotes.all().filter((q) => q.id !== id));
    notify('quotes');
  },
  seedIfEmpty: (seedQuotes) => {
    if (Quotes.all().length === 0) {
      write(KEY_QUOTES, seedQuotes.map((q) => ({ ...q, id: q.id || uid(), createdAt: q.createdAt || Date.now() })));
      notify('quotes');
    }
  },
};

// ── pub/sub — 뷰가 변경에 반응 ────────────────
const listeners = new Set();
const notify = (kind) => listeners.forEach((fn) => { try { fn(kind); } catch {} });
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
