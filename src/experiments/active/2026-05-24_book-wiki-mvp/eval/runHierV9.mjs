// v9 동화 우선 인제스트 — 수렴 안정성 + 오라클 일치 측정 (BKT-378)
// 실행: node eval/runHierV9.mjs
// 같은 메모 17건을 도착 순서 3종(원순서/시드7/시드42)으로 온라인 인제스트 → 통합 패스 →
// (a) 통합 전/후 관계 라벨 일치·자카드 (v8 지표와 비교 가능)
// (b) 오라클 골든 일치: 부착 정확도 / must-link / cannot-link
// 출력: eval/runs/hier-v9.md + hier-v9-{1..3}.json

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
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || 'embed fail');
  return d.data[0].embedding;
}

// ─── 데이터 (runHierStability와 동일: 실목차 + 실발췌) ─────────────
const book = {
  title: '디자인의 디자인', author: '하라 켄야',
  toc: ['디자인이라는 것', 'RE-DESIGN — 21세기의 일상', '정보의 건축 그 가능성', '욕망의 에듀케이션', '일본의 디자인', '비주얼커뮤니케이션 디자인', '디자이너의 일'],
  summary: '하라 켄야가 디자인의 본질을 다시 묻는 책. 디자인을 "새로운 것을 만드는 일"이 아니라 "이미 알고 있다고 여기는 것을 미지의 것으로 되돌려 다시 보게 하는 일(RE-DESIGN)"로 재정의한다.',
};
const MD = process.env.HOME + '/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books/디자인의 디자인_220308_191948.md';
const rawMd = await readFile(MD, 'utf-8');
const parsed = []; let cur = null;
for (const line of rawMd.split(/\r?\n/)) {
  const t = line.trim(); const m = t.match(/^(\d+)\.\s*(.*)$/);
  if (m) { cur = { p: Number(m[1]), lines: [] }; parsed.push(cur); if (m[2] && m[2].length >= 25) cur.lines.push(m[2]); }
  else if (t) { if (!cur) { cur = { p: 32, lines: [] }; parsed.push(cur); } cur.lines.push(t); }
}
const memosBase = parsed.map((x) => ({ p: x.p, text: x.lines.join(' ').trim(), my: '' })).filter((x) => x.text.length > 10);
console.log(`[데이터] 실 발췌 ${memosBase.length}개 · 실목차 ${book.toc.length}장 · 모델 ${MODEL}`);

// ─── 오라클 골든 (실목차 기준 · golden/hier-oracle-design-of-design.md 유래) ──
// chapters: 페이지 → 허용 장 인덱스(0-based) 집합. 경계 불확실 페이지는 복수 허용.
const ORACLE = {
  chapters: {
    32: [0], 33: [0], 35: [0], 36: [0], 38: [0], 48: [0],
    70: [1],
    82: [2], 109: [2], 114: [2, 5],
    139: [3],           // 욕망의 에듀케이션 (seed 목차에선 기권이었으나 실목차엔 자리 있음)
    148: [3, 4],        // 일본 자동차=욕망 스캔 — 욕망의 에듀케이션/일본의 디자인 경계 불확실(실물 미확인)
    216: [4, 5, 6], 219: [4, 5, 6], 220: [4, 5, 6],
    234: [5], 236: [5],
  },
  mustLink: [[35, 38], [216, 219]],                       // 같은 개념으로 병합돼야
  cannotLink: [[32, 48], [82, 109], [234, 236], [33, 36]], // 병합되면 안 됨 (형제는 OK)
};

