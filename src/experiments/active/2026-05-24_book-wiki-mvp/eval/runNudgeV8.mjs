// 넛지 V8 채점 eval — 자극성(QD) 대신 공감 (DES-306)
//
// 구조 (RUBRIC-NUDGE-V8.md, 포맷 v2 — DES-304 선지 설계 v2):
//   생성  = { message(풀이→질문 흐름), choices[3](해석 방향 3분기) } — lib/nudgeV8Prompt.mjs 공용
//   채점  = 결정적 체커 F1~F5 (코드) + 차원 분리 judge J1·J2·J3 (각각 별도 콜)
//   분포  = J3가 분류한 level 집계로 L7=0 / L6≤20% / L2~L4≥70% 검사
//
// 사용: node eval/runNudgeV8.mjs              (gen=gpt-4o, judge=gpt-4o)
//       GEN_MODEL=gpt-4o-mini node eval/runNudgeV8.mjs   (앱 실모델로 생성 채점)
// 결과: eval/runs/nudge-v8-N.md / .json

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
import { scoreNudge } from './lib/judgesV8.mjs';
import { generateV8 } from './lib/nudgeV8Prompt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dirname);
const GEN_MODEL = process.env.GEN_MODEL || 'gpt-4o';
const EVAL_MODEL = process.env.EVAL_MODEL || 'gpt-4o';
const transport = openaiNodeTransport({});
const judge = (user) => transport({ user, temperature: 0, model: EVAL_MODEL });

const seed = JSON.parse(await readFile(resolve(__dirname, 'golden/seed-v1.json'), 'utf-8'));

// 테스트 대상 — proto와 동일 6개 (캘리브레이션 메모 2 + 책별 대표 4)
const TARGETS = [
  { bookId: 'isbn_9788937833663', page: 33 },
  { bookId: 'isbn_9788937833663', page: 166 },
  { bookId: 'isbn_9788932909349', page: 70 },
  { bookId: 'isbn_9788932909349', page: 432 },
  { bookId: 'isbn_9788952225122', page: 219 },
  { bookId: 'isbn_9788937473562', page: 147 },
];

// ─── 생성 — lib/nudgeV8Prompt.mjs 공용 (proto·캘리브레이션과 동일 코드 경로) ───
async function generate({ book, memo }) {
  const out = await generateV8({ transport, book, memo, model: GEN_MODEL });
  return { out, attempts: out ? 1 : 3 };
}

// 결정적 체커 + 차원 분리 judge — lib/judgesV8.mjs 공용 모듈 사용 (runJudgeCalibration.mjs와 동일 코드 경로)

