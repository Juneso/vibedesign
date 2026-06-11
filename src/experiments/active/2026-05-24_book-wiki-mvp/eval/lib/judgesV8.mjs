// V8 채점 공용 모듈 — 결정적 체커 F1~F5 + 차원 분리 judge J1·J2·J3 (DES-306/DES-302)
//
// 포맷 v2 (2026-06-11, DES-304 선지 설계 v2): 넛지 = { message, choices[3] }
//   message = 풀이→질문이 흐르는 2~3문장 (질문은 마지막 한 문장, 단 하나)
//   choices = 해석 방향 3분기 (정답 없음, 자기표현)
// runNudgeV8.mjs(운영 eval)와 runJudgeCalibration.mjs(일치율 측정)가 같은 judge를 쓰도록 단일화.
// 루브릭 단일 진실: RUBRIC-NUDGE-V8.md

import { NUDGE_BANNED_RE } from '../../lib/llm.js';

// ─── A. message 분해 ─────────────────────────────────────────────
export const EMO_AMP_RE = /무섭|서늘|충격|소름|오싹|섬뜩/;
export const splitSentences = (s) => (s || '').split(/(?<=[.?!。])\s+/).filter(x => x.trim());

// 풀이(body)와 마지막 질문(question)으로 분해
export function splitMessage(message = '') {
  const sents = splitSentences(message);
  const last = sents[sents.length - 1] || '';
  if (last.trim().endsWith('?')) return { body: sents.slice(0, -1).join(' '), question: last.trim() };
  return { body: message, question: '' };
}

// ─── B. 결정적 체커 F1~F5 ────────────────────────────────────────
export function deterministicChecks({ message = '', choices = [] }, book) {
  const sents = splitSentences(message);
  const qMarks = (message.match(/\?/g) || []).length;
  const lastIsQ = sents.length > 0 && sents[sents.length - 1].trim().endsWith('?');
  const f1 = choices.length === 3 && choices.every(c => { const n = [...c.trim()].length; return n >= 4 && n <= 28; });
  const f2 = qMarks === 1 && lastIsQ;                       // 질문은 마지막 한 문장, 단 하나
  const f3 = sents.length >= 2 && sents.length <= 4;        // 흐르는 2~3문장 (+질문 포함 최대 4)
  const f4 = !NUDGE_BANNED_RE.test(message) && !EMO_AMP_RE.test(message);
  const titleRe = new RegExp(`${book.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|p\\.?\\s*\\d|페이지|이 책`);
  const f5 = !titleRe.test(message);
  return { F1: f1, F2: f2, F3: f3, F4: f4, F5: f5, allPass: f1 && f2 && f3 && f4 && f5 };
}

