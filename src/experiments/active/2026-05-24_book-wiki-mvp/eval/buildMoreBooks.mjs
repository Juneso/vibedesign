// 추가 4권(저공비행/욕망의사물/공정하다는착각/진리와자유의길) ingest → 위키 캐시.
// 사용: DRY_RUN=1 node eval/buildMoreBooks.mjs  (파싱만)  /  node eval/buildMoreBooks.mjs (실제)
// 결과: golden/more-books-cache.json
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { setLLMTransport, planIngest } from '../lib/llm.js';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const VAULT = '/Users/1522684/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books';
const DRY_RUN = !!process.env.DRY_RUN;
const MAX_MEMOS = Number(process.env.MAX_MEMOS || 14);

const BOOKS = [
  { file: '저공비행_230331_105044.md', title: '저공비행', author: '하라 켄야', id: 'obs-low-altitude', genre: '디자인' },
  { file: '욕망의 사물, 디자인의 사회사_210325_162228.md', title: '욕망의 사물, 디자인의 사회사', author: '에이드리언 포티', id: 'obs-objects-of-desire', genre: '디자인' },
  { file: '공정하다는 착각_210520_203027.md', title: '공정하다는 착각', author: '마이클 샌델', id: 'obs-tyranny-merit', genre: '사회/정치철학' },
  { file: '진리와 자유의 길_210717_130909.md', title: '진리와 자유의 길', author: '미상', id: 'obs-truth-freedom', genre: '철학/종교' },
];

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

const parsed = [];
for (const b of BOOKS) {
  const raw = await readFile(resolve(VAULT, b.file), 'utf-8');
  const memos = parseMemos(raw, b.id);
  parsed.push({ ...b, memos });
  console.log(`[${b.title}] ${raw.length}자 → 메모 ${memos.length}개`);
}

if (DRY_RUN) {
  for (const m of parsed[0].memos.slice(0, 3)) console.log(`\n• ${m.chapter}\n${m.text.slice(0, 180)}...`);
  process.exit(0);
}

await loadDotEnvLocal(__dirname);
const EVAL_MODEL = process.env.EVAL_MODEL || 'gpt-4o';
const transport = openaiNodeTransport({});
setLLMTransport((args) => transport({ ...args, model: args.model || EVAL_MODEL }));

const seed = JSON.parse(await readFile(resolve(ROOT, 'golden/seed-v1.json'), 'utf-8'));
const profile = { background: seed.profile.role, currentWork: seed.profile.currentConcerns || [], interests: seed.profile.interests || [], openQuestions: [] };

const out = { books: {} };
for (const b of parsed) {
  console.log(`  [${b.title}] ingest... (메모 ${b.memos.length})`);
  const book = { id: b.id, title: b.title, author: b.author, summary: '', toc: [], genre: b.genre };
  const ing = await planIngest({ memos: b.memos, book, existingPages: [], contexts: [], profile });
  out.books[b.id] = { id: b.id, title: b.title, author: b.author, pages: extractPages(ing, b.id) };
  console.log(`    → ${out.books[b.id].pages.length}개 페이지`);
}
await writeFile(resolve(ROOT, 'golden/more-books-cache.json'), JSON.stringify(out, null, 2), 'utf-8');
console.log(`✓ 총 ${Object.values(out.books).reduce((n, b) => n + b.pages.length, 0)}페이지 / ${Object.keys(out.books).length}권`);
