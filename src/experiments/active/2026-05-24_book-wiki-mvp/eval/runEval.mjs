// DES-193 · 평가 인프라.
// 골든셋 로드 → 3개 파이프라인(A Ingest / B Profile / C Nudge) 실행 → 자기평가 → round-N.md.
//
// 사용: node eval/runEval.mjs [라운드번호]
// 예:  node eval/runEval.mjs 1
//
// 결과: eval/runs/round-N.md + eval/runs/round-N.json (원본 데이터)

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  setLLMTransport,
  planIngest,
  interpretProfile,
  generateNudge,
  SYSTEM_RULES,
} from '../lib/llm.js';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
import { selfEvalPrompt, aggregate, AXES } from './lib/selfEval.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname; // = eval/

// ─── env + transport ────────────────────────────────────────────
await loadDotEnvLocal(__dirname);
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const transport = openaiNodeTransport({ model: MODEL });
setLLMTransport(transport);

// ─── 라운드 번호 결정 ────────────────────────────────────────────
async function nextRoundNumber() {
  const runsDir = resolve(ROOT, 'runs');
  if (!existsSync(runsDir)) return 1;
  const files = await readdir(runsDir);
  const nums = files
    .map(f => f.match(/^round-(\d+)\.md$/))
    .filter(Boolean)
    .map(m => Number(m[1]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

const argN = Number(process.argv[2]);
const ROUND = Number.isFinite(argN) && argN > 0 ? argN : await nextRoundNumber();

console.log(`▶ Round ${ROUND} (model=${MODEL})`);

// ─── 골든셋 + 루브릭 로드 ────────────────────────────────────────
const seed = JSON.parse(await readFile(resolve(ROOT, 'golden/seed-v1.json'), 'utf-8'));
const rubric = await readFile(resolve(ROOT, 'RUBRIC.md'), 'utf-8');

// ─── 자기평가 ────────────────────────────────────────────────────
async function selfEval(pipeline, input, output) {
  const user = selfEvalPrompt({ pipeline, rubric, input, output });
  const text = await transport({ system: SYSTEM_RULES, user, temperature: 0.1 });
  try { return JSON.parse(text); }
  catch { return { axes: [], pass: false, suspect: true, suspectReason: '자기평가 JSON 파싱 실패', _raw: text.slice(0, 300) }; }
}

// ─── 파이프라인 A · Ingest ──────────────────────────────────────
async function runIngest(book, memos) {
  const memosNorm = memos.map((m, i) => ({
    id: `seed-memo-${i}`,
    text: m.quote,
    chapter: m.chapter,
    myThought: m.myThought,
  }));
  const out = await planIngest({
    memos: memosNorm,
    book,
    existingPages: [],
    contexts: [],
    profile: {
      background: seed.profile.role,
      currentWork: seed.profile.currentConcerns || [],
      interests: seed.profile.interests || [],
      openQuestions: [],
    },
  });
  return { input: { book: { title: book.title, toc: book.toc?.slice(0, 20) }, memos: memosNorm }, output: out };
}

// ─── 파이프라인 B · Profile ─────────────────────────────────────
async function runProfile() {
  const out = await interpretProfile({ profile: seed.profile });
  return { input: seed.profile, output: out };
}

// ─── 파이프라인 C · Nudge ───────────────────────────────────────
function extractPages(ingestResults) {
  const pages = [];
  for (const r of ingestResults) {
    for (const p of (r.output?.patches || [])) {
      if (p.action === 'create' && p.pageDraft) {
        pages.push({
          id: p.pageId || `page-${pages.length}`,
          title: p.pageDraft.title,
          type: p.pageDraft.type,
          bookId: p.pageDraft.bookId,
          body: p.pageDraft.body,
          keyConcepts: p.pageDraft.keyConcepts || [],
        });
      }
    }
  }
  return pages;
}

async function runNudge({ pages, derivedKeywords, memos }) {
  const profile = {
    background: seed.profile.role,
    interests: seed.profile.interests,
  };
  const out = await generateNudge({
    memos,
    pages,
    profile,
    derivedKeywords: derivedKeywords || [],
  });
  return {
    input: {
      profile,
      derivedKeywords: (derivedKeywords || []).map(k => k.keyword),
      pageCount: pages.length,
    },
    output: out,
  };
}

// ─── 실행 ────────────────────────────────────────────────────────
const results = { A: [], B: [], C: [] };

console.log('  A · Ingest 실행 중...');
for (const book of seed.books) {
  const memos = seed.memos.filter(m => m.bookId === book.id);
  const r = await runIngest(book, memos);
  r.eval = await selfEval('A', r.input, r.output);
  r.label = book.title;
  results.A.push(r);
  console.log(`     ✓ ${book.title} — ${r.eval.pass ? 'PASS' : 'FAIL'}${r.eval.suspect ? ' (suspect)' : ''}`);
}

console.log('  B · Profile 실행 중...');
{
  const r = await runProfile();
  r.eval = await selfEval('B', r.input, r.output);
  r.label = '사용자 프로필';
  results.B.push(r);
  console.log(`     ✓ ${r.label} — ${r.eval.pass ? 'PASS' : 'FAIL'}${r.eval.suspect ? ' (suspect)' : ''}`);
}

console.log('  C · Nudge 실행 중...');
const pages = extractPages(results.A);
const derivedKeywords = results.B[0]?.output?.derivedKeywords || [];
for (const book of seed.books) {
  const memos = seed.memos.filter(m => m.bookId === book.id).map((m, i) => ({
    bookId: m.bookId,
    chapter: m.chapter,
    text: m.quote,
  }));
  const r = await runNudge({ pages, derivedKeywords, memos });
  r.eval = await selfEval('C', r.input, r.output);
  r.label = book.title;
  results.C.push(r);
  console.log(`     ✓ ${book.title} — ${r.output ? (r.eval.pass ? 'PASS' : 'FAIL') : 'NO-NUDGE'}${r.eval.suspect ? ' (suspect)' : ''}`);
}

// ─── 마크다운 생성 ───────────────────────────────────────────────
function fmtAxes(ev, pipeline) {
  if (!ev?.axes?.length) return '_(채점 없음)_';
  const map = Object.fromEntries(AXES[pipeline].map(a => [a.key, a.name]));
  return ev.axes.map(a => `- **${a.key}** (${map[a.key] || ''}) — ${a.score}/2: ${a.reasoning}`).join('\n');
}

function tableRow(r, pipeline) {
  const suspect = r.eval?.suspect ? '🚩' : '';
  const pass = r.eval?.pass ? '✅' : '❌';
  const scores = (r.eval?.axes || []).map(a => `${a.key}:${a.score}`).join(' ');
  return `| ${r.label} | ${pass} ${suspect} | ${scores} | ${r.eval?.suspectReason || ''} |`;
}

const aggA = aggregate(results.A);
const aggB = aggregate(results.B);
const aggC = aggregate(results.C);

const md = `# Round ${ROUND} — ${new Date().toISOString().slice(0, 10)}

> Model: \`${MODEL}\`. 자기평가는 LLM 1차 채점. 🚩 = 사용자 검토 필요.

## 합격률 요약

| 파이프라인 | 합격/전체 | 합격률 | 의심 |
|---|---|---|---|
| A · Ingest | ${aggA.passed}/${aggA.total} | **${aggA.rate}%** | ${aggA.suspects} |
| B · Profile | ${aggB.passed}/${aggB.total} | **${aggB.rate}%** | ${aggB.suspects} |
| C · Nudge | ${aggC.passed}/${aggC.total} | **${aggC.rate}%** | ${aggC.suspects} |

## 의심 케이스 short list

${[...results.A, ...results.B, ...results.C].filter(r => r.eval?.suspect).map(r => `- **${r.label}** (${r.eval.axes?.map(a => a.key).join('/') || '?'}): ${r.eval.suspectReason}`).join('\n') || '_(없음)_'}

---

## 파이프라인 A · Ingest

| 케이스 | 합격 | 점수 | 의심 사유 |
|---|---|---|---|
${results.A.map(r => tableRow(r, 'A')).join('\n')}

${results.A.map(r => `
### A — ${r.label}

${fmtAxes(r.eval, 'A')}

<details><summary>출력 보기</summary>

\`\`\`json
${JSON.stringify(r.output, null, 2).slice(0, 4000)}
\`\`\`

</details>
`).join('\n')}

---

## 파이프라인 B · Profile

| 케이스 | 합격 | 점수 | 의심 사유 |
|---|---|---|---|
${results.B.map(r => tableRow(r, 'B')).join('\n')}

${results.B.map(r => `
### B — ${r.label}

${fmtAxes(r.eval, 'B')}

<details><summary>derivedKeywords</summary>

${(r.output?.derivedKeywords || []).map(k => `- **${k.keyword}** (${k.axis}, ${k.sourceField}) — ${k.reasoning}`).join('\n')}

</details>
`).join('\n')}

---

## 파이프라인 C · Nudge

| 케이스 | 합격 | 점수 | 의심 사유 |
|---|---|---|---|
${results.C.map(r => tableRow(r, 'C')).join('\n')}

${results.C.map(r => `
### C — ${r.label}

${fmtAxes(r.eval, 'C')}

> ${r.output?.question || '_(질문 없음)_'}

- type: \`${r.output?.type || '-'}\`
- sourcePageIds: ${(r.output?.sourcePageIds || []).join(', ') || '_(없음)_'}
- usedDerivedKeywords: ${(r.output?.usedDerivedKeywords || []).join(', ') || '_(없음)_'}
`).join('\n')}

---

## 다음 튜닝 액션 제안 (DES-198)

${suggestActions({ A: aggA, B: aggB, C: aggC, results })}
`;

function suggestActions({ A, B, C, results }) {
  const lines = [];
  if (A.rate < 100) lines.push(`- A 합격률 ${A.rate}% — Ingest 프롬프트 라운드 (DES-199). 실패 축: ${weakestAxis(results.A)}`);
  if (B.rate < 100) lines.push(`- B 합격률 ${B.rate}% — interpretProfile 프롬프트 튜닝. 실패 축: ${weakestAxis(results.B)}`);
  if (C.rate < 100) lines.push(`- C 합격률 ${C.rate}% — Nudge 프롬프트 라운드 (DES-203). 실패 축: ${weakestAxis(results.C)}`);
  if (!lines.length) lines.push('- 🎉 3 파이프라인 모두 100% — M2-7 게이트(DES-208) 검증 가능.');
  return lines.join('\n');
}

function weakestAxis(rs) {
  const sums = {};
  for (const r of rs) for (const a of (r.eval?.axes || [])) {
    sums[a.key] = (sums[a.key] || 0) + a.score;
  }
  const entries = Object.entries(sums).sort((a, b) => a[1] - b[1]);
  return entries.length ? entries[0][0] : '?';
}

// ─── 저장 ───────────────────────────────────────────────────────
const runsDir = resolve(ROOT, 'runs');
await mkdir(runsDir, { recursive: true });
const mdPath = resolve(runsDir, `round-${ROUND}.md`);
const jsonPath = resolve(runsDir, `round-${ROUND}.json`);
await writeFile(mdPath, md, 'utf-8');
await writeFile(jsonPath, JSON.stringify({ round: ROUND, model: MODEL, results, aggA, aggB, aggC }, null, 2), 'utf-8');

console.log(`\n✓ ${mdPath}`);
console.log(`✓ ${jsonPath}`);
console.log(`\nA ${aggA.rate}%  |  B ${aggB.rate}%  |  C ${aggC.rate}%`);
