// 넛지 V8 채점 eval — 자극성(QD) 대신 공감 (DES-306)
//
// 구조 (RUBRIC-NUDGE-V8.md):
//   생성  = V8 2층 출력 { interpretation, question, choices[3] } (runNudgeV8proto.mjs 와 동일 프롬프트)
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
import { NUDGE_BANNED_RE } from '../lib/llm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dirname);
const GEN_MODEL = process.env.GEN_MODEL || 'gpt-4o';
const EVAL_MODEL = process.env.EVAL_MODEL || 'gpt-4o';
const transport = openaiNodeTransport({});
const gen = (user, temperature) => transport({ user, temperature, model: GEN_MODEL });
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

// ─── 생성 (proto와 동일 프롬프트) ────────────────────────────────
function v8Prompt({ book, memo }) {
  return `
당신은 독서 기록 앱의 넛지 작성자다. 유저가 책에서 직접 옮겨 적은 문장을 다시 마주치게 해주는 알림을 만든다.
유저는 "${book.title}" (${book.author}) 를 읽으며 아래 문장을 저장했다.

[저장한 문장]
"${memo.quote}"
${memo.myThought ? `\n[유저가 함께 적은 생각]\n"${memo.myThought}"` : ''}

[만들 것 — 3가지]

1. **interpretation (1층 알림, L2)**: 저장한 문장을 더 쉬운 말로 풀어주는 해석 1~2문장.
   - 유저가 이 글을 읽으면 "내가 왜 이 문장에 밑줄 쳤는지 이 앱이 안다"고 느껴야 한다.
   - 유저가 적은 생각이 있으면 그 관점을 자연스럽게 반영해 풀이하라 (그대로 복창은 금지).
   - 질문 금지. 차분한 구어체 ("~라는 얘기야", "~라는 거지"). 끝까지 평서문.
   - 과장·자극 금지: "무섭다", "서늘하다", "충격적" 같은 감정 증폭 표현 X.
   - 금지어: 흥미, 인상, 탐구, ~해보면 좋겠어.

2. **question (2층, L4)**: 해석을 읽고 펼친 사람에게만 보이는 질문 1문장.
   - 같은 책의 맥락에서 반걸음만 — 문장이 다루는 주제 안에서, 한 번 더 생각하면 답할 수 있는 것.
   - 유저의 직업·일상으로 끌고 가지 말 것. 책 밖 전이 금지.
   - 짧고 명확하게. 수식어 최소.

3. **choices (원터치 답변 3개)**: 질문에 대한 "서로 다른 읽기/입장" 3개.
   - 정답 후보가 아니다. 셋 다 말이 되고, 고르는 행위가 자기표현이 되어야 한다.
   - 서로 명확히 구분되는 각도 (예: 동의하되 다른 이유 / 부분 동의 / 다른 해석).
   - 각 8~25자. 칩 버튼에 들어갈 길이. "~인 것 같다" 같은 군더더기 어미 줄이기.
   - 유저가 생각해본 적 없던 읽기가 최소 1개 섞이면 좋다.

[출력 형식 — 정확히 이 모양의 JSON만]
{"interpretation": "해석 1~2문장", "question": "질문 1문장", "choices": ["읽기1", "읽기2", "읽기3"]}
  `.trim();
}

async function generate({ book, memo }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const raw = await gen(v8Prompt({ book, memo }), 0.4 + attempt * 0.15);
    let out; try { out = JSON.parse(raw); } catch { out = null; }
    if (out && !out.interpretation && out.properties?.interpretation) out = out.properties; // 스키마 따라그림 방어
    if (out?.interpretation && out?.question && Array.isArray(out?.choices)) return { out, attempts: attempt + 1 };
    if (attempt > 0) console.log(`    ↻ 재시도 ${attempt} (빈/불완전 응답)`);
  }
  return { out: null, attempts: 4 };
}