// ─── 실행 ────────────────────────────────────────────────────────
async function nextRound() {
  const runsDir = resolve(__dirname, 'runs');
  if (!existsSync(runsDir)) return 1;
  const files = await readdir(runsDir);
  const nums = files.map(f => f.match(/^nudge-v8-(\d+)\.md$/)).filter(Boolean).map(m => Number(m[1]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}
const ROUND = await nextRound();
console.log(`▶ Nudge V8 Round ${ROUND} (gen=${GEN_MODEL}, judge=${EVAL_MODEL})`);

const results = [];
for (const t of TARGETS) {
  const book = seed.books.find(b => b.id === t.bookId);
  const memo = seed.memos.find(m => m.bookId === t.bookId && m.page === t.page);
  if (!book || !memo) { console.warn('  ⚠ 못 찾음:', t); continue; }
  console.log(`  [${book.title} p.${memo.page}] 생성...`);
  const { out, attempts } = await generate({ book, memo });
  if (!out) { results.push({ book, memo, out: null, attempts, det: null, j1: null, j2: null, j3: null, pass: false }); continue; }

  const scored = await scoreNudge({ out, memo, book, judge: (user) => judge(user) });
  results.push({ book, memo, out, attempts, ...scored });
}

// ─── D. 레벨 분포 ────────────────────────────────────────────────
const scored = results.filter(r => r.out);
const levels = scored.map(r => r.j3.level);
const lvlCount = levels.reduce((m, l) => (m[l] = (m[l] || 0) + 1, m), {});
const n = scored.length || 1;
const l7 = lvlCount.L7 || 0;
const l6 = lvlCount.L6 || 0;
const l24 = (lvlCount.L2 || 0) + (lvlCount.L3 || 0) + (lvlCount.L4 || 0);
const distPass = l7 === 0 && l6 / n <= 0.2 && l24 / n >= 0.7;

const genFails = results.filter(r => !r.out).length;
const roundPass = results.length > 0 && results.every(r => r.pass) && distPass && genFails === 0;

// ─── 리포트 ──────────────────────────────────────────────────────
const yn = (b) => (b ? '✅' : '❌');
const md = `# Nudge V8 Round ${ROUND} — 차원 분리 채점 (자극성 폐기)

> gen=\`${GEN_MODEL}\` / judge=\`${EVAL_MODEL}\` / DES-306. 루브릭: RUBRIC-NUDGE-V8.md
> J1 풀이정확도 · J2 공감 · J3 응용거리(+레벨) — 각 독립 콜. F1~F5 결정적 체커.

## 종합 판정: ${roundPass ? '✅ 합격' : '❌ 불합격'}

- 생성 실패: ${genFails}건 ${genFails ? '⚠️' : ''}
- 레벨 분포: ${distPass ? '✅' : '❌'} — L7=${l7}(허용0) / L6=${l6}(≤${Math.floor(n * 0.2)}) / L2~L4=${l24}/${n}(≥${Math.ceil(n * 0.7)})
- 분포 상세: ${Object.entries(lvlCount).sort().map(([k, v]) => `${k}:${v}`).join(' ') || '(없음)'}

| 책 p.# | F1 | F2 | F3 | F4 | F5 | J1 풀이 | J2 공감 | J3 선지 | lvl | — | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|
${results.map(r => r.out
  ? `| ${r.book.title.slice(0, 8)} p.${r.memo.page} | ${yn(r.det.F1)} | ${yn(r.det.F2)} | ${yn(r.det.F3)} | ${yn(r.det.F4)} | ${yn(r.det.F5)} | ${r.j1.score} | ${r.j2.score} | ${yn(!r.j3HasDefect)} | ${r.j3.level} | — | ${yn(r.pass)} |`
  : `| ${r.book.title.slice(0, 8)} p.${r.memo.page} | — | — | — | — | — | — | — | — | — | — | ❌생성실패 |`
).join('\n')}

---

${results.map(r => `
## ${r.book.title} p.${r.memo.page}

> 저장한 문장: "${r.memo.quote.slice(0, 110)}${r.memo.quote.length > 110 ? '…' : ''}"
${r.memo.myThought ? `> 💭 ${r.memo.myThought}` : ''}
${!r.out ? `\n**생성 실패** (${r.attempts}회 시도 후 빈/불완전 응답)\n` : `
**🔔 메시지** ${r.det.F2 && r.det.F3 ? '' : '⚠️형식'}
${r.out.message}

${r.out.choices.map(c => `- [ ${c} ]`).join('\n')}
- [ ✏️ 직접 입력 ]

**채점**
- J1 풀이정확도 ${r.j1.score}/2 — ${r.j1.reasoning}
- J2 공감 ${r.j2.score}/2 — ${r.j2.reasoning}
- J3 선지품질 ${r.j3HasDefect ? '❌결격' : '✅통과'} (${r.j3.level}) — ${[r.j3.quiz&&'quiz',r.j3.coreMiss&&'coreMiss',r.j3.disconnect&&'disconnect',r.j3.samefork&&'samefork',r.j3.forced&&'forced',r.j3.burden&&'burden'].filter(Boolean).join(',')||'없음'} — ${r.j3.reasoning}
- 결정적: ${Object.entries(r.det).filter(([k]) => k !== 'allPass').map(([k, v]) => `${k}${v ? '✓' : '✗'}`).join(' ')}
`}`).join('\n---\n')}
`;

const runsDir = resolve(__dirname, 'runs');
await mkdir(runsDir, { recursive: true });
await writeFile(resolve(runsDir, `nudge-v8-${ROUND}.md`), md, 'utf-8');
await writeFile(resolve(runsDir, `nudge-v8-${ROUND}.json`), JSON.stringify({
  round: ROUND, genModel: GEN_MODEL, evalModel: EVAL_MODEL, roundPass, distPass, lvlCount, genFails,
  results: results.map(r => ({ title: r.book.title, page: r.memo.page, out: r.out, det: r.det, j1: r.j1, j2: r.j2, j3: r.j3, pass: r.pass })),
}, null, 2), 'utf-8');

console.log(md);
console.log(`\n${roundPass ? '✅ 합격' : '❌ 불합격'} — runs/nudge-v8-${ROUND}.md`);
