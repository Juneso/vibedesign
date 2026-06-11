// 캘리브레이션 셋 생성기 v2 — judge ↔ 내 판정 일치율 측정용 (DES-302)
//
// 포맷 v2: 넛지 = { message(풀이→질문 흐름), choices(해석 방향 3분기) }
// 의도적으로 합격·불합격이 섞이도록 변형 축을 깔아 40건 생성:
//   std      ×20 — 표준 V8 프롬프트 (합격 기대)
//   quiz     — 선지를 책 내용 확인·요약형으로 (라벨링 v1 최다 불합격 모드)
//   samefork — 선지 2개가 같은 결 (C-07a/C-07c 모드)
//   pushL6   — 질문을 유저 직업·삶으로 (억지 연결)
//   pushL7   — 전이·반론 (책 밖)
//   echo     — myThought 복창 (공감 파괴)
//   flat     — 건조 교과서 요약 + 고정 질문 (공감 파괴)
//
// 변형 메타데이터는 golden/calib-set-v2.json 에만 저장 (블라인드).
// 사용: node eval/runCalibrationGen.mjs   (기본 gpt-4o)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';
import { v8Prompt, v8Header, v8MemoBlock, V8_GUIDE_MESSAGE, V8_OUTPUT_HINT, generateV8 } from './lib/nudgeV8Prompt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dirname);
const MODEL = process.env.GEN_MODEL || 'gpt-4o';
const transport = openaiNodeTransport({ model: MODEL });

const seed = JSON.parse(await readFile(resolve(__dirname, 'golden/seed-v1.json'), 'utf-8'));

// ─── 메모 10개 선정 (책별 분산, myThought 있는 메모 우선) ────────
function pickMemos() {
  const perBook = [3, 3, 2, 2];
  const picked = [];
  seed.books.forEach((book, bi) => {
    const ms = seed.memos.filter(m => m.bookId === book.id);
    const withT = ms.filter(m => m.myThought);
    const withoutT = ms.filter(m => !m.myThought);
    const want = perBook[bi] ?? 2;
    const sel = [...withT.slice(0, want - 1), ...withoutT.slice(0, 1), ...withT.slice(want - 1)].slice(0, want);
    sel.forEach(m => picked.push({ book, memo: m }));
  });
  return picked;
}

// ─── 변형 — 표준 프롬프트에 [변형 지시]를 덧붙여 결함을 주입 ─────
const FAIL_VARIANTS = {
  quiz: `[변형 지시 — 위 규칙보다 우선]
choices 는 해석 방향이 아니라 **책 내용 확인 퀴즈의 보기**처럼 만들어라.
문장에 나온 개념·키워드를 그대로 요약한 명사구 3개 (예: "줄서기 규범 / 기부의 의미 / 교육의 가치" 같은 결).
질문도 "~의 핵심은 무엇일까?" 같은 정답 확인형으로.`,
  samefork: `[변형 지시 — 위 규칙보다 우선]
choices 3개 중 **2개는 사실상 같은 입장의 다른 표현**으로 만들어라 (단어만 바꾼 같은 결).
나머지 1개만 다른 방향. 티 나지 않게 자연스럽게.`,
  pushL6: `[변형 지시 — 위 규칙보다 우선]
마지막 질문을 유저의 직업·일상 상황으로 직접 끌고 가라. ("너의 일에서...", "디자인 작업에서...")
choices 도 그 직업 상황에 대한 입장 3개로.

[유저 프로필]
토스증권에서 일하는 프로덕트 디자이너. 의사결정과 커뮤니케이션을 고민한다.`,
  pushL7: `[변형 지시 — 위 규칙보다 우선]
마지막 질문을 문장을 뒤집거나(반론) 전혀 다른 영역(정치·기술·회사 문화 등)에 적용하는 도발적 질문으로 만들어라.
choices 도 그 도발에 대한 입장 3개로.`,
  echo: `[변형 지시 — 위 규칙보다 우선]
풀이 부분에서 유저가 적은 생각을 **거의 그대로, 어순만 살짝 바꿔** 다시 말하라. 새 관점 추가 금지.
적은 생각이 없으면 저장한 문장을 짧게 줄여 반복하라.`,
  flat: `[변형 지시 — 위 규칙보다 우선]
풀이 부분을 국어사전·교과서처럼 건조하고 일반론적으로 써라 ("~이다" 체).
유저의 마음, 밑줄 친 이유, 적은 생각은 일절 언급하지 말라.
마지막 질문은 "이 문장이 너한테는 어떤 의미였어?" 고정 문구를 그대로 써라.`,
};