// ─── 셔플 (runHierStability와 동일) ───────────────────────────────
function mulberry32(seed) { return function () { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffled(arr, seed) { const a = arr.slice(); const rnd = mulberry32(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ─── 실행 ───────────────────────────────────────────────────────
const runsSpec = [
  { name: 'run1-orig', memos: memosBase },
  { name: 'run2-seed7', memos: shuffled(memosBase, 7) },
  { name: 'run3-seed42', memos: shuffled(memosBase, 42) },
];

// 캐시 공유: lift·친화도·임베딩·판정은 내용 키 → 순서 무관(설계의 영구 캐시).
// 순서 의존성은 동화 판단의 '어떤 노드가 이미 존재하는가'에만 남는다 — 그게 측정 대상.
let sharedCache = null;
const results = [];
for (const spec of runsSpec) {
  console.log(`\n─── ${spec.name} ───`);
  const t0 = Date.now();
  const logs = [];
  const eng = createEngine({ llm, embed, book, log: (s) => { logs.push(s); console.log('  ' + s); } });
  if (sharedCache) { eng.cache.lift = sharedCache.lift; eng.cache.aff = sharedCache.aff; eng.cache.emb = sharedCache.emb; eng.cache.judge = sharedCache.judge; }
  else sharedCache = eng.cache;
  for (const m of spec.memos) await eng.ingest(m);
  const relOnline = eng.relations();
  const treeOnline = eng.renderTree();
  const digest = await eng.consolidate();
  const relFinal = eng.relations();
  const treeFinal = eng.renderTree();
  const snap = eng.snapshot();
  results.push({ name: spec.name, relOnline, relFinal, treeOnline, treeFinal, digest, snap, logs, sec: Math.round((Date.now() - t0) / 1000) });
  console.log(`  [통합] 다이제스트 ${digest.length}건 · ${Math.round((Date.now() - t0) / 1000)}s`);
}

// ─── 지표 ───────────────────────────────────────────────────────
const pairKeys = Object.keys(results[0].relFinal);
const agreement = (a, b) => pairKeys.reduce((s, k) => s + (a[k] === b[k] ? 1 : 0), 0) / pairKeys.length;
function jaccard(a, b) {
  const sa = new Set(pairKeys.filter((k) => a[k] !== 'none'));
  const sb = new Set(pairKeys.filter((k) => b[k] !== 'none'));
  const inter = [...sa].filter((k) => sb.has(k)).length;
  const uni = new Set([...sa, ...sb]).size;
  return uni ? inter / uni : 1;
}
const pairsOf = [[0, 1], [0, 2], [1, 2]];
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const agrOn = pairsOf.map(([i, j]) => agreement(results[i].relOnline, results[j].relOnline));
const jacOn = pairsOf.map(([i, j]) => jaccard(results[i].relOnline, results[j].relOnline));
const agrFi = pairsOf.map(([i, j]) => agreement(results[i].relFinal, results[j].relFinal));
const jacFi = pairsOf.map(([i, j]) => jaccard(results[i].relFinal, results[j].relFinal));
let allSame = 0; for (const k of pairKeys) if (results[0].relFinal[k] === results[1].relFinal[k] && results[1].relFinal[k] === results[2].relFinal[k]) allSame++;

// 오라클 채점
function oracleScore(r) {
  const chOf = new Map();
  for (const nd of r.snap.nodes) for (const m of nd.memos) chOf.set(m.p, nd.chapterIdx);
  const nodeOf = new Map();
  for (const nd of r.snap.nodes) for (const m of nd.memos) nodeOf.set(m.p, nd.id);
  let attachOk = 0, attachN = 0, wrong = [];
  for (const [p, allow] of Object.entries(ORACLE.chapters)) {
    attachN++;
    const got = chOf.get(Number(p));
    if (got != null && allow.includes(got)) attachOk++;
    else wrong.push(`p${p}→${got == null ? '미분류' : book.toc[got]}(기대 ${allow.map((i) => book.toc[i]).join('|')})`);
  }
  const mlOk = ORACLE.mustLink.filter(([a, b]) => nodeOf.get(a) && nodeOf.get(a) === nodeOf.get(b)).length;
  const clBad = ORACLE.cannotLink.filter(([a, b]) => nodeOf.get(a) && nodeOf.get(a) === nodeOf.get(b)).length;
  return { attachOk, attachN, wrong, mlOk, mlN: ORACLE.mustLink.length, clBad, clN: ORACLE.cannotLink.length };
}
const oracle = results.map(oracleScore);

// ─── 리포트 ─────────────────────────────────────────────────────
const pct = (x) => (x * 100).toFixed(0) + '%';
let md = `# 위계 인제스트 v9 (동화 우선) — 수렴 안정성 + 오라클 일치

> 모델 ${MODEL} · 메모 ${memosBase.length}개 · 실목차 ${book.toc.length}장 · 3회 실행(원순서 + 시드 7, 42)
> 설계: docs/hier-v9-assimilation-design.md · 오라클: golden/hier-oracle-design-of-design.md (실목차 재해석)
> lift·친화도·임베딩·판정 캐시는 내용 키로 3런 공유(설계의 '영구 캐시') — 순서 의존성은 동화 단계에만 남음.

## 안정성 (v8 대비)

| 지표 | v8 실측 | v9 온라인 직후 | **v9 통합 후** |
|---|---|---|---|
| 관계 라벨 일치율(평균) | 87% | ${pct(avg(agrOn))} | **${pct(avg(agrFi))}** |
| 관계쌍 자카드(평균) | 10% | ${pct(avg(jacOn))} | **${pct(avg(jacFi))}** |
| 3회 모두 동일 라벨 | 81% | — | **${pct(allSame / pairKeys.length)}** (${allSame}/${pairKeys.length}쌍) |

## 오라클 일치

| run | 부착 정확 | must-link | cannot-link 위반 | 오답 상세 |
|---|---|---|---|---|
${results.map((r, i) => `| ${r.name} | ${oracle[i].attachOk}/${oracle[i].attachN} | ${oracle[i].mlOk}/${oracle[i].mlN} | ${oracle[i].clBad}/${oracle[i].clN} | ${oracle[i].wrong.join('; ') || '—'} |`).join('\n')}

## run별 최종 트리

${results.map((r) => `### ${r.name} (${r.sec}s · 통합 다이제스트 ${r.digest.length}건)\n\n\`\`\`\n${r.treeFinal}\n\`\`\`\n\n통합 다이제스트:\n${r.digest.map((d) => `- ${d}`).join('\n') || '- (없음)'}`).join('\n\n')}

## run별 온라인 로그

${results.map((r) => `<details><summary>${r.name}</summary>\n\n\`\`\`\n${r.logs.join('\n')}\n\`\`\`\n</details>`).join('\n\n')}
`;

const outDir = resolve(__dir, 'runs');
await writeFile(resolve(outDir, 'hier-v9.md'), md);
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  await writeFile(resolve(outDir, `hier-v9-${i + 1}.json`), JSON.stringify({ name: r.name, snap: r.snap, relFinal: r.relFinal, digest: r.digest }, null, 2));
}
console.log(`\n═══ v9: 라벨 일치 ${pct(avg(agrFi))} (v8: 87%) · 자카드 ${pct(avg(jacFi))} (v8: 10%) · 부착 ${oracle.map((o) => o.attachOk + '/' + o.attachN).join(', ')} ═══`);
console.log('→ eval/runs/hier-v9.md');
