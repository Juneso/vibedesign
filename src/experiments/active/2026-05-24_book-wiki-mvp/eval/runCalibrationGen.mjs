// 캘리브레이션 셋 생성기 — judge ↔ 내 판정 일치율 측정용 (DES-302)
//
// 의도적으로 합격·불합격이 섞이도록 변형 축을 깔아 40건 생성:
//   std   ×20 — 정상 V8 프롬프트 (합격 기대)
//   push  ×10 — 질문을 L5/L6/L7로 밀기 (응용 거리 불합격 기대)
//   break ×10 — 공감 파괴: myThought 복창(echo) / 건조 요약(flat) (J2 불합격 기대)
//
// 변형 메타데이터는 golden/calib-set-v1.json 에만 저장 (블라인드 —
// 라벨링 시트에도, judge에게도 노출되지 않음).
//
// 출력:
//   golden/calib-set-v1.json      — 전체 셋 + 숨김 메타 (Junseo는 라벨링 끝까지 보지 말 것)
//   runs/calib-labeling-sheet.md  — 블라인드 라벨링 시트 (셔플 순서, 판정/이유 빈칸)
//
// 사용: node eval/runCalibrationGen.mjs   (기본 gpt-4o)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dirname);
const MODEL = process.env.GEN_MODEL || 'gpt-4o';
const transport = openaiNodeTransport({ model: MODEL });

const seed = JSON.parse(await readFile(resolve(__dirname, 'golden/seed-v1.json'), 'utf-8'));

// ─── 메모 10개 선정 (책별 분산, myThought 있는 메모 우선) ────────
function pickMemos() {
  const perBook = [3, 3, 2, 2]; // 4책 × 합 10
  const picked = [];
  seed.books.forEach((book, bi) => {
    const ms = seed.memos.filter(m => m.bookId === book.id);
    const withT = ms.filter(m => m.myThought);
    const withoutT = ms.filter(m => !m.myThought);
    const want = perBook[bi] ?? 2;
    // myThought 있는 것 우선, 단 책마다 없는 것도 1개 포함 (J2 "생각 없음" 케이스 캘리브레이션)
    const sel = [...withT.slice(0, want - 1), ...withoutT.slice(0, 1), ...withT.slice(want - 1)].slice(0, want);
    sel.forEach(m => picked.push({ book, memo: m }));
  });
  return picked;
}

// ─── 프롬프트 — 변형 축 ──────────────────────────────────────────
const BASE_INTERP = `1. **interpretation (1층 알림, L2)**: 저장한 문장을 더 쉬운 말로 풀어주는 해석 1~2문장.
   - 유저가 이 글을 읽으면 "내가 왜 이 문장에 밑줄 쳤는지 이 앱이 안다"고 느껴야 한다.
   - 유저가 적은 생각이 있으면 그 관점을 자연스럽게 반영해 풀이하라 (그대로 복창은 금지).
   - 질문 금지. 차분한 구어체 ("~라는 얘기야", "~라는 거지"). 끝까지 평서문.
   - 과장·자극 금지: "무섭다", "서늘하다", "충격적" 같은 감정 증폭 표현 X.
   - 금지어: 흥미, 인상, 탐구, ~해보면 좋겠어.`;

const BASE_QUESTION = `2. **question (2층, L4)**: 해석을 읽고 펼친 사람에게만 보이는 질문 1문장.
   - 같은 책의 맥락에서 반걸음만 — 문장이 다루는 주제 안에서, 한 번 더 생각하면 답할 수 있는 것.
   - 유저의 직업·일상으로 끌고 가지 말 것. 책 밖 전이 금지.
   - 짧고 명확하게. 수식어 최소.`;

const VARIANTS = {
  std: { interp: BASE_INTERP, question: BASE_QUESTION, extra: '' },
  pushL5: {
    interp: BASE_INTERP,
    question: `2. **question (2층)**: 해석을 읽고 펼친 사람에게 보이는 질문 1문장.
   - 책을 떠나, 누구에게나 있을 법한 보편적 일상 장면으로 연결해 물어라.
   - 짧고 명확하게.`,
    extra: '',
  },
  pushL6: {
    interp: BASE_INTERP,
    question: `2. **question (2층)**: 해석을 읽고 펼친 사람에게 보이는 질문 1문장.
   - 유저의 직업·일상 상황으로 직접 끌고 가서 물어라. ("당신의 일에서..", "디자인 작업에서..")
   - 짧고 명확하게.`,
    extra: '\n[유저 프로필]\n토스증권에서 일하는 프로덕트 디자이너. 의사결정과 커뮤니케이션을 고민한다.\n',
  },
  pushL7: {
    interp: BASE_INTERP,
    question: `2. **question (2층)**: 해석을 읽고 펼친 사람에게 보이는 질문 1문장.
   - 문장을 뒤집거나(반론), 전혀 다른 영역(정치·기술·회사 문화 등)에 적용해보는 도발적 질문을 만들라.
   - 짧고 명확하게.`,
    extra: '',
  },
  echo: {
    interp: `1. **interpretation (1층 알림)**: 해석 1~2문장.
   - 유저가 적은 생각이 있으면 그 문장을 거의 그대로, 어순만 살짝 바꿔 다시 말해줘라.
   - 적은 생각이 없으면 저장한 문장을 짧게 줄여 반복하라.
   - 질문 금지. 평서문.`,
    question: BASE_QUESTION,
    extra: '',
  },
  flat: {
    interp: `1. **interpretation (1층 알림)**: 해석 1~2문장.
   - 국어사전이나 교과서처럼 건조하고 일반론적으로 요약하라.
   - 유저의 마음, 밑줄 친 이유, 적은 생각은 일절 언급하지 말라.
   - 질문 금지. 평서문. ("~이다" 체)`,
    question: BASE_QUESTION,
    extra: '',
  },
};

