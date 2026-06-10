// 넛지 V7 — 퀄리티 × 다양성 동시 극대화 eval (DES-270 / DES-291)
//
// V7 = 2단계 생성:
//   ① Plan: 책당 1콜 — 넛지 4개를 서로 다른 앵커 메모 × 서로 다른 각도로 기획
//   ② Generate: 플랜당 1콜 — V5(co-reader) 톤으로 생성. 앞서 생성된 넛지를 보여주고
//      도입부·초대 문구 중복을 금지 (history-aware)
//
// 베이스라인 = V5 단일 프롬프트를 N회 반복 호출한 배치 (temp 0.7).
//
// 평가 (RUBRIC-NUDGE.md):
//   퀄리티 QA~QD — 넛지 1개 단위 (judge)
//   다양성 D1~D4 — 책 배치 단위 (judge + 프로그램 체크), D5 — 4책 전체 (judge)
//
// 사용: node eval/runNudgeV7.mjs            (ingest는 golden/ingest-cache.json 캐시)
//       REFRESH_CACHE=1 node eval/runNudgeV7.mjs
//       SKIP_BASELINE=1 node eval/runNudgeV7.mjs  (V7만 — 반복 튜닝용)
// 결과: eval/runs/nudge-v7-N.md / .json

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { setLLMTransport, planIngest, interpretProfile, NUDGE_SCHEMA, SYSTEM_RULES, generateNudgeBatch, NUDGE_BANNED_RE } from '../lib/llm.js';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

await loadDotEnvLocal(__dirname);
const GEN_MODEL = process.env.GEN_MODEL || 'gpt-4o-mini';   // 앱이 실제로 쓰는 모델
const EVAL_MODEL = process.env.EVAL_MODEL || 'gpt-4o';      // judge + ingest
const N_NUDGES = Number(process.env.N_NUDGES || 4);
const SKIP_BASELINE = !!process.env.SKIP_BASELINE;

const transport = openaiNodeTransport({});
setLLMTransport((args) => transport({ ...args, model: args.model || EVAL_MODEL })); // lib 호출(ingest/profile)은 EVAL_MODEL

const call = (user, { model, temperature = 0.4, system = SYSTEM_RULES } = {}) =>
  transport({ system, user, temperature, model: model || GEN_MODEL });

async function callJSON(user, opts = {}) {
  const raw = await call(user, opts);
  try { return JSON.parse(raw); }
  catch { return { _parseError: String(raw).slice(0, 200) }; }
}