// ─── C. 차원 분리 judge 프롬프트 ─────────────────────────────────
export const SCORE_SCHEMA = { type: 'object', required: ['score', 'reasoning'], properties: { score: { enum: [0, 1, 2] }, reasoning: { type: 'string' } } };
export const J3_SCHEMA = { type: 'object', required: ['score', 'level', 'reasoning'], properties: { score: { enum: [0, 1, 2] }, level: { enum: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'] }, reasoning: { type: 'string' } } };

export function j1Prompt({ memo, body }) {
  return `
독서 앱 넛지 메시지의 풀이 부분을 **풀이 정확도** 단 하나의 축으로만 채점한다.
다른 건 보지 말 것 — 공감/문체/재미는 채점 대상 아님.

[유저가 저장한 문장]
"${memo.quote}"

[채점할 풀이]
"${body}"

[축 — 풀이 정확도] 저장한 문장을 정확히 풀었는가. 문장에 없는 내용을 사실처럼 더하지 않았는가.
- 2 = 문장의 뜻을 정확히 풀이. 저장한 문장으로 모두 역추적 가능, 원문에 없는 추론 0건.
- 1 = 대체로 맞으나 일부 비약·과잉 일반화.
- 0 = 오독, 또는 문장에 없는 내용을 사실처럼 단정.

JSON만: ${JSON.stringify(SCORE_SCHEMA)}
  `.trim();
}

export function j2Prompt({ memo, body }) {
  return `
독서 앱 넛지 메시지의 풀이 부분을 **공감(마음 짚기)** 단 하나의 축으로만 채점한다.
풀이가 사실로 정확한지는 보지 말 것 — 오직 "유저의 마음을 짚었는가"만.

[유저가 저장한 문장]
"${memo.quote}"
${memo.myThought ? `[유저가 함께 적은 생각]\n"${memo.myThought}"` : '[함께 적은 생각 없음]'}

[채점할 풀이]
"${body}"

[축 — 공감] 유저가 왜 이 문장에 밑줄 쳤는지 마음을 짚었는가. 복창이 아니라 한 걸음 더.
- 2 = 밑줄 친 마음을 짚음. 적은 생각이 있으면 복창이 아닌 한 걸음으로 반영.
- 1 = 무난한 풀이에 그침. 공감은 약하나 어긋나진 않음.
- 0 = 마음과 어긋남, myThought 그대로 복창, 또는 자극적·평가적.

JSON만: ${JSON.stringify(SCORE_SCHEMA)}
  `.trim();
}

export function j3Prompt({ memo, question, choices }) {
  return `
독서 앱 넛지의 "마지막 질문 + 선택지 3개"를 **질문·선지 품질** 축으로 채점하고, 질문의 응용 거리 레벨을 분류한다.

[유저가 저장한 문장]
"${memo.quote}"

[메시지의 마지막 질문]
"${question || '(질문 없음)'}"
[선택지 3개]
${choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}

[설계 의도] 선택지는 "이 문장을 저장한 사람이 가졌을 법한 서로 다른 생각의 방향 3개"다.
정답이 없어야 하고, 고르는 행위가 자기표현이어야 한다.

[레벨 정의 — 질문이 책에서 얼마나 멀어졌나]
L1 순수 풀이 / L2 풀이+마음짚기 / L3 문장 안에서 묻기 / L4 같은 책 맥락 반걸음 /
L5 보편 일상 반걸음 / L6 유저 직업·삶 한 걸음 / L7 전이·반론(책 밖 적용·뒤집기)

[축 — 질문·선지 품질]
- 2 = 질문이 L2~L4이고, 선택지 3개가 서로 다른 해석 방향(같은 결 없음, 정답 없음)이며, 질문의 직접적인 답이 됨.
- 1 = 다음 중 하나: 질문이 L5 / 선택지 중 1개가 정답형·유도형 / 두 선택지가 비슷한 결 / 질문과 선지가 살짝 어긋남.
- 0 = 다음 중 하나: 질문이 L6~L7(책 밖·억지 연결) / 선택지가 책 내용 확인 퀴즈·요약 나열 / 단순 긍정·부정·중립 / 사실상 동형.

level 은 질문의 실제 거리로 분류해 반환.
JSON만: ${JSON.stringify(J3_SCHEMA)}
  `.trim();
}

// ─── D. 넛지 1개 채점 (체커 + 3 judge 병렬) ──────────────────────
// judge: ({user}) => Promise<string raw JSON>
export async function scoreNudge({ out, memo, book, judge }) {
  const det = deterministicChecks(out, book);
  const { body, question } = splitMessage(out.message);
  const parse = (raw, fb) => { try { return JSON.parse(raw); } catch { return fb; } };
  const [j1, j2, j3] = await Promise.all([
    judge(j1Prompt({ memo, body })).then(r => parse(r, { score: 0, reasoning: '(judge 실패)' })),
    judge(j2Prompt({ memo, body })).then(r => parse(r, { score: 0, reasoning: '(judge 실패)' })),
    judge(j3Prompt({ memo, question, choices: out.choices })).then(r => parse(r, { score: 0, level: 'L7', reasoning: '(judge 실패)' })),
  ]);
  const judgeMin = Math.min(j1.score, j2.score, j3.score);
  const judgeAvg = (j1.score + j2.score + j3.score) / 3;
  const pass = det.allPass && judgeMin >= 1 && judgeAvg >= 1.5;
  return { det, j1, j2, j3, judgeAvg, pass };
}