function variantPrompt({ book, memo, variant }) {
  if (variant === 'std') return v8Prompt({ book, memo });
  return `${v8Prompt({ book, memo })}\n\n${FAIL_VARIANTS[variant]}`;
}

// ─── 실행: 메모 10 × 변형 4 = 40건 ──────────────────────────────
const FAIL_CYCLE = ['quiz', 'samefork', 'pushL6', 'pushL7', 'echo', 'flat'];
const picked = pickMemos();
console.log(`▶ Calibration Gen v2 (model=${MODEL}) — 메모 ${picked.length}개 × 변형 4 = ${picked.length * 4}건`);

const items = [];
let failIdx = 0;
for (let i = 0; i < picked.length; i++) {
  const { book, memo } = picked[i];
  const nextFail = () => {
    let v = FAIL_CYCLE[failIdx++ % FAIL_CYCLE.length];
    if (v === 'echo' && !memo.myThought) v = 'flat'; // echo는 myThought 있을 때만 의미
    return v;
  };
  const variants = ['std', 'std', nextFail(), nextFail()];
  for (let vi = 0; vi < variants.length; vi++) {
    const variant = variants[vi];
    const id = `D-${String(i + 1).padStart(2, '0')}${String.fromCharCode(97 + vi)}`; // D-01a ... (v1의 C-와 구분)
    console.log(`  [${id}] ${book.title.slice(0, 10)} p.${memo.page} · ${variant} 생성...`);
    // 결함 주입 변형은 자가 검수(분기 재생성)를 꺼서 결함이 살아남게 한다
    const out = await generateV8({ transport, book, memo, promptText: variantPrompt({ book, memo, variant }), forkCheck: variant === 'std' });
    if (!out) { console.warn(`    ⚠ ${id} 생성 실패 — 셋에서 제외`); continue; }
    items.push({ id, bookId: book.id, page: memo.page, variant, out });
  }
}

// ─── 저장 ────────────────────────────────────────────────────────
await mkdir(resolve(__dirname, 'golden'), { recursive: true });
await writeFile(resolve(__dirname, 'golden/calib-set-v2.json'), JSON.stringify({
  version: 'calib-v2', seedVersion: seed.version, genModel: MODEL,
  note: '라벨링 끝나기 전까지 variant 필드를 보지 말 것 (블라인드)',
  items,
}, null, 2), 'utf-8');

const sha = (s) => createHash('sha1').update(s).digest('hex');
const shuffled = [...items].sort((a, b) => sha(a.id).localeCompare(sha(b.id)));

const sheet = `# 넛지 캘리브레이션 라벨링 시트 v2 — ${items.length}건 (DES-302)

> 한 건당 10~20초. **판정**(합/불)과 **이유** 한 줄만 채우면 된다. **레벨**(L1~L7)은 여유 있을 때만.
> 기준은 단 하나 — "이 알림을 실제로 받았다면 좋았겠는가". 루브릭 정의가 아니라 직감으로.
> ⚠️ 라벨링이 끝나기 전에 golden/calib-set-v2.json 을 열어보지 말 것 (변형 정보가 들어 있음).
> 끝나면: node eval/runJudgeCalibration.mjs

${shuffled.map(it => {
  const book = seed.books.find(b => b.id === it.bookId);
  const memo = seed.memos.find(m => m.bookId === it.bookId && m.page === it.page);
  return `---

## ${it.id} — ${book.title}

> 저장한 문장: "${memo.quote.slice(0, 130)}${memo.quote.length > 130 ? '…' : ''}"
${memo.myThought ? `> 💭 ${memo.myThought}` : '> (적은 생각 없음)'}

**🔔 메시지**: ${it.out.message}
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
console.log(`✓ golden/calib-set-v2.json (숨김 메타)`);
console.log(`✓ ${sheetPath} ← Junseo가 채울 시트`);
