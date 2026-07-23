// 옵시디언 실 발췌 책들을 V8 위계 인제스트 전체(Phase 1 → 1.5 → 2)로 태운다.
// buildObsidian50.mjs 는 planIngest(Phase 1)만 불러 위계가 생기지 않았다 —
// 테마 노드는 Phase 2(테마 생성 + critic)에서만 만들어지므로 runHierIngest 를 거쳐야 한다.
//
// 사용: node eval/runHierObsidian.mjs            (상위 10권, 이미 있는 run 은 스킵)
//        LIMIT=3 node eval/runHierObsidian.mjs   (앞 3권만)
//        FORCE=1 node eval/runHierObsidian.mjs   (기존 run 무시하고 재실행)
// 결과: runs/obsidian-hier-v8-{N}.json + .md  (시리즈 obsidian-hier-v8)
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { runHierIngest, serializeTree } from './lib/hierEngine.mjs';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);

const VAULT = '/Users/junseo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books';
const RUNS = resolve(__dir, 'runs');
// 모델 비교처럼 결과를 나란히 남겨야 할 때 접두사를 바꾼다(시리즈가 갈린다).
// 예: RUN_PREFIX=obsidian-hier-v8-4o- → 시리즈 obsidian-hier-v8-4o
const PREFIX = process.env.RUN_PREFIX || 'obsidian-hier-v8-';
const LIMIT = Number(process.env.LIMIT || 10);
const FORCE = !!process.env.FORCE;
const MAX_MEMOS = Number(process.env.MAX_MEMOS || 14);

// runHierStability.mjs 와 동일한 모델 배선 (V8 기존 run 과 조건을 맞춘다)
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const INGEST_MODEL = process.env.INGEST_MODEL || 'gpt-4o';
const KEY = process.env.OPENAI_API_KEY;
const llm = openaiNodeTransport({ model: MODEL });

const { planIngest, setLLMTransport } = await import('../lib/llm.js');
setLLMTransport(openaiNodeTransport({ model: INGEST_MODEL }));
const planIngestFn = planIngest;

async function embedFn(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || 'embed fail');
  return d.data[0].embedding;
}

// buildObsidian50.mjs 와 동일한 파서 — 입력을 같게 두어야 위계 유무만 비교된다
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
    .map((m) => ({ ...m, text: m.text.replace(/\n{3,}/g, '\n\n').trim() }))
    .filter((m) => m.text.length >= 30)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, MAX_MEMOS);
  return result.map((m, i) => ({ id: `obs-memo-${bookId}-${i}`, p: Number(m.page) || i + 1, text: m.text.slice(0, 1200), chapter: `p.${m.page}` }));
}

const BOOKS = JSON.parse(await readFile(resolve(__dir, 'obsidian-50-list.json'), 'utf-8')).slice(0, LIMIT);

// 알라딘 리치데이터 (fetchObsidianAladin.mjs 산출물). V8 테마의 book 축 앵커 ground truth —
// 이게 없으면 테마가 reader 축에만 의존해 성기게 묶인다.
const META_PATH = resolve(__dir, 'golden/obsidian-books-meta.json');
const META = existsSync(META_PATH) ? JSON.parse(await readFile(META_PATH, 'utf-8')) : {};
if (!Object.keys(META).length) console.log('⚠ 리치데이터 없음 — 먼저 node eval/fetchObsidianAladin.mjs 실행 권장');

console.log(`[v8] hier=${MODEL} · planIngest=${INGEST_MODEL} · ${BOOKS.length}권 · 리치데이터 ${Object.keys(META).length}권`);

let done = 0, failed = 0;
for (const [i, b] of BOOKS.entries()) {
  const base = resolve(RUNS, `${PREFIX}${i + 1}`);
  if (!FORCE && existsSync(`${base}.json`)) { console.log(`  [${i + 1}/${BOOKS.length}] ${b.title} — 스킵(이미 있음)`); continue; }

  const raw = await readFile(resolve(VAULT, b.file), 'utf-8');
  const memos = parseMemos(raw, b.id);
  // 알라딘 리치데이터 주입 — 없으면 빈 값으로 폴백(테마가 reader 축에만 의존)
  const m = META[b.id] || {};
  const book = {
    title: b.title,
    author: m.author || b.author,
    category: m.category || b.genre,
    toc: m.toc || [],
    summary: m.summary || '',
    aladin: m.aladin || {},
  };
  const richChars = Object.values(book.aladin).join('').length;

  const t0 = Date.now();
  try {
    console.log(`  [${i + 1}/${BOOKS.length}] ${b.title} — 메모 ${memos.length}개 · 리치데이터 ${richChars}자 · 목차 ${book.toc.length}줄, V8 실행...`);
    const r = await runHierIngest({
      book, memos, llm, embedFn, variant: 'v8', planIngestFn,
      onProgress: (msg) => process.stdout.write(`      ${msg}\r`),
    });
    const tree = serializeTree(r.nodes, r.rootId);
    const secs = Math.round((Date.now() - t0) / 1000);
    const levels = tree.nodes.reduce((a, n) => { a[n.level] = (a[n.level] || 0) + 1; return a; }, {});
    const themes = tree.nodes.filter((n) => n.level === 1).length;

    await writeFile(`${base}.json`, JSON.stringify({
      label: b.title,
      kind: 'hier-ingest',
      variant: 'v8',
      source: '옵시디언 200 Literature/210 Books',
      hierModel: MODEL,
      ingestModel: INGEST_MODEL,
      book: { title: b.title, author: book.author, category: book.category },
      rich: { chars: richChars, tocLines: book.toc.length, isbn: m.isbn || null, matchedTitle: m.matchedTitle || null },
      nMemos: memos.length,
      stats: r.stats,
      levels,
      secs,
      tree,
      log: r.log,
    }, null, 2) + '\n', 'utf-8');

    let md = `# ${b.title} — V8 위계 인제스트\n\n`;
    md += `- 소스: 옵시디언 실 발췌 · 메모 ${memos.length}개\n`;
    md += `- 모델: 위계 ${MODEL} · planIngest ${INGEST_MODEL}\n`;
    md += `- 결과: **테마 ${themes}개 · 노드 ${tree.nodes.length}개** (${secs}초)\n`;
    md += `- 레벨 분포: ${Object.entries(levels).map(([l, c]) => `L${l} ${c}개`).join(' · ')}\n\n`;
    md += `## 트리\n\n노드를 클릭하면 개념·테마 설명이 열린다.\n\n`;
    await writeFile(`${base}.md`, md, 'utf-8');

    console.log(`      → 테마 ${themes}개 · 노드 ${tree.nodes.length}개 · 레벨 ${JSON.stringify(levels)} (${secs}초)`);
    done++;
  } catch (e) {
    failed++;
    console.log(`      ✗ 실패: ${e.message}`);
  }
}
console.log(`\n✓ 완료 ${done}권 · 실패 ${failed}권`);
