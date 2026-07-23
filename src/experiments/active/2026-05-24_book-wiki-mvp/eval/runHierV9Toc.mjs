// v9 목차 A/B — 알라딘에서 수집한 목차를 v9 스켈레톤으로 넣었을 때의 효과 측정 (BKT-378)
//
// 배경: runHierV9Batch.mjs 는 56권 전수를 toc:[] 폴백 모드로 돌렸다(엔진은 목차를 확정
//       스켈레톤으로 쓰도록 설계됨). buildBooks50.mjs 주석의 "목차·저자 메타는 후속
//       (알라딘 수집)" 이 그 빈자리다. 여기서 목차 유무만 바꿔 A/B 한다.
//
// 입력 고정: 메모는 golden/books50-memos.json(upstream 파서, 실발췌) 그대로 —
//           목차 외 변수를 건드리지 않기 위해 자체 파싱을 쓰지 않는다.
// 목차 출처: golden/obsidian-books-meta.json (알라딘 스크레이핑)
//
// 사용: node eval/runHierV9Toc.mjs
// 결과: runs/hier-v9-toc-{n}.json + runs/hier-v9-toc.md
import { readFile, writeFile } from 'node:fs/promises';
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

// 볼트 파일명은 NFD, 데이터셋 제목은 NFC 로 섞여 있어 그냥 비교하면 0건 매칭된다
const N = (s) => String(s || '').normalize('NFC');

function shuffled(arr, seed) {
  const a = [...arr]; let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

async function pmap(items, fn, n) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// runHierV9Batch.runBook 과 동일한 절차 — bookMeta 만 인자로 받는다
async function runOnce(b, bookMeta) {
  const memos = b.memos.map((m) => ({ p: m.p, text: m.text, my: '' }));
  const orders = [memos, shuffled(memos, 7)];
  let sharedCache = null;
  const runs = [];
  for (const order of orders) {
    const eng = createEngine({ llm, embed, book: bookMeta });
    if (sharedCache) Object.assign(eng.cache, sharedCache); else sharedCache = eng.cache;
    await pmap(order, (m) => eng.lift(m), 6);
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
    agree, jac, nodes: real.length,
    thick: real.filter((n) => n.memos.length >= 2).length,
    promoted: s.nodes.filter((n) => n.virtual).length,
    overlay: s.overlay.length,
    unfiled: real.filter((n) => n.unfiled).length,
    tree: runs[0].tree, snap: s,
  };
}

const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
const meta = JSON.parse(await readFile(resolve(__dir, 'golden/obsidian-books-meta.json'), 'utf-8'));

// 목차가 실제로 있는 책만 A/B 대상 (목차 0줄이면 A/B 가 성립하지 않는다)
const targets = Object.values(meta)
  .map((m) => ({ m, b: ds.books.find((x) => N(x.title) === N(m.title)) }))
  .filter((t) => t.b && (t.m.toc || []).length > 0);

console.log(`[v9 목차 A/B] 모델 ${MODEL} · 대상 ${targets.length}권 (목차 보유 + 데이터셋 매칭)`);

const results = [];
let i = 0;
for (const { m, b } of targets) {
  const t0 = Date.now();
  const base = { title: b.title, author: '', summary: '' };
  const withoutToc = await runOnce(b, { ...base, toc: [] });
  const withToc = await runOnce(b, { ...base, toc: m.toc, author: m.author || '', summary: m.summary || '' });
  const sec = Math.round((Date.now() - t0) / 1000);
  const row = { title: N(b.title), memoN: b.memos.length, tocLines: m.toc.length, withoutToc, withToc, sec };
  results.push(row);
  await writeFile(resolve(__dir, `runs/hier-v9-toc-${++i}.json`), JSON.stringify({
    label: N(b.title), runAt: new Date().toISOString(), kind: 'hier-v9-toc-ab', model: MODEL,
    book: { title: N(b.title), author: m.author, tocLines: m.toc.length }, memoN: b.memos.length, sec,
    withoutToc: { ...withoutToc, snap: undefined }, withToc: { ...withToc, snap: undefined },
    tree: withToc.tree,
  }, null, 2) + '\n', 'utf-8');
  console.log(`  [${i}/${targets.length}] ${N(b.title)} — 목차 ${m.toc.length}줄 · 메모 ${b.memos.length}`);
  console.log(`      목차X 자카드 ${(withoutToc.jac * 100).toFixed(0)}% 노드 ${withoutToc.nodes} 두꺼움 ${withoutToc.thick} 승격 ${withoutToc.promoted}`);
  console.log(`      목차O 자카드 ${(withToc.jac * 100).toFixed(0)}% 노드 ${withToc.nodes} 두꺼움 ${withToc.thick} 승격 ${withToc.promoted}  (${sec}s)`);
}

const avg = (f) => (results.reduce((s, r) => s + f(r), 0) / (results.length || 1));
let md = `# v9 목차 A/B — 알라딘 목차 주입 효과\n\n`;
md += `> 모델 ${MODEL} · ${results.length}권 · 메모는 golden/books50-memos.json 고정, 목차만 A/B\n\n`;
md += `## 총괄\n\n| 지표 | 목차 없음 | 목차 있음 |\n|---|---|---|\n`;
md += `| 자카드 평균 | ${(avg((r) => r.withoutToc.jac) * 100).toFixed(0)}% | ${(avg((r) => r.withToc.jac) * 100).toFixed(0)}% |\n`;
md += `| 라벨 일치 평균 | ${(avg((r) => r.withoutToc.agree) * 100).toFixed(0)}% | ${(avg((r) => r.withToc.agree) * 100).toFixed(0)}% |\n`;
md += `| 노드 평균 | ${avg((r) => r.withoutToc.nodes).toFixed(1)} | ${avg((r) => r.withToc.nodes).toFixed(1)} |\n`;
md += `| 두꺼운 노드 평균 | ${avg((r) => r.withoutToc.thick).toFixed(1)} | ${avg((r) => r.withToc.thick).toFixed(1)} |\n`;
md += `| 승격 평균 | ${avg((r) => r.withoutToc.promoted).toFixed(1)} | ${avg((r) => r.withToc.promoted).toFixed(1)} |\n\n`;
md += `## 책별\n\n| 책 | 메모 | 목차 | 자카드 X→O | 노드 X→O | 두꺼움 X→O | 승격 X→O |\n|---|---|---|---|---|---|---|\n`;
for (const r of results) {
  md += `| ${r.title} | ${r.memoN} | ${r.tocLines} | ${(r.withoutToc.jac * 100).toFixed(0)}% → ${(r.withToc.jac * 100).toFixed(0)}% | ${r.withoutToc.nodes} → ${r.withToc.nodes} | ${r.withoutToc.thick} → ${r.withToc.thick} | ${r.withoutToc.promoted} → ${r.withToc.promoted} |\n`;
}
md += `\n## 트리\n\n노드를 클릭하면 상세가 열린다.\n\n`;
await writeFile(resolve(__dir, 'runs/hier-v9-toc.md'), md, 'utf-8');
console.log(`\n✓ ${results.length}권 완료 → runs/hier-v9-toc.md`);
