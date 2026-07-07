// 독서 데이터셋 50권 확장 (BKT-307) — 옵시디언 210 Books 전수 파싱 → golden/books50-memos.json
// 실행: node eval/buildBooks50.mjs
// 포함 기준: 페이지 표기 발췌 ≥5개. 목차·저자 메타는 후속(알라딘 수집) — 이 파일은 메모 본체.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const VAULT = process.env.HOME + '/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books';
const MIN_MEMOS = Number(process.env.MIN_MEMOS || 5);

function parseMd(raw) {
  const memos = []; let cur = null;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim(); if (!t) continue;
    if (/^\dㅣ/.test(t)) continue;
    const m = t.match(/^(\d{1,4})\.\s*(.*)$/);
    if (m) { cur = { p: Number(m[1]), lines: [] }; memos.push(cur); if (m[2] && m[2].length >= 25) cur.lines.push(m[2]); }
    else if (cur) cur.lines.push(t);
  }
  return memos.map((x) => ({ p: x.p, text: x.lines.join(' ').trim() })).filter((x) => x.text.length > 40);
}

const books = [];
for (const file of (await readdir(VAULT)).filter((f) => f.endsWith('.md')).sort()) {
  let raw; try { raw = await readFile(resolve(VAULT, file), 'utf-8'); } catch { continue; }
  const memos = parseMd(raw);
  if (memos.length < MIN_MEMOS) continue;
  // 번호 매긴 생각 노트(1. 2. 3. …) 오인 방지 — 책 발췌라면 쪽수가 커진다
  if (Math.max(...memos.map((m) => m.p)) < 30) continue;
  const title = file.replace(/_\d{6}.*\.md$/, '').replace(/\.md$/, '').trim();
  const id = 'b50-' + title.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase().replace(/^-|-$/g, '');
  const pages = memos.map((m) => m.p);
  books.push({
    id, title, file, memoCount: memos.length,
    pagesMonotonic: pages.every((p, i) => i === 0 || pages[i - 1] <= p),
    memos,
  });
}
const out = {
  version: 'books50-v1', builtAt: '2026-07-07',
  note: 'BKT-307 데이터셋 확장 — Junseo 실제 독서 발췌(옵시디언 210 Books 원문 그대로, AI 생성 없음). 책 메타(저자·목차·알라딘)는 후속 수집.',
  bookCount: books.length, memoTotal: books.reduce((s, b) => s + b.memoCount, 0),
  books,
};
await writeFile(resolve(__dir, 'golden/books50-memos.json'), JSON.stringify(out, null, 2));
console.log(`books50-memos.json: ${out.bookCount}권 · 메모 ${out.memoTotal}개`);
for (const b of books) console.log(`  ${String(b.memoCount).padStart(3)}개 ${b.pagesMonotonic ? ' ' : '~'} ${b.title}`);