function calibPrompt({ book, memo, variant }) {
  const v = VARIANTS[variant];
  return `
당신은 독서 기록 앱의 넛지 작성자다. 유저가 책에서 직접 옮겨 적은 문장을 다시 마주치게 해주는 알림을 만든다.
유저는 "${book.title}" (${book.author}) 를 읽으며 아래 문장을 저장했다.
${v.extra}
[저장한 문장]
"${memo.quote}"
${memo.myThought ? `\n[유저가 함께 적은 생각]\n"${memo.myThought}"` : ''}

[만들 것 — 3가지]

${v.interp}

${v.question}

3. **choices (원터치 답변 3개)**: 질문에 대한 "서로 다른 읽기/입장" 3개.
   - 정답 후보가 아니다. 셋 다 말이 되고, 고르는 행위가 자기표현이 되어야 한다.
   - 서로 명확히 구분되는 각도. 각 8~25자. 칩 버튼에 들어갈 길이.

[출력 형식 — 정확히 이 모양의 JSON만]
{"interpretation": "해석 1~2문장", "question": "질문 1문장", "choices": ["읽기1", "읽기2", "읽기3"]}
  `.trim();
}

async function generate(args) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const raw = await transport({ user: calibPrompt(args), temperature: 0.5 + attempt * 0.1 });
    let out; try { out = JSON.parse(raw); } catch { out = null; }
    if (out && !out.interpretation && out.properties?.interpretation) out = out.properties;
    if (out?.interpretation && out?.question && Array.isArray(out?.choices) && out.choices.length === 3) return out;
  }
  return null;
}

// ─── 실행: 메모 10 × 변형 4 = 40건 ──────────────────────────────
const PUSH_CYCLE = ['pushL5', 'pushL6', 'pushL7'];
const BREAK_CYCLE = ['echo', 'flat'];
const picked = pickMemos();
console.log(`▶ Calibration Gen (model=${MODEL}) — 메모 ${picked.length}개 × 변형 4 = ${picked.length * 4}건`);

const items = [];
for (let i = 0; i < picked.length; i++) {
  const { book, memo } = picked[i];
  // echo 변형은 myThought 있을 때만 의미 — 없으면 flat으로
  const breakV = memo.myThought ? BREAK_CYCLE[i % 2] : 'flat';
  const variants = ['std', 'std', PUSH_CYCLE[i % 3], breakV];
  for (let vi = 0; vi < variants.length; vi++) {
    const variant = variants[vi];
    const id = `C-${String(i + 1).padStart(2, '0')}${String.fromCharCode(97 + vi)}`; // C-01a ...
    console.log(`  [${id}] ${book.title.slice(0, 10)} p.${memo.page} · ${variant} 생성...`);
    const out = await generate({ book, memo, variant });
    if (!out) { console.warn(`    ⚠ ${id} 생성 실패 — 셋에서 제외`); continue; }
    items.push({ id, bookId: book.id, page: memo.page, variant, out });
  }
}

// ─── 저장 ────────────────────────────────────────────────────────
// 1) 전체 셋 (숨김 메타 포함)
await mkdir(resolve(__dirname, 'golden'), { recursive: true });
await writeFile(resolve(__dirname, 'golden/calib-set-v1.json'), JSON.stringify({
  version: 'calib-v1', seedVersion: seed.version, genModel: MODEL,
  note: '라벨링 끝나기 전까지 variant 필드를 보지 말 것 (블라인드)',
  items,
}, null, 2), 'utf-8');

// 2) 블라인드 라벨링 시트 — 결정적 셔플 (id 해시 정렬), variant 미노출
const sha = (s) => createHash('sha1').update(s).digest('hex');
const shuffled = [...items].sort((a, b) => sha(a.id).localeCompare(sha(b.id)));

const sheet = `# 넛지 캘리브레이션 라벨링 시트 — ${items.length}건 (DES-302)

> 한 건당 10~20초. **판정**(합/불)과 **이유** 한 줄만 채우면 된다. **레벨**(L1~L7)은 여유 있을 때만.
> 기준은 단 하나 — "이 알림을 실제로 받았다면 좋았겠는가". 루브릭 정의가 아니라 직감으로.
> ⚠️ 라벨링이 끝나기 전에 golden/calib-set-v1.json 을 열어보지 말 것 (변형 정보가 들어 있음).
> 끝나면: node eval/runJudgeCalibration.mjs

${shuffled.map(it => {
  const book = seed.books.find(b => b.id === it.bookId);
  const memo = seed.memos.find(m => m.bookId === it.bookId && m.page === it.page);
  return `---

## ${it.id} — ${book.title}

> 저장한 문장: "${memo.quote.slice(0, 130)}${memo.quote.length > 130 ? '…' : ''}"
${memo.myThought ? `> 💭 ${memo.myThought}` : '> (적은 생각 없음)'}

**🔔 알림**: ${it.out.interpretation}

**👆 질문**: ${it.out.question}
${it.out.choices.map(c => `- [ ${c} ]`).join('\n')}

- 판정:
- 레벨:
- 이유:
`;
}).join('\n')}
`;

await mkdir(resolve(__dirname, 'runs'), { recursive: true });
const sheetPath = resolve(__dirname, 'runs/calib-labeling-sheet.md');
await writeFile(sheetPath, sheet, 'utf-8');

const counts = items.reduce((m, it) => (m[it.variant] = (m[it.variant] || 0) + 1, m), {});
console.log(`\n✓ ${items.length}건 생성 — 변형 분포: ${JSON.stringify(counts)}`);
console.log(`✓ golden/calib-set-v1.json (숨김 메타)`);
console.log(`✓ ${sheetPath} ← Junseo가 채울 시트`);
