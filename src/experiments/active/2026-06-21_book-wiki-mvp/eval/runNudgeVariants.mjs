// 넛지 설계 변형 비교 평가 — DES-258 후속 재설계 실험
//
// V1: 현재 구현 (연결 타입 우선)
// V2: 긴장·갭 발견 우선 (tension-first) — 메모 원문 깊이 읽기 → 질문 품질 기준으로
// V3: 유저 삶 앵커 우선 (life-anchor) — 구체적 일상 상황 → 메모 개념 연결
//
// 평가 기준 (4개 책 × 3개 변형):
//   QA 근거 강제  — 질문이 실제 페이지 내용으로 역추적 가능
//   QB 이해가능성  — 책을 안 읽어도 질문 자체를 이해할 수 있음
//   QC 구체성     — 추상 철학이 아닌 구체적 상황·순간을 상상하게 만듦
//   QD 정지력     — 정신없는 사람이 읽었을 때 멈추고 생각하게 만듦
//
// 사용: node eval/runNudgeVariants.mjs
// 결과: eval/runs/nudge-variants-N.md

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  setLLMTransport,
  planIngest,
  interpretProfile,
  nudgePrompt as v1NudgePrompt,
  NUDGE_SCHEMA,
  SYSTEM_RULES,
} from '../lib/llm.js';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

await loadDotEnvLocal(__dirname);
const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';
const transport = openaiNodeTransport({ model: MODEL });
setLLMTransport(transport);

