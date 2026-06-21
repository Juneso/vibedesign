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
// J3 v3: 점수 채점이 아니라 결격 체크리스트 — 합·불 라벨이 점수 중앙 쏠림(1/1/1)으로 분리 불가능했던 문제 해소 (calib-4 중재)
export const J3_SCHEMA = {
  type: 'object',
  required: ['quiz', 'coreMiss', 'disconnect', 'samefork', 'forced', 'burden', 'level', 'reasoning'],
  properties: {
    quiz: { type: 'boolean' },        // 선지가 책 내용 확인 퀴즈·개념 요약 나열
    coreMiss: { type: 'boolean' },    // 선지가 문장의 핵심 논점(저장한 이유)에서 벗어남
    disconnect: { type: 'boolean' },  // 질문과 선지가 이어지지 않음
    samefork: { type: 'boolean' },    // 두 선지 이상이 같은 결 / 단순 긍정·부정·중립
    forced: { type: 'boolean' },      // 질문이 문장의 논점과 무관한 억지 연결
    burden: { type: 'boolean' },      // 답하려면 문장에서 뭔가를 또 찾아내야 하는 인지 부하 / 선지가 난해
    level: { enum: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'] },
    reasoning: { type: 'string' },
  },
};

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
독서 앱 넛지의 "마지막 질문 + 선택지 3개"를 **결격 사유 체크리스트**로 검사하고, 질문의 응용 거리 레벨을 분류한다.

[유저가 저장한 문장]
"${memo.quote}"
${memo.myThought ? `[유저가 함께 적은 생각]\n"${memo.myThought}"` : ''}

[메시지의 마지막 질문]
"${question || '(질문 없음)'}"
[선택지 3개]
${choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}

[설계 의도] 선택지는 "이 문장을 저장한 사람이 가졌을 법한 서로 다른 생각의 방향 3개"다.
정답이 없어야 하고, 고르는 행위가 자기표현이어야 한다.

[검사 절차]

STEP 1: 이 문장의 핵심 논점을 한 줄로 잡아라 — 유저가 *왜 이 문장을 저장했을지*. (적은 생각이 있으면 그것이 단서다.)

STEP 2: 아래 6가지 결격 사유를 각각 true/false로 판정하라. **해당하면 true**.
⚠️ **의심스러우면 true로 판정하라. 나쁜 넛지를 통과시키는 것이 좋은 넛지를 탈락시키는 것보다 훨씬 위험하다.**

  quiz — 선택지가 책 내용 확인 퀴즈·개념 요약 명사구 나열. 선지 3개가 문장의 키워드를 쪼개 놓은 것이면 true.
    나쁜 예: "기술과 전통의 갈등 / 디자인의 사회적 역할 / 장인의 가치 재발견" (문장 키워드를 명사구로 쪼갠 것)
    나쁜 예: "비판적 관점의 중요성 / 일상 속 디자인의 역할 / 디자인의 철학적 깊이" (문장 주제를 나열한 것)
    ⚠️ 단, 선지가 해석적 입장·가치 판단·태도를 나타내면 quiz가 아니다 (예: "잘 설명한다 / 뒤처진 주장이다 / 장인 정신이 핵심이다" → false. 이것은 입장 선택이지 퀴즈가 아님)

  coreMiss — 선택지가 STEP 1의 핵심 논점에서 벗어남. 풀이(message)가 표면적으로 맞아도, **선지가 저장한 이유의 핵심을 다루지 않으면 true**.
    핵심 테스트: "유저가 이 문장을 메모한 가장 큰 이유"와 "선지 3개가 탐색하는 주제"가 같은 것인가? 다르면 true.
    나쁜 예: 문장의 핵심이 "장인정신이 디자인의 뿌리"인데, 선지가 "과거의 가치 재조명 / 사회적 역할 / 기술과 예술의 조화" → true (피상적 요약이지 핵심이 아님)

  disconnect — 질문과 선택지가 이어지지 않음. 선택지가 질문의 **직접적인 답**이 아니면 true.
    나쁜 예: 질문 "이 씨앗이 어떤 방향으로 자라길 바라는 거야?" + 선지 "배려와 정직으로 충분하다 / 강렬함이 필요하다 / 둘의 조화" → true (질문은 방향을, 선지는 수단을 말함)
    나쁜 예: 질문 "어떤 부분이 가장 중요하다고 생각해?" + 선지 "목적에 맞는 규범 찾기 / 도덕적 책임의 우선순위 / 본질적 역할" → true (질문에 대한 답이 아니라 개념 나열)
    나쁜 예: 질문 "~라고 생각해?" (예/아니오형) + 선지가 이유·관점 나열 → true (질문은 동의 여부를 묻는데 선지는 다른 차원)

  samefork — 두 선택지 이상이 사실상 같은 결, 또는 단순 긍정·부정·중립 ("~에 동의한다 / ~에 동의하지 않는다 / 상황에 따라")
    나쁜 예: "무의미를 있는 그대로 받아들이기 / 무의미를 자연스럽게 수용하기" → 같은 결

  forced — 질문이 문장의 논점과 무관한 영역으로 억지 연결. 문장이 다루지 않는 분야(정치, 기술, 직업 등)로 점프하면 true.
    나쁜 예: 디자인 비평 문장에서 "정치나 기술 같은 다른 영역에도 적용될 수 있을까?" → true

  burden — 답하려면 문장을 다시 분석해야 하거나, 선지가 추상적이어서 무슨 뜻인지 한번에 안 읽히면 true.
    나쁜 예: "이런 생각이 어디서 가장 잘 드러난다고 느꼈어?" (문장 속에서 뭔가를 또 찾아야 함)
    나쁜 예: "목적에 맞는 규범 찾기 / 도덕적 책임의 우선순위 / 사회제도의 본질적 역할" (너무 어려움)

⚠️ 거리(레벨)는 그 자체로 결격 사유가 아니다. L6~L7이어도 문장의 논점에서 자연스럽게 이어지면 결격 아님. 억지일 때만 forced=true.

STEP 3: 레벨 분류
L1 순수 풀이 / L2 풀이+마음짚기 / L3 문장 안에서 묻기 / L4 같은 책 맥락 반걸음 /
L5 보편 일상 반걸음 / L6 유저 직업·삶 한 걸음 / L7 전이·반론(책 밖 적용·뒤집기)

reasoning에는 true로 판정한 사유만 간결하게 적어라. 전부 false면 "결격 없음"으로.
JSON만: ${JSON.stringify(J3_SCHEMA)}
  `.trim();
}

// ─── D. 넛지 1개 채점 (체커 + 3 judge 병렬) ──────────────────────
// judge: ({user}) => Promise<string raw JSON>
export async function scoreNudge({ out, memo, book, judge }) {
  const det = deterministicChecks(out, book);
  const { body, question } = splitMessage(out.message);
  // 파싱 방어: 스키마 따라그림 언래핑 + score 숫자 검증. 실패 시 1회 재호출.
  const parseScore = (raw) => {
    try {
      let o = JSON.parse(raw);
      if (o && typeof o.score !== 'number' && o.properties && typeof o.properties.score === 'number') o = o.properties;
      return typeof o?.score === 'number' ? o : null;
    } catch { return null; }
  };
  const parseJ3 = (raw) => {
    try {
      let o = JSON.parse(raw);
      if (o && o.properties && typeof o.properties.quiz === 'boolean') o = o.properties;
      return typeof o?.quiz === 'boolean' ? o : null;
    } catch { return null; }
  };
  const callJudge = async (prompt, fb, parseFn) => {
    for (let i = 0; i < 2; i++) {
      const o = (parseFn || parseScore)(await judge(prompt));
      if (o) return o;
    }
    return fb;
  };
  const J3_FAIL = { quiz: true, coreMiss: true, disconnect: false, samefork: false, forced: false, burden: false, level: 'L7', reasoning: '(judge 2회 실패)' };
  const [j1, j2, j3] = await Promise.all([
    callJudge(j1Prompt({ memo, body }), { score: 0, reasoning: '(judge 2회 실패)' }),
    callJudge(j2Prompt({ memo, body }), { score: 0, reasoning: '(judge 2회 실패)' }),
    callJudge(j3Prompt({ memo, question, choices: out.choices }), J3_FAIL, parseJ3),
  ]);
  const j3HasDefect = j3.quiz || j3.coreMiss || j3.disconnect || j3.samefork || j3.forced;
  const pass = det.allPass && j1.score >= 1 && j2.score >= 1 && !j3HasDefect;
  return { det, j1, j2, j3, j3HasDefect, pass };
}
