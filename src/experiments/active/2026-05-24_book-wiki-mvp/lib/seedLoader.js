// DES-182 · 골든셋 시드 로더.
// eval/golden/seed-v1.json 을 읽어 storage state 형태로 변환한다.
// 평가 사이클에서 매 라운드 동일 입력을 보장하기 위한 박제 데이터 어댑터.

import seed from '../eval/golden/seed-v1.json';
import { uid } from './storage.js';

export function getSeed() {
  return seed;
}

export function buildSeedState() {
  const now = Date.parse(seed.createdAt) || Date.now();
  const books = {};
  for (const b of seed.books) {
    books[b.id] = {
      id: b.id,
      isbn13: b.isbn13,
      title: b.title,
      author: b.author,
      cover: b.cover,
      summary: b.summary,
      toc: b.toc || [],
      genre: b.genre,
      why: '',
      createdAt: now,
    };
  }
  const memos = {};
  for (const m of seed.memos) {
    const id = uid('memo');
    memos[id] = {
      id,
      bookId: m.bookId,
      text: m.quote,
      chapter: m.chapter || '',
      myThought: m.myThought || '',
      source: { kind: 'memo', page: m.page },
      createdAt: now,
    };
  }
  const profile = seed.profile || {};
  return {
    books,
    memos,
    profile: {
      background: profile.role || '',
      currentWork: profile.currentConcerns || [],
      interests: profile.interests || [],
      openQuestions: [],
    },
  };
}

export function seedSummary() {
  return {
    version: seed.version,
    bookCount: seed.books.length,
    memoCount: seed.memos.length,
    memosPerBook: Object.fromEntries(
      seed.books.map(b => [b.title, seed.memos.filter(m => m.bookId === b.id).length])
    ),
  };
}
