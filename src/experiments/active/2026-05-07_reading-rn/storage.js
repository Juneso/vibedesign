// localStorage 기반 영속화 (0504-2 services/storage.js와 동등 — 키만 분리)
const KEY_BOOKS  = 'reading-app-rn:books';
const KEY_QUOTES = 'reading-app-rn:quotes';

const read  = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const write = (k, v)  => localStorage.setItem(k, JSON.stringify(v));
const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const listeners = new Set();
const notify = (kind) => listeners.forEach((fn) => { try { fn(kind); } catch {} });
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const Books = {
  all: () => read(KEY_BOOKS, []),
  get: (id) => Books.all().find((b) => b.id === id),
  add: (book) => {
    const list = Books.all();
    const id = book.id || uid();
    if (list.find((b) => b.id === id)) return id;
    list.unshift({ ...book, id, addedAt: Date.now() });
    write(KEY_BOOKS, list); notify('books');
    return id;
  },
  update: (id, patch) => {
    const list = Books.all();
    const idx = list.findIndex((b) => b.id === id);
    if (idx < 0) return;
    list[idx] = { ...list[idx], ...patch };
    write(KEY_BOOKS, list); notify('books');
  },
  remove: (id) => { write(KEY_BOOKS, Books.all().filter((b) => b.id !== id)); notify('books'); },
  seedIfEmpty: (seed) => {
    if (Books.all().length === 0) {
      write(KEY_BOOKS, seed.map((b) => ({ ...b, id: b.id || uid(), addedAt: Date.now() })));
      notify('books');
    }
  },
};

export const Quotes = {
  all: () => read(KEY_QUOTES, []),
  byBook: (bookId) => Quotes.all().filter((q) => q.bookId === bookId),
  add: ({ bookId, text, page = '', memo = '' }) => {
    if (!bookId || !text?.trim()) return null;
    const list = Quotes.all();
    const q = { id: uid(), bookId, text: text.trim(), page, memo, createdAt: Date.now() };
    list.unshift(q);
    write(KEY_QUOTES, list); notify('quotes');
    return q;
  },
  remove: (id) => { write(KEY_QUOTES, Quotes.all().filter((q) => q.id !== id)); notify('quotes'); },
  seedIfEmpty: (seed) => {
    if (Quotes.all().length === 0) {
      write(KEY_QUOTES, seed.map((q) => ({ ...q, id: q.id || uid(), createdAt: q.createdAt || Date.now() })));
      notify('quotes');
    }
  },
};

// 검색은 sources/index.js의 멀티소스 머지를 통해 — 카카오 + 알라딘(승인 후) + Google
// BookHit를 기존 UI 스키마(cover, pageCount 등)로 매핑.
import { searchBooks as searchBooksMulti } from './sources/index.js';

export async function searchBooks(query) {
  const hits = await searchBooksMulti(query);
  return hits.map((h) => ({
    id: h.id,
    title: h.title,
    subtitle: '',
    authors: h.authors || [],
    cover: h.coverUrl || '',
    coverHi: h.coverUrlHi || '',           // 알라딘 letslook 실물사진 (있으면)
    itemId: h.itemId || null,              // 알라딘 ItemLookUp용
    publisher: h.publisher || '',
    publishedDate: h.publishedDate || '',
    pageCount: h.pageCount || 0,
    isbn13: h.isbn13 || '',
    source: h.source,
  }));
}

export const formatRelative = (ts) => {
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
};
