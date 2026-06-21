// ingest 캐시 단독 재생성 — 최신 lib/llm.js ingest 로직으로 4권을 다시 ingest.
// runNudgeV7.mjs 의 loadOrBuildCache 로직만 떼어낸 것(넛지 평가 없음 → 저렴/빠름).
//
// 사용: node eval/buildIngestCache.mjs
//       EVAL_MODEL=gpt-4o node eval/buildIngestCache.mjs   (기본 gpt-4o)
// 결과: golden/ingest-cache.json 덮어쓰기 (앱 시드 위키가 이걸 읽음)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { setLLMTransport, planIngest, interpretProfile } from '../lib/llm.js';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

await loadDotEnvLocal(__dirname);
const EVAL_MODEL = process.env.EVAL_MODEL || 'gpt-4o'; // ingest/profile 모델 (runNudgeV7와 동일 기본값)

const transport = openaiNodeTransport({});
setLLMTransport((args) => transport({ ...args, model: args.model || EVAL_MODEL }));

const seed = JSON.parse(await readFile(resolve(ROOT, 'golden/seed-v1.json'), 'utf-8'));
const CACHE_PATH = resolve(ROOT, 'golden/ingest-cache.json');

function extractPages(ingestOutput, bookId) {
  const pages = [];
  for (const p of (ingestOutput?.patches || [])) {
    if (p.action === 'create' && p.pageDraft) {
      pages.push({
        id: p.pageId || `page-${bookId}-${pages.length}`,
        title: p.pageDraft.title,
        type: p.pageDraft.type,
        bookId,
        body: p.pageDraft.body,
        keyConcepts: p.pageDraft.keyConcepts || [],
      });
    }
  }
  return pages;
}

console.log(`▶ ingest 캐시 재생성 (model=${EVAL_MODEL}, seed=${seed.version})`);
console.log('  B · Profile 해석 중...');
const profileOut = await interpretProfile({ profile: seed.profile });

const cache = { seedVersion: seed.version, derivedKeywords: profileOut?.derivedKeywords || [], books: {} };
for (const book of seed.books) {
  const memoRaw = seed.memos.filter(m => m.bookId === book.id);
  console.log(`  [${book.title}] Ingest 중... (메모 ${memoRaw.length})`);
  const memosNorm = memoRaw.map((m, i) => ({ id: `seed-memo-${book.id}-${i}`, text: m.quote, chapter: m.chapter, myThought: m.myThought }));
  const out = await planIngest({
    memos: memosNorm, book, existingPages: [], contexts: [],
    profile: { background: seed.profile.role, currentWork: seed.profile.currentConcerns || [], interests: seed.profile.interests || [], openQuestions: [] },
  });
  cache.books[book.id] = { pages: extractPages(out, book.id) };
  console.log(`    → ${cache.books[book.id].pages.length}개 페이지`);
}

await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
console.log(`✓ 저장: ${CACHE_PATH}`);
console.log(`  총 ${Object.values(cache.books).reduce((n, b) => n + b.pages.length, 0)}개 페이지 / ${Object.keys(cache.books).length}권`);
