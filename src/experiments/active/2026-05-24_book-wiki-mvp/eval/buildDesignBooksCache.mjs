// 옵시디언 독서노트(210 Books)에서 디자인 책 4권을 읽어 ingest → 위키 캐시 생성.
// 골든 시드와 별개로 "기존에 추가"되는 실제 책 데이터.
//
// 사용: DRY_RUN=1 node eval/buildDesignBooksCache.mjs   (파싱만, LLM 호출 없음)
//       node eval/buildDesignBooksCache.mjs              (실제 ingest, gpt-4o)
// 결과: golden/design-books-cache.json
//   { books: { [bookId]: { id, title, author, pages: [...] } } }

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { setLLMTransport, planIngest, interpretProfile } from '../lib/llm.js';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const VAULT = '/Users/junseo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books';
const DRY_RUN = !!process.env.DRY_RUN;
const MAX_MEMOS = Number(process.env.MAX_MEMOS || 14);

// 대상 4권 — 파일명 / 표시 제목 / 저자 / bookId
const BOOKS = [
  { file: '디자인과 인간 심리_210221_163647.md', title: '디자인과 인간 심리', author: '도널드 노먼', id: 'obs-design-human-psych' },
  { file: '디자인 미학_201207_200248.md',          title: '디자인 미학',        author: '글렌 파슨스',  id: 'obs-design-aesthetics' },
  { file: '욕망의 사물, 디자인의 사회사_210325_162228.md', title: '욕망의 사물, 디자인의 사회사', author: '에이드리언 포티', id: 'obs-objects-of-desire' },
  { file: '미래세상의 디자인_230422_140830.md',    title: '미래세상의 디자인',  author: '도널드 노먼',  id: 'obs-design-future' },
];

// 자유형 독서노트 → 메모 배열.
// 1차: "12." 같은 페이지 번호 마커로 분할. 부족하면 빈 줄 문단 분할로 폴백.
function parseMemos(raw, bookId) {
  const lines = raw.split(/\r?\n/);
  const memos = [];
  let cur = null;
  const pageMarker = /^\s*(\d{1,4})\s*\.\s*(.*)$/; // "23." 또는 "23. 문장"
  for (const line of lines) {
    const m = line.match(pageMarker);
    // 마커로 인정: 숫자.뒤가 비었거나(다음 줄이 본문) / 숫자. 뒤 짧은 제목
    if (m && (m[2].trim() === '' || m[2].length < 60)) {
      if (cur && cur.text.trim()) memos.push(cur);
      cur = { page: m[1], text: m[2].trim() ? m[2].trim() + '\n' : '' };
    } else if (cur) {
      cur.text += line + '\n';
    }
  }
  if (cur && cur.text.trim()) memos.push(cur);

  let result = memos;
  // 폴백: 마커가 거의 없으면 문단 분할
  if (result.length < 3) {
    result = raw.split(/\n\s*\n/).map((p, i) => ({ page: String(i + 1), text: p.trim() }));
  }
  // 정제: 너무 짧은 것 제거, 길이순 상위 MAX_MEMOS
  result = result
    .map(m => ({ ...m, text: m.text.replace(/\n{3,}/g, '\n\n').trim() }))
    .filter(m => m.text.length >= 30)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, MAX_MEMOS);
  // memo 형태로
  return result.map((m, i) => ({
    id: `obs-memo-${bookId}-${i}`,
    text: m.text.slice(0, 1200), // 과도한 길이 컷
    chapter: `p.${m.page}`,
    myThought: '',
  }));
}

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

// ── 노트 로드 + 파싱 ──
const parsed = [];
for (const b of BOOKS) {
  const raw = await readFile(resolve(VAULT, b.file), 'utf-8');
  const memos = parseMemos(raw, b.id);
  parsed.push({ ...b, memos });
  console.log(`[${b.title}] 노트 ${raw.length}자 → 메모 ${memos.length}개 (chapters: ${memos.slice(0,5).map(m=>m.chapter).join(', ')}...)`);
}

if (DRY_RUN) {
  console.log('\n── DRY_RUN: 첫 책 메모 미리보기 ──');
  for (const m of parsed[0].memos.slice(0, 3)) {
    console.log(`\n• ${m.chapter} (${m.text.length}자)\n${m.text.slice(0, 200)}...`);
  }
  console.log('\n(LLM 호출 안 함. 실제 ingest는 DRY_RUN 빼고 실행)');
  process.exit(0);
}

// ── ingest 실행 ──
await loadDotEnvLocal(__dirname);
const EVAL_MODEL = process.env.EVAL_MODEL || 'gpt-4o';
const transport = openaiNodeTransport({});
setLLMTransport((args) => transport({ ...args, model: args.model || EVAL_MODEL }));

const seed = JSON.parse(await readFile(resolve(ROOT, 'golden/seed-v1.json'), 'utf-8'));
const profile = {
  background: seed.profile.role,
  currentWork: seed.profile.currentConcerns || [],
  interests: seed.profile.interests || [],
  openQuestions: [],
};
console.log(`\n▶ 디자인 책 4권 ingest (model=${EVAL_MODEL})`);

const out = { books: {} };
for (const b of parsed) {
  console.log(`  [${b.title}] Ingest 중... (메모 ${b.memos.length})`);
  const book = { id: b.id, title: b.title, author: b.author, summary: '', toc: [], genre: '디자인' };
  const ing = await planIngest({ memos: b.memos, book, existingPages: [], contexts: [], profile });
  out.books[b.id] = { id: b.id, title: b.title, author: b.author, pages: extractPages(ing, b.id) };
  console.log(`    → ${out.books[b.id].pages.length}개 페이지`);
}

const OUT_PATH = resolve(ROOT, 'golden/design-books-cache.json');
await writeFile(OUT_PATH, JSON.stringify(out, null, 2), 'utf-8');
console.log(`✓ 저장: ${OUT_PATH}`);
console.log(`  총 ${Object.values(out.books).reduce((n, b) => n + b.pages.length, 0)}개 페이지 / ${Object.keys(out.books).length}권`);