// ─── A. 결정적 체커 F1~F5 ────────────────────────────────────────
const EMO_AMP_RE = /무섭|서늘|충격|소름|오싹|섬뜩/;
const sentenceCount = (s) => (s.match(/[.?!。]/g) || []).length || 1;

function deterministicChecks({ interpretation = '', question = '', choices = [] }, book) {
  const f1 = choices.length === 3 && choices.every(c => { const n = [...c.trim()].length; return n >= 4 && n <= 28; });
  const f2 = !interpretation.includes('?') && sentenceCount(interpretation) <= 2;
  const f3 = question.trim().endsWith('?') && sentenceCount(question) <= 1;
  const text = `${interpretation} ${question}`;
  const f4 = !NUDGE_BANNED_RE.test(text) && !EMO_AMP_RE.test(text);
  const titleRe = new RegExp(`${book.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|p\\.?\\s*\\d|페이지|이 책`);
  const f5 = !titleRe.test(text);
  return { F1: f1, F2: f2, F3: f3, F4: f4, F5: f5, allPass: f1 && f2 && f3 && f4 && f5 };
}

// ─── B. 차원 분리 judge ──────────────────────────────────────────
const SCORE_SCHEMA = { type: 'object', required: ['score', 'reasoning'], properties: { score: { enum: [0, 1, 2] }, reasoning: { type: 'string' } } };

function j1Prompt({ memo, interpretation }) {
  return `
독서 앱 넛지의 "해석(interpretation)" 한 덩어리를 **풀이 정확도** 단 하나의 축으로만 채점한다.
다른 건 보지 말 것 — 공감/문체/재미는 채점 대상 아님.

[유저가 저장한 문장]
"${memo.quote}"

[채점할 해석]
"${interpretation}"

[축 — 풀이 정확도] 저장한 문장을 정확히 풀었는가. 문장에 없는 내용을 사실처럼 더하지 않았는가.
- 2 = 문장의 뜻을 정확히 풀이. 저장한 문장으로 모두 역추적 가능, 원문에 없는 추론 0건.
- 1 = 대체로 맞으나 일부 비약·과잉 일반화.
- 0 = 오독, 또는 문장에 없는 내용을 사실처럼 단정.

JSON만: ${JSON.stringify(SCORE_SCHEMA)}
  `.trim();
}

function j2Prompt({ memo, interpretation }) {
  return `
독서 앱 넛지의 "해석(interpretation)"을 **공감(마음 짚기)** 단 하나의 축으로만 채점한다.
풀이가 사실로 정확한지는 보지 말 것 — 오직 "유저의 마음을 짚었는가"만.

[유저가 저장한 문장]
"${memo.quote}"
${memo.myThought ? `[유저가 함께 적은 생각]\n"${memo.myThought}"` : '[함께 적은 생각 없음]'}

[채점할 해석]
"${interpretation}"

[축 — 공감] 유저가 왜 이 문장에 밑줄 쳤는지 마음을 짚었는가. 복창이 아니라 한 걸음 더.
- 2 = 밑줄 친 마음을 짚음. 적은 생각이 있으면 복창이 아닌 한 걸음으로 반영.
- 1 = 무난한 풀이에 그침. 공감은 약하나 어긋나진 않음.
- 0 = 마음과 어긋남, myThought 그대로 복창, 또는 자극적·평가적.

JSON만: ${JSON.stringify(SCORE_SCHEMA)}
  `.trim();
}

