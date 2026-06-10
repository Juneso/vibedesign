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