// ─── 라운드 번호 ─────────────────────────────────────────────────
async function nextRound() {
  const runsDir = resolve(ROOT, 'runs');
  if (!existsSync(runsDir)) return 1;
  const files = await readdir(runsDir);
  const nums = files.map(f => f.match(/^nudge-v7-(\d+)\.md$/)).filter(Boolean).map(m => Number(m[1]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}
const ROUND = await nextRound();
console.log(`▶ Nudge V7 Round ${ROUND} (gen=${GEN_MODEL}, eval=${EVAL_MODEL}, N=${N_NUDGES})`);

// ─── seed + ingest 캐시 ──────────────────────────────────────────
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

async function loadOrBuildCache() {
  if (!process.env.REFRESH_CACHE && existsSync(CACHE_PATH)) {
    const c = JSON.parse(await readFile(CACHE_PATH, 'utf-8'));
    if (c.seedVersion === seed.version && c.books && c.derivedKeywords) {
      console.log('  ✓ ingest 캐시 사용 (golden/ingest-cache.json)');
      return c;
    }
  }
  console.log('  B · Profile 해석 중...');
  const profileOut = await interpretProfile({ profile: seed.profile });
  const cache = { seedVersion: seed.version, derivedKeywords: profileOut?.derivedKeywords || [], books: {} };
  for (const book of seed.books) {
    const memoRaw = seed.memos.filter(m => m.bookId === book.id);
    console.log(`  [${book.title}] Ingest 중...`);
    const memosNorm = memoRaw.map((m, i) => ({ id: `seed-memo-${book.id}-${i}`, text: m.quote, chapter: m.chapter, myThought: m.myThought }));
    const out = await planIngest({
      memos: memosNorm, book, existingPages: [], contexts: [],
      profile: { background: seed.profile.role, currentWork: seed.profile.currentConcerns || [], interests: seed.profile.interests || [], openQuestions: [] },
    });
    cache.books[book.id] = { pages: extractPages(out, book.id) };
    console.log(`    → ${cache.books[book.id].pages.length}개 페이지`);
  }
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
  return cache;
}

const cache = await loadOrBuildCache();
const derivedKeywords = cache.derivedKeywords;
const profile = { background: seed.profile.role, interests: seed.profile.interests };

// ─── 공통 포맷터 ─────────────────────────────────────────────────
const fmtMemos = (memos) => memos.map((m, i) =>
  `[메모-${i + 1}] ${m.chapter || '-'}\n원문: "${m.text}"\n내 생각: ${m.myThought || '(없음)'}`
).join('\n\n');

const fmtPages = (pages) => pages.map(p =>
  `- id: ${p.id} | title: ${p.title} | keyConcepts: ${(p.keyConcepts || []).join(', ')}`
).join('\n');

// ─── 베이스라인: V5 단일 프롬프트 × N회 ──────────────────────────
function v5Prompt({ memos, pages }) {
  return `
[유저 프로필]
background: ${profile.background}
interests: ${(profile.interests || []).join(', ')}

[Wiki 페이지 인덱스]
${fmtPages(pages)}

[메모 원문 전체]
${fmtMemos(memos)}

[작업 — 순서대로]

STEP 1: 유저가 이 메모를 저장할 때 어떤 생각으로 저장했는지 유추하라.
STEP 2: AI가 같은 메모를 읽고 드는 생각을 1~2문장으로 만들어라.
구조: [메모 원문에서 가장 인상적인 문구 짧게 인용] + [AI 해석 — 살짝 다른 각도] + (선택) [자연스럽게 떠오르는 일상 예시]
STEP 3: 유저에게 자연스럽게 넘겨라. 공세적 질문 금지, 대화 초대 형태.

[규칙]
- 책 원문 추론 금지. sourcePageIds 페이지 내용으로만 근거.
- 책 제목·페이지 번호 언급 금지.
- type: memo-memo 기본.

스키마:
${JSON.stringify(NUDGE_SCHEMA)}

JSON만 출력.
  `.trim();
}

// ─── 퀄리티 judge (QA~QD) ───────────────────────────────────────
const QUALITY_SCHEMA = {
  type: 'object', required: ['axes', 'pass'],
  properties: {
    axes: { type: 'array', items: { type: 'object', required: ['key', 'score', 'reasoning'], properties: { key: { type: 'string' }, score: { enum: [0, 1, 2] }, reasoning: { type: 'string' } } } },
    pass: { type: 'boolean' },
  },
};

function qualityPrompt({ question, sourcePageIds, pages, memos }) {
  const sourcePages = pages.filter(p => sourcePageIds?.includes(p.id));
  return `
넛지 1개를 4축으로 채점한다. 편향 없이 냉정하게.
넛지는 의문문이 아닐 수 있다 — "AI 생각 + 대화 초대" 구조 전체를 평가하라.

[평가 대상 넛지]
"${question || '(없음)'}"

[근거 페이지]
${sourcePages.length ? sourcePages.map(p => `- ${p.title}: ${(p.body || '').slice(0, 250)}`).join('\n') : '(없음)'}

[유저 메모 (컨텍스트)]
${memos.map((m, i) => `[${i + 1}] ${m.text.slice(0, 100)}${m.myThought ? ' — 내 생각: ' + m.myThought.slice(0, 60) : ''}`).join('\n')}

[4축]
**QA 근거 강제**: 2=모든 내용이 근거 페이지·메모로 역추적 가능, 책 원문 추론 0건 / 1=일부 표현이 범위 밖 / 0=자유 추론 또는 넛지 없음
**QB 이해가능성**: 2=책을 안 읽은 사람도 한 번에 이해 (인용+맥락이 자기완결) / 1=약간 모호 / 0=책 배경 필수
**QC 구체성**: 2=특정 장면·순간이 그려짐 (책 속 사례·일상 장면 모두 인정) / 1=절반 추상 / 0=완전 추상
**QD 정지력**: 2=스쳐 읽다 멈출 만한 예상 밖 각도 / 1=흥미롭지만 예측 가능 / 0=뻔함

pass = 모든 축 ≥ 1.

스키마:
${JSON.stringify(QUALITY_SCHEMA)}

JSON만 출력.
  `.trim();
}

// ─── 다양성 judge (책 배치 D1~D4) ────────────────────────────────
const DIVERSITY_SCHEMA = {
  type: 'object', required: ['axes'],
  properties: {
    axes: { type: 'array', items: { type: 'object', required: ['key', 'score', 'reasoning'], properties: { key: { type: 'string' }, score: { enum: [0, 1, 2] }, reasoning: { type: 'string' } } } },
  },
};

function diversityPrompt({ nudges }) {
  return `
한 유저가 같은 책에 대해 시간차를 두고 받게 될 넛지 ${nudges.length}개 배치다.
"연속으로 받아도 매번 새로운가"를 4축으로 채점한다. 냉정하게 — 템플릿화가 보이면 가차없이.

[넛지 배치]
${nudges.map((n, i) => `${i + 1}. (angle: ${n.angle || '?'}, type: ${n.type}) "${n.question}"`).join('\n')}

[4축]
**D1 앵커 다양성**: 2=서로 다른 메모·문구에 앵커, 인용 중복 0 / 1=1쌍이 같은 메모를 다른 각도로 / 0=2개 이상이 같은 문구에 수렴
**D2 각도 다양성**: 2=해석의 사고 패턴이 모두 구분됨 (라벨 말고 실제 내용으로 판단) / 1=2개가 실질 동일 각도 / 0=절반 이상 동형
**D3 문형 다양성**: 2=도입부 구조·초대 문구 모두 다름 / 1=초대 문구 1개 중복 or 도입 구조 2회 반복 / 0=동일 템플릿 3회+
**D4 연결타입 다양성**: 2=단일메모/클러스터(2~3메모 연결)/프로필 중 3종 이상 / 1=2종 / 0=1종

스키마:
${JSON.stringify(DIVERSITY_SCHEMA)}

JSON만 출력.
  `.trim();
}

// ─── 책 간 비수렴 judge (D5) ─────────────────────────────────────
function crossBookPrompt({ batches }) {
  return `
4권의 책 각각에 대해 생성된 넛지 배치다. **책이 달라도 같은 템플릿이 반복되는지** 검사한다.
(과거 실패 사례: 4책 모두 "최근 디자인 리뷰에서 의사결정이 막힌 순간..." 동일 패턴)

${batches.map(b => `[${b.title}]\n${b.nudges.map((n, i) => `${i + 1}. "${n.question}"`).join('\n')}`).join('\n\n')}

[채점 — D5 책 간 비수렴]
- 2: 책이 다르면 상황·표현·구조가 모두 책 고유. 책을 가리고 읽어도 어느 책인지 구분 가능.
- 1: 2권에서 비슷한 표현·상황 패턴 재사용.
- 0: 동일 템플릿이 3권 이상에서 반복.

스키마:
${JSON.stringify({ type: 'object', required: ['score', 'reasoning'], properties: { score: { enum: [0, 1, 2] }, reasoning: { type: 'string' } } })}

JSON만 출력.
  `.trim();
}

// ─── 프로그램 다양성 체크 ────────────────────────────────────────
const norm = (s) => (s || '').replace(/[\s"'“”‘’.,!?~—-]/g, '');
const lastSentenceNorm = (q) => { const parts = (q || '').split(/(?<=[.?!])\s+/); return norm(parts[parts.length - 1]); };
function programChecks(nudges, plans) {
  const openings = nudges.map(n => norm(n.question).slice(0, 12));
  const lastSentence = (q) => { const parts = (q || '').split(/(?<=[.?!])\s+/); return norm(parts[parts.length - 1]); };
  const tails = nudges.map(n => lastSentence(n.question));
  const dupOpenings = openings.filter((o, i) => o && openings.indexOf(o) !== i).length;
  const dupTails = tails.filter((t, i) => t && tails.indexOf(t) !== i).length;
  let anchorOverlap = 0;
  if (plans) {
    const sets = plans.map(p => new Set(p.anchorMemoIdx || []));
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++)
      for (const x of sets[i]) if (sets[j].has(x)) { anchorOverlap++; break; }
  }
  const bannedHits = nudges.filter(n => n.question && NUDGE_BANNED_RE.test(n.question)).length;
  return { dupOpenings, dupTails, anchorOverlap, bannedHits };
}

// ─── 실행 ────────────────────────────────────────────────────────
// V7 배치 생성 — lib/llm.js 의 generateNudgeBatch 를 그대로 사용 (eval과 앱이 같은 코드 경로)
const runV7Batch = (book, memos, pages, bookIdx) =>
  generateNudgeBatch({ memos, pages, profile, derivedKeywords, n: N_NUDGES, styleOffset: bookIdx, model: GEN_MODEL });

async function runV5Baseline(book, memos, pages) {
  const validIds = new Set(pages.map(p => p.id));
  const nudges = [];
  for (let i = 0; i < N_NUDGES; i++) {
    const n = await callJSON(v5Prompt({ memos, pages }), { temperature: 0.7 });
    if (!n.question) { nudges.push({ type: 'none', question: '', sourcePageIds: [] }); continue; }
    n.sourcePageIds = (n.sourcePageIds || []).filter(id => validIds.has(id));
    nudges.push(n);
  }
  return { nudges };
}

async function evalBatch(label, nudges, { pages, memos }) {
  const quality = [];
  for (const n of nudges) {
    const q = await callJSON(qualityPrompt({ question: n.question, sourcePageIds: n.sourcePageIds, pages, memos }), { model: EVAL_MODEL, temperature: 0 });
    if (Array.isArray(q.axes) && q.axes.length) q.pass = !q.axes.some(a => a.score === 0);
    else { q.axes = []; q.pass = false; }
    quality.push(q);
  }
  const div = await callJSON(diversityPrompt({ nudges }), { model: EVAL_MODEL, temperature: 0 });
  return { quality, diversity: div.axes || [] };
}

const results = [];
for (let bookIdx = 0; bookIdx < seed.books.length; bookIdx++) {
  const book = seed.books[bookIdx];
  const memoRaw = seed.memos.filter(m => m.bookId === book.id);
  const memos = memoRaw.map(m => ({ bookId: m.bookId, chapter: m.chapter, text: m.quote, myThought: m.myThought }));
  const pages = cache.books[book.id].pages;
  console.log(`\n[${book.title}]`);

  console.log('  V7 plan+generate...');
  const v7 = await runV7Batch(book, memos, pages, bookIdx);
  console.log(`    → ${v7.nudges.filter(n => n.question).length}/${N_NUDGES}개 생성`);
  console.log('  V7 평가...');
  const v7Eval = await evalBatch('V7', v7.nudges, { pages, memos });
  const v7Checks = programChecks(v7.nudges, v7.plans);

  let v5 = null, v5Eval = null, v5Checks = null;
  if (!SKIP_BASELINE) {
    console.log('  V5 baseline ×' + N_NUDGES + '...');
    v5 = await runV5Baseline(book, memos, pages);
    console.log('  V5 평가...');
    v5Eval = await evalBatch('V5', v5.nudges, { pages, memos });
    v5Checks = programChecks(v5.nudges, null);
  }

  results.push({ book, pages, v7, v7Eval, v7Checks, v5, v5Eval, v5Checks });

  const dsum = (ev) => (ev.diversity || []).reduce((s, a) => s + a.score, 0);
  const qavg = (ev) => { const all = ev.quality.flatMap(q => q.axes.map(a => a.score)); return all.length ? (all.reduce((a, b) => a + b, 0) / all.length).toFixed(2) : '0'; };
  console.log(`    V7: Q평균 ${qavg(v7Eval)} | D합 ${dsum(v7Eval)}/8 | 프로그램체크 ${JSON.stringify(v7Checks)}`);
  if (v5Eval) console.log(`    V5: Q평균 ${qavg(v5Eval)} | D합 ${dsum(v5Eval)}/8`);
}

// D5: 책 간 비수렴
console.log('\nD5 책 간 비수렴 평가...');
const d5v7 = await callJSON(crossBookPrompt({ batches: results.map(r => ({ title: r.book.title, nudges: r.v7.nudges })) }), { model: EVAL_MODEL, temperature: 0.1 });
const d5v5 = SKIP_BASELINE ? null : await callJSON(crossBookPrompt({ batches: results.map(r => ({ title: r.book.title, nudges: r.v5.nudges })) }), { model: EVAL_MODEL, temperature: 0.1 });

// ─── 합격 판정 ───────────────────────────────────────────────────
function verdict(results, d5) {
  const perBook = results.map(r => {
    const qAllPass = r.v7Eval.quality.every(q => q.pass);
    const qScores = r.v7Eval.quality.flatMap(q => q.axes.map(a => a.score));
    const qAvg = qScores.length ? qScores.reduce((a, b) => a + b, 0) / qScores.length : 0;
    const dAxes = r.v7Eval.diversity;
    const dMin = dAxes.length ? Math.min(...dAxes.map(a => a.score)) : 0;
    const dSum = dAxes.reduce((s, a) => s + a.score, 0);
    // 프로그램 체크 충돌 시 강등
    const progFail = r.v7Checks.dupOpenings > 0 || r.v7Checks.dupTails > 0 || r.v7Checks.anchorOverlap > 0 || r.v7Checks.bannedHits > 0;
    return { title: r.book.title, qAllPass, qAvg, dMin, dSum, progFail, pass: qAllPass && qAvg >= 1.5 && dMin >= 1 && dSum >= 6 && !progFail };
  });
  const d5ok = (d5?.score ?? 0) >= 1;
  return { perBook, d5Score: d5?.score ?? 0, d5ok, roundPass: perBook.every(b => b.pass) && d5ok };
}
const v = verdict(results, d5v7);

// ─── 리포트 ──────────────────────────────────────────────────────
const axMap = (axes) => Object.fromEntries((axes || []).map(a => [a.key, a.score]));

function batchTable(r, variant, ev) {
  const lines = ['| # | angle | type | QA | QB | QC | QD | 합격 | 넛지 |', '|---|---|---|---|---|---|---|---|---|'];
  (variant.nudges).forEach((n, i) => {
    const ax = axMap(ev.quality[i]?.axes);
    lines.push(`| ${i + 1} | ${n.angle || '-'} | ${n.type} | ${ax.QA ?? '-'} | ${ax.QB ?? '-'} | ${ax.QC ?? '-'} | ${ax.QD ?? '-'} | ${ev.quality[i]?.pass ? '✅' : '❌'} | ${(n.question || '_(없음)_').slice(0, 70)} |`);
  });
  return lines.join('\n');
}

const md = `# Nudge V7 Round ${ROUND} — 퀄리티 × 다양성

> gen=\`${GEN_MODEL}\` / eval=\`${EVAL_MODEL}\` / 책당 ${N_NUDGES}개 배치. 루브릭: RUBRIC-NUDGE.md
> **V7**: 플랜(앵커×각도 분산) → history-aware 생성 | **V5 베이스라인**: 단일 프롬프트 ×${N_NUDGES}회

## 종합 판정: ${v.roundPass ? '✅ 합격' : '❌ 불합격'}

| 책 | Q 전원합격 | Q 평균(≥1.5) | D min(≥1) | D 합(≥6/8) | 프로그램체크 | 판정 |
|---|---|---|---|---|---|---|
${v.perBook.map(b => `| ${b.title} | ${b.qAllPass ? '✅' : '❌'} | ${b.qAvg.toFixed(2)} | ${b.dMin} | ${b.dSum}/8 | ${b.progFail ? '⚠️ 중복검출' : '✅'} | ${b.pass ? '✅' : '❌'} |`).join('\n')}

**D5 책 간 비수렴**: V7 = ${d5v7.score ?? '?'}/2 — ${d5v7.reasoning || ''}
${d5v5 ? `(V5 베이스라인 = ${d5v5.score}/2 — ${d5v5.reasoning})` : ''}

---

${results.map(r => `
## ${r.book.title}

### V7 배치
${batchTable(r, r.v7, r.v7Eval)}

**다양성 (judge)**: ${r.v7Eval.diversity.map(a => `${a.key}:${a.score}`).join(' ')}
${r.v7Eval.diversity.map(a => `- **${a.key}** ${a.score}/2: ${a.reasoning}`).join('\n')}

**프로그램 체크**: 도입중복 ${r.v7Checks.dupOpenings} / 초대중복 ${r.v7Checks.dupTails} / 앵커중복 ${r.v7Checks.anchorOverlap} / 금지어 ${r.v7Checks.bannedHits}

**전체 넛지**:
${r.v7.nudges.map((n, i) => `${i + 1}. (${n.angle}, ${n.style || '-'}) ${n.question || '_(없음)_'}`).join('\n')}

${r.v5 ? `### V5 베이스라인
${batchTable(r, r.v5, r.v5Eval)}

**다양성 (judge)**: ${r.v5Eval.diversity.map(a => `${a.key}:${a.score}`).join(' ')}
**프로그램 체크**: 도입중복 ${r.v5Checks.dupOpenings} / 초대중복 ${r.v5Checks.dupTails}
` : ''}
`).join('\n---\n')}

---

## 다음 액션

${v.roundPass
  ? '- 합격. lib/llm.js 반영 + DES-270/291 업데이트.'
  : v.perBook.filter(b => !b.pass).map(b => `- **${b.title}**: ${!b.qAllPass ? 'Q 불합격 케이스 분석. ' : ''}${b.qAvg < 1.5 ? `Q평균 ${b.qAvg.toFixed(2)} 부족. ` : ''}${b.dMin < 1 ? 'D 0점 축 존재. ' : ''}${b.dSum < 6 ? `D합 ${b.dSum} 부족. ` : ''}${b.progFail ? '프로그램 중복 검출.' : ''}`).join('\n')}
`;

const runsDir = resolve(ROOT, 'runs');
await mkdir(runsDir, { recursive: true });
await writeFile(resolve(runsDir, `nudge-v7-${ROUND}.md`), md, 'utf-8');
await writeFile(resolve(runsDir, `nudge-v7-${ROUND}.json`), JSON.stringify({
  round: ROUND, genModel: GEN_MODEL, evalModel: EVAL_MODEL, nNudges: N_NUDGES,
  verdict: v, d5: { v7: d5v7, v5: d5v5 },
  books: results.map(r => ({
    title: r.book.title,
    v7: { plans: r.v7.plans, nudges: r.v7.nudges, eval: r.v7Eval, checks: r.v7Checks },
    v5: r.v5 ? { nudges: r.v5.nudges, eval: r.v5Eval, checks: r.v5Checks } : null,
  })),
}, null, 2), 'utf-8');

console.log(`\n${v.roundPass ? '✅ 합격' : '❌ 불합격'} — runs/nudge-v7-${ROUND}.md`);