// ─── 라운드 번호 ─────────────────────────────────────────────────
async function nextVariantRound() {
  const runsDir = resolve(ROOT, 'runs');
  if (!existsSync(runsDir)) return 1;
  const files = await readdir(runsDir);
  const nums = files.map(f => f.match(/^nudge-variants-(\d+)\.md$/)).filter(Boolean).map(m => Number(m[1]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

const ROUND = await nextVariantRound();
console.log(`▶ Nudge Variants Round ${ROUND} (model=${MODEL})`);

// ─── seed + rubric ───────────────────────────────────────────────
const seed = JSON.parse(await readFile(resolve(ROOT, 'golden/seed-v1.json'), 'utf-8'));

// ─── V2 · 긴장 우선 프롬프트 ─────────────────────────────────────
function v2TensionFirstPrompt({ memos, pages, profile, derivedKeywords = [] }) {
  const memoFull = memos.slice(-20).map((m, i) =>
    `[메모-${i + 1}] ${m.bookId?.replace('isbn_', '') || ''} / ${m.chapter || '-'}\n원문: "${m.text}"\n내 생각: ${m.myThought || '(없음)'}`
  ).join('\n\n');

  return `
[유저 프로필]
background: ${profile.background || profile.role || '(없음)'}
interests: ${(profile.interests || []).join(', ') || '(없음)'}

[파생 키워드]
${derivedKeywords.length ? derivedKeywords.map(k => `- ${k.keyword} (${k.axis})`).join('\n') : '(없음)'}

[Wiki 페이지 인덱스]
${pages.length ? pages.map(p => `- id: ${p.id} | title: ${p.title} | keyConcepts: ${(p.keyConcepts || []).join(', ')}`).join('\n') : '(없음)'}

[메모 원문 전체]
${memoFull}

[작업 — 순서대로]

STEP 1: 메모를 깊이 읽어라.
다음 중 가장 흥미로운 것 하나를 찾아라:
  a) 두 메모가 같은 개념을 다른 각도로 보고 있지만 사용자가 아직 연결 안 한 것
  b) 사용자가 당연시하는 가정을 책이 조용히 흔들고 있는 것
  c) 메모 원문과 사용자의 '내 생각' 사이에 흥미로운 긴장이 있는 것
  d) 사용자가 흥미롭게 기록했지만 본인 삶에 아직 적용해보지 않은 개념

STEP 2: 멈추게 만드는 질문을 만들어라.
아래 기준을 모두 충족해야 한다:
  - 구체적 상황·순간을 상상하게 만드는가? (추상적 질문 X)
  - 사용자가 이미 알고 있는 것을 다시 묻지 않는가?
  - 1-2문장으로 답할 수 있는 크기인가?
  - 읽는 순간 "아, 이거" 하는 느낌이 오는가?

STEP 3: 근거 확인.
이 질문이 어느 wiki 페이지에서 나왔는지 sourcePageIds에 기록.
type은 사용한 근거 구성에 따라 선택: memo-memo / book-book / profile-memo.

규칙:
- 책 원문 추론 금지. sourcePageIds의 페이지 내용으로만 근거.
- profile-memo는 derivedKeywords와 1-2단계 직접 연결일 때만.

스키마:
${JSON.stringify(NUDGE_SCHEMA)}

조건 불가 시 { "type":"none", "question":"", "sourcePageIds":[] }.
JSON만 출력.
  `.trim();
}

// ─── V3 · 삶 앵커 프롬프트 ───────────────────────────────────────
function v3LifeAnchorPrompt({ memos, pages, profile, derivedKeywords = [] }) {
  const memoFull = memos.slice(-20).map((m, i) =>
    `[메모-${i + 1}] ${m.bookId?.replace('isbn_', '') || ''} / ${m.chapter || '-'}\n원문: "${m.text}"\n내 생각: ${m.myThought || '(없음)'}`
  ).join('\n\n');

  return `
[유저 프로필 — 일상 맥락]
직업: ${profile.background || profile.role || '(없음)'}
관심사: ${(profile.interests || []).join(', ') || '(없음)'}
파생 키워드: ${derivedKeywords.length ? derivedKeywords.map(k => k.keyword).join(', ') : '(없음)'}

[Wiki 페이지 인덱스]
${pages.length ? pages.map(p => `- id: ${p.id} | title: ${p.title} | keyConcepts: ${(p.keyConcepts || []).join(', ')}`).join('\n') : '(없음)'}

[메모 원문 전체]
${memoFull}

[작업 — 순서대로]

STEP 1: 이 사람의 어제를 상상하라.
위 직업·관심사를 가진 사람이 어제 실제로 겪었을 구체적인 상황 하나를 가정하라.
(예: 디자인 리뷰에서 의사결정이 막힌 순간 / 새 기능의 UX를 고민하던 순간 / 팀원과 방향이 안 맞는 순간)

STEP 2: 그 상황에서 메모의 어느 개념이 은밀하게 작동하고 있는가?
- 사용자가 그 상황을 겪으면서 의식하지 못했을 수 있는 개념
- "이 개념이 당신이 그 순간에 실제로 선택한 방식에 영향 미쳤을 수 있다"
- 너무 직접적이면 안 됨 (이미 알고 있는 것을 물으면 X)
- 너무 추상적이면 안 됨 (개념을 그대로 물으면 X)

STEP 3: 그 순간을 질문으로 만들어라.
형식 힌트 (따르지 않아도 됨):
  - "최근 [구체적 상황]에서 [예상 밖의 판단 기준]이 영향을 미친 적 있나요?"
  - "[상황]을 결정할 때, 당신이 실제로 따른 규범은 뭐였나요?"

STEP 4: 근거 명시.
sourcePageIds에 관련 페이지 ID 기록.
type: profile-memo 우선. 연결이 없으면 memo-memo.

규칙:
- 책 원문 추론 금지.
- 연결이 억지스러우면 type:none으로 출력.

스키마:
${JSON.stringify(NUDGE_SCHEMA)}

JSON만 출력.
  `.trim();
}

// ─── V5 · 함께 읽는 독자 프롬프트 ──────────────────────────────────
function v5CoReaderPrompt({ memos, pages, profile, derivedKeywords = [] }) {
  const memoFull = memos.slice(-20).map((m, i) =>
    `[메모-${i + 1}] ${m.bookId?.replace('isbn_', '') || ''} / ${m.chapter || '-'}\n원문: "${m.text}"\n내 생각: ${m.myThought || '(없음)'}`
  ).join('\n\n');

  return `
[유저 프로필]
background: ${profile.background || profile.role || '(없음)'}
interests: ${(profile.interests || []).join(', ') || '(없음)'}

[Wiki 페이지 인덱스]
${pages.length ? pages.map(p => `- id: ${p.id} | title: ${p.title} | keyConcepts: ${(p.keyConcepts || []).join(', ')}`).join('\n') : '(없음)'}

[메모 원문 전체]
${memoFull}

[작업 — 순서대로]

STEP 1: 유저가 이 메모를 저장할 때 어떤 생각으로 저장했는지 유추하라.
- myThought 가 있으면 그걸 출발점으로.
- 없으면: 메모 원문에서 어느 부분에 밑줄을 그었을지, 어떤 감정이나 질문이 들었을지 상상.
- 결론: "이 사람은 ______에 관심이 있어서 이 메모를 저장했다."

STEP 2: AI가 같은 메모를 읽고 드는 생각을 1~2문장으로 만들어라.
구조: **[메모 원문에서 가장 인상적인 문구 짧게 인용] + [AI 해석 — 살짝 다른 각도] + (선택) [자연스럽게 떠오르는 일상 예시]**

규칙:
- 메모 원문에서 한 문구를 짧게 인용하거나 지칭하라. 유저가 어떤 부분인지 바로 알 수 있어야 함.
- AI 해석은 유저가 포착한 것과 **살짝 다른 각도**로. 같은 말 되풀이 금지.
- **일상 예시는 자연스럽게 떠오를 때만.** 억지로 끌어다 붙이면 오히려 어색함.
  - 자연스러운 예: "벌금 대신 요금을 매겼더니 오히려 늦게 데리러 오는 부모가 늘었다는 게 — 편의점 봉투 값처럼, 돈이 죄책감을 면제권으로 바꿔버리는 것 같아."
  - 억지스러운 예(금지): 추상적 철학 개념에 무리하게 직업·일상 상황을 꿰맞추는 것
  - 없어도 되는 경우: 메모 자체가 이미 구체적이거나, 예시 없이도 AI 해석이 충분히 와닿을 때
- 전체 1~2문장. 장황하면 안 됨.

STEP 3: 유저에게 자연스럽게 넘겨라.
- 공세적 질문 금지: "왜 그렇게 생각해?", "어떻게 할 것인가?", "설명해줘" X
- 대화 초대 형태: "넌 어때?", "너는 어떻게 봤어?", "이 부분에서 뭐가 걸렸어?"
- 또는 AI 생각에 반응을 유도: "내 생각이 맞아?"

[출력 형식]
question 필드에 STEP 2 + STEP 3을 자연스럽게 이어 붙인 1~2문장.
예시 톤: "벌금 대신 요금을 매겼더니 오히려 늦게 데리러 오는 부모가 늘었다는 게, 돈이 죄책감을 면제권으로 바꿔버린 것 같아. 너는 이 메모 저장할 때 뭐가 걸렸어?"

[규칙]
- 책 원문 추론 금지. sourcePageIds의 페이지 내용으로만 근거.
- 질문 전체에 책 제목·페이지 번호 언급 금지 — 독자 대화처럼.
- sourcePageIds: 이 대화의 근거가 된 페이지 ID.
- type: memo-memo 기본. 프로필 연결이 자연스러우면 profile-memo.

스키마:
${JSON.stringify(NUDGE_SCHEMA)}

JSON만 출력.
  `.trim();
}

// ─── V6 · N개 메모 묶음 → 1 넛지 ────────────────────────────────
function v6MemoClusterPrompt({ memos, pages, profile, derivedKeywords = [] }) {
  const memoFull = memos.slice(-20).map((m, i) =>
    `[메모-${i + 1}] ${m.chapter || '-'}\n원문: "${m.text}"\n내 생각: ${m.myThought || '(없음)'}`
  ).join('\n\n');

  return `
[유저 프로필]
background: ${profile.background || profile.role || '(없음)'}

[Wiki 페이지 인덱스]
${pages.length ? pages.map(p => `- id: ${p.id} | title: ${p.title} | keyConcepts: ${(p.keyConcepts || []).join(', ')}`).join('\n') : '(없음)'}

[메모 전체]
${memoFull}

[작업 — 순서대로]

STEP 1: 2~3개 메모를 하나의 클러스터로 묶어라.
아래 중 하나를 찾아라:
  a) 같은 개념을 서로 다른 각도에서 건드리는 메모 2개 (표면은 달라 보이지만 같은 긴장을 공유)
  b) 앞 메모가 던진 질문을 뒤 메모가 다른 방식으로 대답하는 경우
  c) 함께 읽으면 어느 한쪽만 읽었을 때 안 보이던 것이 보이는 조합

STEP 2: AI가 그 클러스터를 읽고 든 생각을 1문장으로 표현하라.
- 클러스터 안의 메모 원문을 짧게 지칭하거나 인용 (유저가 어떤 메모인지 알 수 있도록)
- AI 해석은 유저가 아직 연결하지 못했을 각도로
- 자연스럽게 떠오르면 쉬운 일상 예시를 붙여도 됨. 억지면 하지 말 것.
- 1문장. 장황 금지.

STEP 3: 유저에게 자연스럽게 넘겨라.
- 공세적 질문 금지. 대화 초대 형태.
- "이 두 메모 같이 저장했을 때 뭔가 연결된 게 있었어?" 또는 "넌 어떻게 봤어?"

[출력 형식]
question 필드에 STEP 2 + STEP 3을 자연스럽게 이어 붙인 1~2문장.
sourcePageIds에 클러스터에 해당하는 wiki 페이지 ID 2개 이상.
type: memo-memo.

[규칙]
- 책 원문 추론 금지. sourcePageIds 페이지 내용으로만 근거.
- 클러스터 못 찾으면 { "type":"none", "question":"", "sourcePageIds":[] }.

스키마:
${JSON.stringify(NUDGE_SCHEMA)}

JSON만 출력.
  `.trim();
}

// ─── 자기평가 (질문 품질 기준) ───────────────────────────────────
const QUALITY_EVAL_SCHEMA = {
  type: 'object',
  required: ['axes', 'pass', 'suspect', 'bestQuestion'],
  properties: {
    axes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'score', 'reasoning'],
        properties: {
          key: { type: 'string' },
          score: { enum: [0, 1, 2] },
          reasoning: { type: 'string' },
        },
      },
    },
    pass: { type: 'boolean' },
    suspect: { type: 'boolean' },
    suspectReason: { type: 'string' },
    bestQuestion: { type: 'string' },
  },
};

