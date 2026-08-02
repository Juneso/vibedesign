// 옵시디언 210 Books 상위 50권 ingest → 위키 캐시.
// 책 목록은 obsidian-50-list.json (scanBooks 로 자동 선정, memos>=3 상위 50).
// 사용: DRY_RUN=1 node eval/buildObsidian50.mjs   (파싱만, API 호출 없음)
//        node eval/buildObsidian50.mjs            (실제 ingest, gpt-4o)
// 결과: golden/obsidian-50-cache.json  (권별 진행 저장 → 중단 후 재개 가능)
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { setLLMTransport, planIngest } from '../lib/llm.js';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const VAULT = '/Users/junseo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books';
const DRY_RUN = !!process.env.DRY_RUN;
const MAX_MEMOS = Number(process.env.MAX_MEMOS || 14);
const OUT_PATH = resolve(ROOT, 'golden/obsidian-50-cache.json');

const LIMIT = Number(process.env.LIMIT || 0);
let BOOKS = JSON.parse(await readFile(resolve(ROOT, 'obsidian-50-list.json'), 'utf-8'));
if (LIMIT > 0) BOOKS = BOOKS.slice(0, LIMIT);

// buildMoreBooks.mjs 와 동일한 parseMemos
function parseMemos(raw, bookId) {
  const lines = raw.split(/\r?\n/);
  const memos = [];
  let cur = null;
  const pageMarker = /^\s*(\d{1,4})\s*\.\s*(.*)$/;
  for (const line of lines) {
    const m = line.match(pageMarker);
    if (m && (m[2].trim() === '' || m[2].length < 60)) {
      if (cur && cur.text.trim()) memos.push(cur);
      cur = { page: m[1], text: m[2].trim() ? m[2].trim() + '\n' : '' };
    } else if (cur) {
      cur.text += line + '\n';
    }
  }
  if (cur && cur.text.trim()) memos.push(cur);
  let result = memos;
  if (result.length < 3) result = raw.split(/\n\s*\n/).map((p, i) => ({ page: String(i + 1), text: p.trim() }));
  result = result
    .map(m => ({ ...m, text: m.text.replace(/\n{3,}/g, '\n\n').trim() }))
    .filter(m => m.text.length >= 30)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, MAX_MEMOS);
  return result.map((m, i) => ({ id: `obs-memo-${bookId}-${i}`, text: m.text.slice(0, 1200), chapter: `p.${m.page}`, myThought: '' }));
}

function extractPages(ingestOutput, bookId) {
  const pages = [];
  for (const p of (ingestOutput?.patches || [])) {
    if (p.action === 'create' && p.pageDraft) {
      pages.push({ id: p.pageId || `page-${bookId}-${pages.length}`, title: p.pageDraft.title, type: p.pageDraft.type, bookId, body: p.pageDraft.body, keyConcepts: p.pageDraft.keyConcepts || [] });
    }
  }
  return pages;
}

// 파싱
const parsed = [];
for (const b of BOOKS) {
  const raw = await readFile(resolve(VAULT, b.file), 'utf-8');
  const memos = parseMemos(raw, b.id);
  parsed.push({ ...b, memos });
  console.log(`[${b.title}] ${raw.length}자 → 메모 ${memos.length}개`);
}

if (DRY_RUN) {
  console.log(`\nDRY_RUN: ${parsed.length}권 파싱 완료. 총 메모 ${parsed.reduce((n, b) => n + b.memos.length, 0)}개`);
  process.exit(0);
}

await loadDotEnvLocal(__dirname);
const EVAL_MODEL = process.env.EVAL_MODEL || 'gpt-4o';
const transport = openaiNodeTransport({});
setLLMTransport((args) => transport({ ...args, model: args.model || EVAL_MODEL }));

const seed = JSON.parse(await readFile(resolve(ROOT, 'golden/seed-v1.json'), 'utf-8'));
const profile = { background: seed.profile.role, currentWork: seed.profile.currentConcerns || [], interests: seed.profile.interests || [], openQuestions: [] };

// 재개: 기존 캐시 로드
const out = existsSync(OUT_PATH) ? JSON.parse(await readFile(OUT_PATH, 'utf-8')) : { books: {} };
if (!out.books) out.books = {};

let done = 0, failed = 0;
for (const b of parsed) {
  if (out.books[b.id]?.pages?.length) { console.log(`  [${b.title}] 스킵(캐시됨 ${out.books[b.id].pages.length}p)`); continue; }
  try {
    console.log(`  [${++done}/${parsed.length}] ${b.title} ingest... (메모 ${b.memos.length})`);
    const book = { id: b.id, title: b.title, author: b.author, summary: '', toc: [], genre: b.genre };
    const ing = await planIngest({ memos: b.memos, book, existingPages: [], contexts: [], profile });
    out.books[b.id] = { id: b.id, title: b.title, author: b.author, pages: extractPages(ing, b.id) };
    console.log(`    → ${out.books[b.id].pages.length}개 페이지`);
  } catch (e) {
    failed++;
    console.log(`    ✗ 실패: ${e.message}`);
  }
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2), 'utf-8'); // 권마다 저장
}
console.log(`\n✓ 총 ${Object.values(out.books).reduce((n, b) => n + (b.pages?.length || 0), 0)}페이지 / ${Object.keys(out.books).length}권 (실패 ${failed})`);
