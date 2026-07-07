// v9 배치 — 데이터셋 56권 전수 인제스트 (BKT-307 × BKT-378)
// 실행: node eval/runHierV9Batch.mjs [권수제한]
// 각 책: 폴백 모드(목차 없음 — 평면 + v9.1 상향 승격 + 오버레이) · 도착 순서 2종(원순서/시드7)
// 목적: lift·병합·승격이 4권 밖 장르(소설·사회과학·미술사·자기계발)에서도 일반화되는지 + 안정성 분포
// 출력: eval/runs/hier-v9-batch.md + hier-v9-batch.json

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
import { createEngine } from './lib/hierV9Engine.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const KEY = process.env.OPENAI_API_KEY;
const llm = openaiNodeTransport({ model: MODEL });
async function embed(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || 'embed fail');
  return d.data[0].embedding;
}

const LIMIT = Number(process.argv[2] || 0);
const DATA = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
const books = LIMIT ? DATA.books.slice(0, LIMIT) : DATA.books;
console.log(`[배치] ${books.length}권 · 메모 ${books.reduce((s, b) => s + b.memoCount, 0)}개 · 모델 ${MODEL}`);

function mulberry32(seed) { return function () { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffled(arr, seed) { const a = arr.slice(); const rnd = mulberry32(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
async function pmap(items, fn, limit) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

async function runBook(b) {
  const t0 = Date.now();
  const memos = b.memos.map((m) => ({ p: m.p, text: m.text, my: '' }));
  const bookMeta = { title: b.title, author: '', toc: [], summary: '' };
  const orders = [memos, shuffled(memos, 7)];
  let sharedCache = null;
  const runs = [];
  for (const order of orders) {
    const eng = createEngine({ llm, embed, book: bookMeta });
    if (sharedCache) Object.assign(eng.cache, sharedCache); else sharedCache = eng.cache;
    await pmap(order, (m) => eng.lift(m), 6); // lift 프리페치(순서 무관·캐시) — 동화만 순차
    for (const m of order) await eng.ingest(m);
    await eng.consolidate();
    runs.push({ rel: eng.relations(), snap: eng.snapshot(), tree: eng.renderTree() });
  }
  const keys = Object.keys(runs[0].rel);
  const agree = keys.reduce((s, k) => s + (runs[0].rel[k] === runs[1].rel[k] ? 1 : 0), 0) / (keys.length || 1);
  const sa = new Set(keys.filter((k) => runs[0].rel[k] !== 'none'));
  const sb = new Set(keys.filter((k) => runs[1].rel[k] !== 'none'));
  const uni = new Set([...sa, ...sb]).size;
  const jac = uni ? [...sa].filter((k) => sb.has(k)).length / uni : 1;
  const s = runs[0].snap;
  const real = s.nodes.filter((n) => !n.virtual && n.memos.length);
  return {
    id: b.id, title: b.title, memoN: memos.length, agree, jac,
    nodes: real.length, thick: real.filter((n) => n.memos.length >= 2).length,
    promoted: s.nodes.filter((n) => n.virtual).length, overlay: s.overlay.length,
    tree: runs[0].tree, snap: s, sec: Math.round((Date.now() - t0) / 1000),
  };
}

const results = [];
let done = 0;
await pmap(books, async (b) => {
  try {
    const r = await runBook(b);
    results.push(r);
    console.log(`  [${++done}/${books.length}] ${r.title} — 일치 ${(r.agree * 100).toFixed(0)}% 자카드 ${(r.jac * 100).toFixed(0)}% · 노드 ${r.nodes}(두꺼움 ${r.thick}) 승격 ${r.promoted} · ${r.sec}s`);
  } catch (e) {
    console.error(`  [실패] ${b.title}: ${e.message}`);
    results.push({ id: b.id, title: b.title, memoN: b.memoCount, error: e.message });
  }
}, 3);

const ok = results.filter((r) => !r.error);
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const pct = (x) => (x * 100).toFixed(0) + '%';
const unstable = ok.filter((r) => r.jac < 0.8).sort((a, b) => a.jac - b.jac);
const merged = ok.reduce((s, r) => s + (r.memoN - r.nodes), 0);
const totalMemo = ok.reduce((s, r) => s + r.memoN, 0);
const promotedBooks = ok.filter((r) => r.promoted > 0);

const sortKey = (r) => r.jac * 1000 + r.agree;
let md = `# v9 배치 — 데이터셋 ${ok.length}권 전수 (폴백 모드)

> 모델 ${MODEL} · 메모 ${totalMemo}개 · 책별 도착 순서 2종(원순서/시드7) · 목차 없음(평면 + v9.1 승격 + 오버레이)
> 데이터: golden/books50-memos.json (BKT-307 · 실발췌, AI 생성 없음)

## 총괄

| 지표 | 값 |
|---|---|
| 안정성 — 라벨 일치 평균 | **${pct(avg(ok.map((r) => r.agree)))}** |
| 안정성 — 관계쌍 자카드 평균 | **${pct(avg(ok.map((r) => r.jac)))}** |
| 자카드 ≥80% 책 비율 | **${ok.filter((r) => r.jac >= 0.8).length}/${ok.length}** |
| 동화·병합으로 묶인 메모 | ${merged}건 (${pct(merged / totalMemo)}) |
| 승격(상향 위계) 발생 책 | ${promotedBooks.length}권 · 부모 ${ok.reduce((s, r) => s + r.promoted, 0)}개 |
| 두꺼운 노드(메모≥2) 보유 책 | ${ok.filter((r) => r.thick > 0).length}/${ok.length} |
| 실패(파싱·API) | ${results.length - ok.length}권 |

## 불안정 책 (자카드 <80%)

${unstable.length ? `| 책 | 메모 | 일치 | 자카드 |\n|---|---|---|---|\n${unstable.map((r) => `| ${r.title} | ${r.memoN} | ${pct(r.agree)} | ${pct(r.jac)} |`).join('\n')}` : '(없음)'}

## 책별 결과

| 책 | 메모 | 일치 | 자카드 | 노드 | 두꺼움 | 승격 | 오버레이 |
|---|---|---|---|---|---|---|---|
${ok.sort((a, b) => sortKey(a) - sortKey(b)).map((r) => `| ${r.title} | ${r.memoN} | ${pct(r.agree)} | ${pct(r.jac)} | ${r.nodes} | ${r.thick} | ${r.promoted} | ${r.overlay} |`).join('\n')}

## 승격 트리 샘플 (승격 많은 순 3권)

${[...promotedBooks].sort((a, b) => b.promoted - a.promoted).slice(0, 3).map((r) => `### ${r.title}\n\n\`\`\`\n${r.tree}\n\`\`\``).join('\n\n')}
`;
await writeFile(resolve(__dir, 'runs/hier-v9-batch.md'), md);
await writeFile(resolve(__dir, 'runs/hier-v9-batch.json'), JSON.stringify({ model: MODEL, results: results.map(({ tree, ...r }) => r) }, null, 2));
console.log(`\n═══ 배치 완료: ${ok.length}권 · 일치 ${pct(avg(ok.map((r) => r.agree)))} · 자카드 ${pct(avg(ok.map((r) => r.jac)))} · 불안정 ${unstable.length}권 ═══`);
console.log('→ eval/runs/hier-v9-batch.md');