function qualityEvalPrompt({ variant, question, sourcePageIds, pages, profile, memos }) {
  const sourcePages = pages.filter(p => sourcePageIds?.includes(p.id));
  const memoFull = memos.slice(-20).map((m, i) =>
    `[${i + 1}] ${m.text.slice(0, 100)}${m.myThought ? ' — 내 생각: ' + m.myThought.slice(0, 60) : ''}`
  ).join('\n');

  return `
당신은 넛지 질문의 품질을 4개 축으로 채점합니다.
편향 없이 냉정하게. 의심되면 suspect=true.

[평가 대상 질문 (변형 ${variant})]
"${question || '(질문 없음)'}"

[근거 페이지 내용]
${sourcePages.length ? sourcePages.map(p => `- ${p.title}: ${(p.body || '').slice(0, 200)}`).join('\n') : '(없음)'}

[유저 메모 (컨텍스트)]
${memoFull}

[유저 프로필]
${profile.background || profile.role || '(없음)'}

[4개 채점 축]

**QA 근거 강제 (Grounding)**
- 2: 질문의 모든 내용이 근거 페이지로 역추적 가능. 책 원문 추론 0건.
- 1: 근거는 있으나 일부 표현이 페이지 밖 지식에 기댐.
- 0: 근거 없는 자유 추론, 또는 질문이 없음 (type:none).

**QB 이해가능성 (Comprehensibility)**
- 2: 책을 읽지 않은 사람도 질문 자체를 한 번에 이해할 수 있음. 전문 용어/개념명 없이 직관적.
- 1: 맥락 없이 읽으면 약간 모호하거나 추가 설명이 필요.
- 0: 책 배경이 있어야만 질문의 의미가 통함. 또는 질문이 없음.

**QC 구체성 (Concreteness)**
- 2: 특정 상황·순간·경험을 머릿속에 그릴 수 있음. "OO에 대해 어떻게 생각하세요?" 같은 추상 질문 아님.
- 1: 절반은 구체적, 절반은 추상적.
- 0: 완전 추상적 철학 질문. 구체적 상황 상상 불가. 또는 질문이 없음.

**QD 정지력 (Stop-power)**
- 2: 정신없는 사람이 스쳐 지나가다가 읽으면 "아, 이거" 하고 멈출 만한 질문. 예상 밖의 각도.
- 1: 흥미롭긴 하나 충격이 약하거나 예측 가능.
- 0: 뻔하거나 이미 아는 내용을 다시 물음. 또는 질문이 없음.

합격 규칙: pass = (모든 축 score >= 1). 0점 축 하나라도 있으면 fail.

bestQuestion: 이 질문보다 더 나은 질문이 있다면 1문장으로 작성. 현재 질문이 최선이면 그대로 복사.

스키마:
${JSON.stringify(QUALITY_EVAL_SCHEMA)}

JSON만 출력.
  `.trim();
}

