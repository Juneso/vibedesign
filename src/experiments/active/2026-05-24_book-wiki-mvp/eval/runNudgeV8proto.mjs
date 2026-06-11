// 넛지 V8 프로토타입 — 2층 구조 + 원터치 3선택지 (DES-301)
//
// 구조 (RUBRIC-NUDGE-LEVELS.md):
//   1층 알림   = L2 해석 — 적은 문장 풀이 + 마음 짚기. 질문 없음. 그 자체로 완결.
//   2층 질문   = L4 — 책 맥락 반걸음. 짧고 명확.
//   답변      = 서로 다른 읽기 3개 (원터치 칩) + 직접 입력(보너스)
//
// 사용: node eval/runNudgeV8proto.mjs   (기본 gpt-4o)
// 결과: eval/runs/nudge-v8-proto-N.md + 콘솔

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dirname);
const MODEL = process.env.GEN_MODEL || 'gpt-4o';
const transport = openaiNodeTransport({ model: MODEL });

const seed = JSON.parse(await readFile(resolve(__dirname, 'golden/seed-v1.json'), 'utf-8'));

// 테스트 대상: 캘리브레이션 메모 2개 + 책별 대표 4개
const TARGETS = [
  { bookId: 'isbn_9788937833663', page: 33 },   // 샌델 — 시장은 판단하지 않는다
  { bookId: 'isbn_9788937833663', page: 166 },  // 샌델 — 자선기금 (💭, 캘리브레이션 A)
  { bookId: 'isbn_9788932909349', page: 70 },   // 조르바 — 죽음 (캘리브레이션 B)
  { bookId: 'isbn_9788932909349', page: 432 },  // 조르바 — 추상 개념으로 도피
  { bookId: 'isbn_9788952225122', page: 219 },  // 하라 켄야 — 두통약 (💭)
  { bookId: 'isbn_9788937473562', page: 147 },  // 쿤데라 — 무의미를 사랑하라 (💭)
];

const V8_SCHEMA = {
  type: 'object',
  required: ['interpretation', 'question', 'choices'],
  properties: {
    interpretation: { type: 'string' },  // 1층: L2 해석, 1~2문장, 질문 없음
    question: { type: 'string' },        // 2층: L4 질문, 1문장
    choices: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
  },
};

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

2. **question (2층)**: 해석을 읽고 펼친 사람에게 던지는 질문 1문장.
   - 묻는 것은 단 하나다: **유저가 이 문장을 어느 방향으로 읽었는가.** ("너는 어느 쪽에 가까웠어?", "이 문장이 너한테는 뭐였어?"의 변주)
   - 또는 문장이 가르는 갈림길을 직접 묻기 ("어떨 때는 벌금이고 어떨 때는 요금일까?"처럼 택일을 자연스럽게 요구하는 형태).
   - **책 내용 확인 퀴즈 금지** ("~의 기원은 무엇인가?" X). 유저의 직업·일상으로 끌고 가지 말 것. 문장의 논점 밖 금지.
   - choices 3개가 이 질문의 직접적인 답이 되어야 한다. 질문 따로 선지 따로면 실패.

3. **choices (선지 3개 = 해석 방향 3분기)**: 이 문장을 저장한 사람이 가졌을 법한 **서로 다른 생각의 방향** 3개.
   - 정답이 없어야 한다. 책 내용 요약·사실 확인이 아니라 "내 생각이 뭐였을지"의 후보다. 고르는 행위가 자기표현이 되도록.
   - **3개의 방향이 실제로 갈라져야 한다.** 두 개가 같은 결이면 실패. (방향 분기의 예: 수용 vs 해방 vs 초월 / 비판 vs 옹호 vs 재정의)
   - 단순 긍정/부정/중립 금지 ("도움이 된다 / 안 된다 / 상황에 따라" X). 각 선지는 구체적 관점을 담은 짧은 문장.
   - 각 10~25자. 칩 버튼에 들어갈 길이.
   - 좋은 예 1 (무의미를 사랑하라는 문장): "삶의 모든 무의미를 인정하고 돌보는 것" / "의미에의 집착에서 벗어나는 것" / "의미를 극복했을 때 만나는 더 큰 의미"
   - 좋은 예 2 (시장은 판단하지 않는다는 문장): "모든 가치를 획일화하는 게 문제" / "가치 판단을 소통 가능하게 하는 장점" / "중립이 아니라 판단의 회피"
   - 나쁜 예: "줄서기 규범 / 기부의 의미 / 교육의 가치" (책 퀴즈), "기술이 혁신한다 / 전통이 중요하다 / 균형이 필요하다" (당연한 말 나열)

[출력 형식 — 정확히 이 모양의 JSON만]
{"interpretation": "해석 1~2문장", "question": "질문 1문장", "choices": ["읽기1", "읽기2", "읽기3"]}
  `.trim();
}

async function nextRound() {
  const runsDir = resolve(__dirname, 'runs');
  if (!existsSync(runsDir)) return 1;
  const files = await readdir(runsDir);
  const nums = files.map(f => f.match(/^nudge-v8-proto-(\d+)\.md$/)).filter(Boolean).map(m => Number(m[1]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}
const ROUND = await nextRound();
console.log(`▶ Nudge V8 Proto Round ${ROUND} (model=${MODEL})`);

const results = [];
for (const t of TARGETS) {
  const book = seed.books.find(b => b.id === t.bookId);
  const memo = seed.memos.find(m => m.bookId === t.bookId && m.page === t.page);
  if (!book || !memo) { console.warn('  ⚠ 못 찾음:', t); continue; }
  console.log(`  [${book.title} p.${memo.page}] 생성 중...`);
  let out = null;
  for (let attempt = 0; attempt < 3 && !out?.interpretation; attempt++) {
    if (attempt > 0) console.log(`    ↻ 재시도 ${attempt} (빈 응답/파싱 실패)`);
    const raw = await transport({ user: v8Prompt({ book, memo }), temperature: 0.4 + attempt * 0.1 });
    try { out = JSON.parse(raw); } catch { out = { _parseError: String(raw).slice(0, 150) }; }
    // 방어: 모델이 스키마 구조를 따라 그린 경우 properties 언래핑
    if (!out.interpretation && out.properties?.interpretation) out = out.properties;
  }
  results.push({ book, memo, out });
}

const md = `# Nudge V8 Proto Round ${ROUND} — 2층 구조 + 원터치 3선택지

> model=\`${MODEL}\` / DES-301 / 구조: 알림(L2 해석) → 펼침(L4 질문 + 선택지 3개)

${results.map(({ book, memo, out }) => `
## ${book.title} p.${memo.page}

> 저장한 문장: "${memo.quote.slice(0, 120)}${memo.quote.length > 120 ? '…' : ''}"
${memo.myThought ? `> 💭 ${memo.myThought}` : ''}

**🔔 알림 (1층)**
${out.interpretation || '_(실패: ' + (out._parseError || '') + ')_'}

**👆 펼치면 (2층)**
${out.question || ''}

${(out.choices || []).map((c, i) => `- [ ${c} ]`).join('\n')}
- [ ✏️ 직접 입력 ]
`).join('\n---\n')}
`;

const runsDir = resolve(__dirname, 'runs');
await mkdir(runsDir, { recursive: true });
const mdPath = resolve(runsDir, `nudge-v8-proto-${ROUND}.md`);
await writeFile(mdPath, md, 'utf-8');
console.log(md);
console.log(`✓ ${mdPath}`);