const J3_SCHEMA = { type: 'object', required: ['score', 'level', 'reasoning'], properties: { score: { enum: [0, 1, 2] }, level: { enum: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'] }, reasoning: { type: 'string' } } };

function j3Prompt({ memo, question, choices }) {
  return `
독서 앱 넛지의 "질문 + 선택지 3개"를 **응용 거리 적정성** 축으로만 채점하고, 레벨을 분류한다.

[유저가 저장한 문장]
"${memo.quote}"

[질문]
"${question}"
[선택지 3개]
${choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}

[레벨 정의 — 질문이 책에서 얼마나 멀어졌나]
L1 순수 풀이 / L2 풀이+마음짚기 / L3 문장 안에서 묻기 / L4 같은 책 맥락 반걸음 /
L5 보편 일상 반걸음 / L6 유저 직업·삶 한 걸음 / L7 전이·반론(책 밖 적용·뒤집기)

[축 — 응용 거리 적정성]
- 2 = L2~L4 (문장 안~책 맥락 반걸음). 선택지 3개가 서로 다른 "읽기/입장"으로 자기표현, 정답형 아님.
- 1 = L5까지 나감, 또는 선택지 중 1개가 정답형/유도형.
- 0 = L6~L7(책 밖), 또는 선택지가 사실상 동형.

level 은 질문의 실제 거리로 분류해 반환.
JSON만: ${JSON.stringify(J3_SCHEMA)}
  `.trim();
}

async function judgeJSON(user, fallback) {
  const raw = await judge(user);
  try { return JSON.parse(raw); } catch { return fallback; }
}

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

  const det = deterministicChecks(out, book);
  const [j1, j2, j3] = await Promise.all([
    judgeJSON(j1Prompt({ memo, interpretation: out.interpretation }), { score: 0, reasoning: '(judge 실패)' }),
    judgeJSON(j2Prompt({ memo, interpretation: out.interpretation }), { score: 0, reasoning: '(judge 실패)' }),
    judgeJSON(j3Prompt({ memo, question: out.question, choices: out.choices }), { score: 0, level: 'L7', reasoning: '(judge 실패)' }),
  ]);
  const judgeMin = Math.min(j1.score, j2.score, j3.score);
  const judgeAvg = (j1.score + j2.score + j3.score) / 3;
  const pass = det.allPass && judgeMin >= 1 && judgeAvg >= 1.5;
  results.push({ book, memo, out, attempts, det, j1, j2, j3, judgeAvg, pass });
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

| 책 p.# | F1 | F2 | F3 | F4 | F5 | J1 풀이 | J2 공감 | J3 거리 | lvl | 평균 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|
${results.map(r => r.out
  ? `| ${r.book.title.slice(0, 8)} p.${r.memo.page} | ${yn(r.det.F1)} | ${yn(r.det.F2)} | ${yn(r.det.F3)} | ${yn(r.det.F4)} | ${yn(r.det.F5)} | ${r.j1.score} | ${r.j2.score} | ${r.j3.score} | ${r.j3.level} | ${r.judgeAvg.toFixed(2)} | ${yn(r.pass)} |`
  : `| ${r.book.title.slice(0, 8)} p.${r.memo.page} | — | — | — | — | — | — | — | — | — | — | ❌생성실패 |`
).join('\n')}

---

${results.map(r => `
## ${r.book.title} p.${r.memo.page}

> 저장한 문장: "${r.memo.quote.slice(0, 110)}${r.memo.quote.length > 110 ? '…' : ''}"
${r.memo.myThought ? `> 💭 ${r.memo.myThought}` : ''}
${!r.out ? `\n**생성 실패** (${r.attempts}회 시도 후 빈/불완전 응답)\n` : `
**🔔 알림 (1층)** ${r.det.F2 ? '' : '⚠️형식'}
${r.out.interpretation}

**👆 질문 (2층)** ${r.det.F3 ? '' : '⚠️형식'}
${r.out.question}

${r.out.choices.map(c => `- [ ${c} ]`).join('\n')}
- [ ✏️ 직접 입력 ]

**채점**
- J1 풀이정확도 ${r.j1.score}/2 — ${r.j1.reasoning}
- J2 공감 ${r.j2.score}/2 — ${r.j2.reasoning}
- J3 응용거리 ${r.j3.score}/2 (${r.j3.level}) — ${r.j3.reasoning}
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