// ─── ingest helper ────────────────────────────────────────────────
async function runIngest(book, memos) {
  const memosNorm = memos.map((m, i) => ({
    id: `seed-memo-${book.id}-${i}`,
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
  return { pages: extractPages(out, book.id), output: out };
}

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

// ─── 넛지 3종 실행 ────────────────────────────────────────────────
async function runVariant(variantName, promptFn, { memos, pages, profile, derivedKeywords }) {
  const promptText = variantName === 'V1'
    ? v1NudgePrompt({ memos, pages, profile, derivedKeywords })
    : promptFn({ memos, pages, profile, derivedKeywords });

  const raw = await transport({ system: SYSTEM_RULES, user: promptText, temperature: 0.3 });
  let nudge;
  try { nudge = JSON.parse(raw); }
  catch { nudge = { type: 'none', question: '', sourcePageIds: [], _parseError: raw.slice(0, 100) }; }
  return nudge;
}

// ─── 품질 자기평가 ────────────────────────────────────────────────
async function evalQuality(variant, nudge, { pages, profile, memos }) {
  const prompt = qualityEvalPrompt({
    variant,
    question: nudge?.question,
    sourcePageIds: nudge?.sourcePageIds || [],
    pages,
    profile,
    memos,
  });
  const raw = await transport({ system: SYSTEM_RULES, user: prompt, temperature: 0.1 });
  let ev;
  try { ev = JSON.parse(raw); }
  catch { return { axes: [], pass: false, suspect: true, suspectReason: 'JSON 파싱 실패', bestQuestion: '' }; }

  // pass 재계산
  if (Array.isArray(ev.axes) && ev.axes.length) {
    ev.pass = !ev.axes.some(a => a.score === 0);
  }
  return ev;
}

// ─── 실행 ────────────────────────────────────────────────────────
console.log('  B · Profile 해석 중...');
const profileOut = await interpretProfile({ profile: seed.profile });
const derivedKeywords = profileOut?.derivedKeywords || [];

const profile = { background: seed.profile.role, interests: seed.profile.interests };

const bookResults = [];

for (const book of seed.books) {
  const memoRaw = seed.memos.filter(m => m.bookId === book.id);
  console.log(`\n  [${book.title}] Ingest 중...`);
  const { pages } = await runIngest(book, memoRaw);
  console.log(`    → ${pages.length}개 페이지 생성`);

  const memos = memoRaw.map(m => ({
    bookId: m.bookId,
    chapter: m.chapter,
    text: m.quote,
    myThought: m.myThought,
  }));

  const variants = {};
  for (const [name, fn] of [
    ['V1', null],
    ['V2', v2TensionFirstPrompt],
    ['V3', v3LifeAnchorPrompt],
    ['V5', v5CoReaderPrompt],
    ['V6', v6MemoClusterPrompt],
  ]) {
    console.log(`    ${name} 넛지 생성 중...`);
    const nudge = await runVariant(name, fn, { memos, pages, profile, derivedKeywords });
    console.log(`    ${name} 품질 평가 중...`);
    const ev = await evalQuality(name, nudge, { pages, profile, memos });
    variants[name] = { nudge, eval: ev };
    const scores = (ev.axes || []).map(a => `${a.key}:${a.score}`).join(' ');
    console.log(`    ${name} — ${ev.pass ? 'PASS' : 'FAIL'} [${scores}] "${nudge.question?.slice(0, 50) || '(없음)'}"`);
  }
  bookResults.push({ book, pages, variants });
}

// ─── 리포트 생성 ─────────────────────────────────────────────────
function scoreBar(axes) {
  if (!axes?.length) return '—';
  return axes.map(a => `${a.key}:${a.score}`).join(' ');
}

function variantSummaryTable(bookResults) {
  const lines = [
    '| 책 | 변형 | QA | QB | QC | QD | 합격 | 질문 |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const { book, variants } of bookResults) {
    for (const vName of ['V1', 'V2', 'V3', 'V5', 'V6']) {
      const v = variants[vName];
      const axes = Object.fromEntries((v.eval?.axes || []).map(a => [a.key, a.score]));
      const pass = v.eval?.pass ? '✅' : '❌';
      const q = v.nudge?.question?.slice(0, 60) || '_(없음)_';
      lines.push(`| ${book.title} | **${vName}** | ${axes.QA ?? '-'} | ${axes.QB ?? '-'} | ${axes.QC ?? '-'} | ${axes.QD ?? '-'} | ${pass} | ${q} |`);
    }
  }
  return lines.join('\n');
}

function axisWinner(bookResults, axisKey) {
  const totals = { V1: 0, V2: 0, V3: 0 };
  let count = 0;
  for (const { variants } of bookResults) {
    for (const vName of ['V1', 'V2', 'V3', 'V5', 'V6']) {
      const a = (variants[vName].eval?.axes || []).find(a => a.key === axisKey);
      if (a) totals[vName] += a.score;
    }
    count++;
  }
  const best = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  return `${best[0]} (${best[1]}/${count * 2})`;
}

const md = `# Nudge Variants Round ${ROUND} — 3-way 비교

> Model: \`${MODEL}\`. 4개 책 × 3개 변형 = 12개 결과.
> **V1** 현재 구현 (연결 타입 우선) | **V2** 긴장 발견 우선 (tension-first) | **V3** 유저 삶 앵커 (life-anchor)

## 채점 축 정의

| 축 | 의미 | 2점 기준 |
|---|---|---|
| QA | 근거 강제 | 질문의 모든 내용이 wiki 페이지로 역추적 가능 |
| QB | 이해가능성 | 책을 안 읽어도 질문 자체를 이해할 수 있음 |
| QC | 구체성 | 구체적 상황·순간을 머릿속에 그릴 수 있음 |
| QD | 정지력 | 정신없는 사람이 읽으면 멈추고 생각하게 됨 |

---

## 종합 비교표

${variantSummaryTable(bookResults)}

---

## 축별 승자

| 축 | 총점 최고 변형 |
|---|---|
| QA 근거 | ${axisWinner(bookResults, 'QA')} |
| QB 이해가능성 | ${axisWinner(bookResults, 'QB')} |
| QC 구체성 | ${axisWinner(bookResults, 'QC')} |
| QD 정지력 | ${axisWinner(bookResults, 'QD')} |

---

## 책별 상세

${bookResults.map(({ book, variants }) => `
### ${book.title}

${['V1', 'V2', 'V3'].map(vName => {
  const v = variants[vName];
  const axes = v.eval?.axes || [];
  const pass = v.eval?.pass ? '✅' : '❌';
  return `#### ${vName} ${pass}

> **질문**: ${v.nudge?.question || '_(없음)_'}

- type: \`${v.nudge?.type || '-'}\`
- sourcePageIds: ${(v.nudge?.sourcePageIds || []).join(', ') || '_(없음)_'}

${axes.map(a => `- **${a.key}** ${a.score}/2: ${a.reasoning}`).join('\n')}

${v.eval?.bestQuestion && v.eval.bestQuestion !== v.nudge?.question
  ? `> 💡 **더 나은 질문 제안**: ${v.eval.bestQuestion}`
  : ''}
`;
}).join('\n')}
`).join('\n---\n')}

---

## 설계 시사점

${(() => {
  const totals = { V1: 0, V2: 0, V3: 0 };
  let n = 0;
  for (const { variants } of bookResults) {
    for (const vName of ['V1', 'V2', 'V3', 'V5', 'V6']) {
      totals[vName] += (variants[vName].eval?.axes || []).reduce((s, a) => s + a.score, 0);
    }
    n++;
  }
  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return ranked.map(([v, t]) => `- **${v}**: 총 ${t}점 / ${n * 8}점 만점`).join('\n');
})()}

> QD(정지력) 와 QC(구체성) 점수 차이가 변형 간 핵심 지표.
> V1 대비 V2/V3 개선이 크면 재설계 방향 유효.
`;

const runsDir = resolve(ROOT, 'runs');
await mkdir(runsDir, { recursive: true });
const mdPath = resolve(runsDir, `nudge-variants-${ROUND}.md`);
const jsonPath = resolve(runsDir, `nudge-variants-${ROUND}.json`);
await writeFile(mdPath, md, 'utf-8');
await writeFile(jsonPath, JSON.stringify({ round: ROUND, model: MODEL, bookResults: bookResults.map(r => ({
  bookTitle: r.book.title,
  pageCount: r.pages.length,
  variants: Object.fromEntries(Object.entries(r.variants).map(([k, v]) => [k, {
    question: v.nudge?.question,
    type: v.nudge?.type,
    sourcePageIds: v.nudge?.sourcePageIds,
    pass: v.eval?.pass,
    axes: v.eval?.axes,
    bestQuestion: v.eval?.bestQuestion,
  }])),
})) }, null, 2), 'utf-8');

console.log(`\n✓ ${mdPath}`);
console.log(`✓ ${jsonPath}`);
