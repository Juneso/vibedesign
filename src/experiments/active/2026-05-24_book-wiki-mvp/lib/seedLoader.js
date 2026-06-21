// DES-182 · 골든셋 시드 로더.
// eval/golden/seed-v1.json 을 읽어 storage state 형태로 변환한다.
// 평가 사이클에서 매 라운드 동일 입력을 보장하기 위한 박제 데이터 어댑터.

import seed from '../eval/golden/seed-v1.json';
import ingestCache from '../eval/golden/ingest-cache.json';
import { uid } from './storage.js';

export function getSeed() {
  return seed;
}

// 본문 마크다운의 각주([^memo:ID] / [^book-meta:ID])에서 출처 칩 복원.
function sourcesFromBody(body = '') {
  const seen = new Set();
  const sources = [];
  const re = /\[\^([a-z-]+):([^\]]+)\]/g;
  let m;
  while ((m = re.exec(body))) {
    const kind = m[1];
    const id = m[2];
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ kind, id });
  }
  return sources;
}

// ingest-cache.json(최종 ingest 산출물) → 앱 wikiPages 형태로 변환.
// 4권의 박제된 위키 페이지를 그대로 반영한다.
export function buildSeedWikiPages(baseTime = Date.parse(seed.createdAt) || Date.now()) {
  const pages = {};
  const books = ingestCache.books || {};
  let i = 0;
  for (const isbn of Object.keys(books)) {
    for (const p of (books[isbn].pages || [])) {
      const id = p.id || uid('page');
      pages[id] = {
        id,
        title: p.title,
        type: p.type,
        body: p.body,
        bookId: p.bookId || isbn,
        keyConcepts: p.keyConcepts || [],
        linkedBooks: p.linkedBooks || [],
        sources: p.sources || sourcesFromBody(p.body),
        // 목록 정렬(updatedAt desc)이 캐시 순서를 보존하도록 미세 오프셋.
        updatedAt: baseTime + i++,
      };
    }
  }
  return pages;
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
      aladin: b.aladin || null,
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
