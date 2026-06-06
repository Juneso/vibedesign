// LLM 어댑터. OpenAI Chat Completions JSON 모드 사용.
// Vite dev 플러그인(openaiPlugin)이 /api/llm 으로 프록시. 키는 서버 환경에만.
//
// 룰:
// - 모든 호출은 system 룰 + JSON 스키마 안내. response_format=json_object 로 강제.
// - 환각 방지: 근거 없는 출력은 클라이언트에서 발행 차단(검증).
// - input 짧게 (3000 토큰 이하 가이드, 온디바이스 이행 대비).

// ─── JSON 스키마 (참고용 + 검증용) ────────────────────────────────
// Ingest는 2단계 출력:
//  1) analyses[]  — 각 메모를 책 맥락에 anchor + 키 개념 추출 (LLM 사고 강제)
//  2) patches[]   — analyses에 기반한 wiki create/update 패치
export const INGEST_SCHEMA = {
  type: 'object',
  required: ['analyses', 'patches', 'notes'],
  properties: {
    analyses: {
      type: 'array',
      items: {
        type: 'object',
        required: ['memoId', 'thesis', 'stance', 'tocAnchor', 'anchorConfidence', 'keyConcepts', 'bookContextLink', 'userContextLinks'],
        properties: {
          memoId: { type: 'string' },
          thesis: { type: 'string' },                   // 메모가 말하려는 한 문장 논지 (사용자 표현 최대한 보존)
          stance: { enum: ['surface', 'connect', 'apply', 'critique'] }, // 메모의 사고 단계
          tocAnchor: { type: 'string' },                // 목차 중 가장 가까운 항목 (정확 일치, 없으면 '미지정')
          anchorConfidence: { enum: ['high', 'med', 'low'] },
          keyConcepts: { type: 'array', items: { type: 'string' }, maxItems: 5 },
          bookContextLink: { type: 'string' },          // 1-2문장: 책 요약·목차의 어느 흐름과 연결되는지
          userContextLinks: {                            // 명확히 연결되는 사용자 맥락 카드 (없으면 빈 배열)
            type: 'array',
            items: {
              type: 'object',
              required: ['contextId', 'note'],
              properties: {
                contextId: { type: 'string' },          // 제공된 [사용자 맥락] 중 id 정확 일치
                note: { type: 'string' },               // 어떻게 연결되는지 1문장
              },
            },
          },
        },
      },
    },
    patches: {
      type: 'array',
      items: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { enum: ['create', 'update'] },
          pageId: { type: 'string' },
          pageDraft: {
            type: 'object',
            required: ['title', 'type', 'body', 'sources'],
            properties: {
              title: { type: 'string' },
              type: { enum: ['concept', 'entity', 'reflection', 'connection'] },
              body: { type: 'string' },                 // 구조: ## 메모 / ## 책 맥락 / ## 키 개념 / ## 내 생각 (해당 시)
              sources: { type: 'array' },
              linkedBooks: { type: 'array' },
              bookId: { type: 'string' },
              keyConcepts: { type: 'array', items: { type: 'string' } },
            },
          },
          append: { type: 'string' },
          addSources: { type: 'array' },
        },
      },
    },
    notes: { type: 'string' },
  },
};

export const FOLLOWUP_SCHEMA = {
  type: 'object',
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 2,
    },
  },
};

export const NUDGE_SCHEMA = {
  type: 'object',
  required: ['type', 'question', 'sourcePageIds'],
  properties: {
    type: { enum: ['memo-memo', 'profile-memo', 'book-book'] },
    question: { type: 'string' },
    sourcePageIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
    usedDerivedKeywords: { type: 'array', items: { type: 'string' } },
  },
};

// DES-183 · Profile 해석.
// 직군·관심사·고민을 받아 wiki 매칭에 쓸 2차 키워드 집합으로 풀어낸다.
// 직접 단어 매칭이 만들어내는 "디자이너→디자인 메모만" 패턴 회피가 목적.
export const PROFILE_SCHEMA = {
  type: 'object',
  required: ['derivedKeywords', 'confidence'],
  properties: {
    derivedKeywords: {
      type: 'array',
      minItems: 5,
      maxItems: 10,
      items: {
        type: 'object',
        required: ['keyword', 'axis', 'reasoning', 'sourceField'],
        properties: {
          keyword: { type: 'string' },                   // 짧은 명사구 (1~6단어).
          axis: { enum: ['인지', '정서', '실무'] },        // 사고/감정/일하는 방식 중 어디서 파생됐는가.
          reasoning: { type: 'string' },                  // 1문장. 입력의 어떤 부분에서 어떻게 파생됐는지.
          sourceField: { enum: ['role', 'interests', 'currentConcerns', 'values'] },
        },
      },
    },
    confidence: { enum: ['low', 'med', 'high'] },
  },
};

// ─── 프롬프트 ─────────────────────────────────────────────────────
export const SYSTEM_RULES = `
당신은 Junseo의 독서 메모를 LLM Wiki에 누적하는 사서입니다.
출력은 항상 JSON 객체만. 마크다운 코드블록 금지.

[Grounding 룰 — 환각 방지]
A. 책의 원문 내용을 추측해 단정하지 말 것. 책 사실은 제공된 [책 요약]·[목차]·[책 보강 컨텍스트] 범위 안에서만 인용.
B. 위 범위에 없는 사실을 wiki 본문에 쓰려면 반드시 sources에 {kind:"llm-inference", confidence:"low|med|high"} 로 표시.
C. 메모의 의미를 왜곡하지 말 것. 메모 원문은 인용 형태로 보존.
D. tocAnchor 는 제공된 [목차] 항목과 정확히 일치하는 문자열만 사용. 일치하는 게 없으면 "미지정" + anchorConfidence:"low".
   목차가 빈약하거나 매핑이 어색할 땐 [책 보강 컨텍스트] 의 책소개/책속에서/추천글로 책 맥락을 보강하되, tocAnchor 자체는 억지로 만들지 말 것.
E. 모든 wiki 페이지에 sources 배열 필수. 메모 id 최소 1개 + 책 메타 인용 시 {kind:"book-meta", id:bookId}.
   [책 보강 컨텍스트] 를 본문에 인용할 때도 {kind:"book-meta", id:bookId, field:"intro|publisherIntro|excerpts|recommend"} 로 표시.
F. 한국어. 단정조보다 사실 기술.

[사용자 맥락 룰]
G. userContextLinks 는 제공된 [사용자 맥락] 카드와 메모가 *명확히* 연결될 때만 채울 것. 단어가 비슷하다고 무리하게 연결 금지 — 빈 배열이 정상.
   좋은 예: 메모가 "정보 네트워크"를 다루고, 사용자 맥락이 "회사 정보 흐름 답답함" → 연결.
   나쁜 예: 메모가 "정보 네트워크"를 다루는데, 사용자 맥락이 "디자인 시스템 작업" → 단어 거리 멈 → 연결 X.
H. userContextLinks 가 있으면 patches.pageDraft.body 에 "## 내 맥락과의 연결" 섹션 추가 + sources 에 {kind:"user-context", id:contextId} 포함.

[Stance 분류 가이드]
- surface: 단순 흥미·호기심·인용 ("멋있다", "기록")
- connect: 다른 개념·경험·책과 연결 시도
- apply: 본인 일/조직/상황에 적용·이식 시도
- critique: 의문·반박·한계 지적
`.trim();

export function ingestPrompt({ memos, book, existingPages, contexts = [], profile = {} }) {
  return `
[사용자 프로필]
배경: ${profile.background || '(없음)'}
진행 중인 일: ${(profile.currentWork || []).join(', ') || '(없음)'}
관심사: ${(profile.interests || []).join(', ') || '(없음)'}
열린 질문:
${(profile.openQuestions || []).map(q => `  - ${q}`).join('\n') || '  (없음)'}

[사용자 맥락 카드]
${contexts.length ? contexts.map(c => `- id: ${c.id}\n  title: ${c.title}\n  body: ${c.body || '(없음)'}`).join('\n') : '  (없음)'}

[책]
id: ${book.id}
title: ${book.title}
author: ${book.author}
summary: ${book.summary || '(없음)'}
toc:
${(book.toc || []).map((t, i) => `  ${i + 1}. ${t}`).join('\n') || '  (목차 없음)'}

[책 보강 컨텍스트 — 알라딘 발췌]
- 책소개: ${(book.aladin?.intro || '').slice(0, 800) || '(없음)'}
- 출판사 책소개: ${(book.aladin?.publisherIntro || '').slice(0, 1200) || '(없음)'}
- 책 속에서(저자가 강조한 원문 발췌): ${(book.aladin?.excerpts || '').slice(0, 1500) || '(없음)'}
- 추천글: ${(book.aladin?.recommend || '').slice(0, 800) || '(없음)'}

[새 메모들]
${memos.map(m => `- id: ${m.id}
  사용자가 지정한 chapter: ${m.chapter || '(미지정)'}
  text: """${m.text}"""
  myThought: ${m.myThought || '(없음)'}
  followUps:
${(m.followUps || []).map(f => `    - Q: ${f.question}\n      A: ${f.answer}`).join('\n') || '    (없음)'}`).join('\n')}

[기존 wiki 페이지 인덱스 (이 책)]
${existingPages.length ? existingPages.map(p => `- id: ${p.id} | type: ${p.type} | title: ${p.title} | keyConcepts: ${(p.keyConcepts || []).join(', ')}`).join('\n') : '  (없음)'}

[작업 — 반드시 2단계 순서로]

STEP 1: analyses[]
각 메모마다 한 항목씩 작성:
- thesis: 메모의 핵심을 1~2문장으로. 사용자 표현·뉘앙스 보존. LLM 일반론 금지.
  ⚠️ **myThought 가 비어있지 않으면**: 책 인용을 그대로 복사하지 말고, myThought 의 관점·해석을 thesis 에 *명시적으로 반영*하라.
  좋은 예: 메모text "벌금과 요금 중에 어느 것이 적절한지..." + myThought "사회제도의 목적과 도덕적 책임"
   → thesis "벌금/요금 선택은 사회제도의 목적과 도덕적 책임을 먼저 따져야 한다(사용자 해석)."
  나쁜 예: 메모text 만 그대로 복사. myThought 가 thesis 에서 사라짐.
- stance: 메모의 사고 단계 — surface | connect | apply | critique (위 가이드 참고).
- tocAnchor: 위 [목차] 중 메모와 가장 가까운 항목의 문자열을 그대로 복사. 일치하는 게 없으면 "미지정".
- anchorConfidence: 단서 명확하면 "high", 추정이면 "med", 거의 단서 없으면 "low".
- keyConcepts: 메모에서 추출한 핵심 개념 1~5개 (짧은 명사구).
- bookContextLink: 2~3문장. 책 전체 주제(요약·목차·[책 보강 컨텍스트] 전반)를 *충분히 읽고* 메모가 책의 어느 흐름·관점에 닿는지 설명.
  ⚠️ 인용 마커("(책속에서) ..." 같은 형식) 강제 X. 보강 컨텍스트는 *읽는* 데 쓰는 거지 마커로 박는 게 아님.
  ⚠️ 8개 메모 전부 같은 책 전체 요약 한 줄에 anchor 하지 말 것. 메모마다 책의 *다른 흐름·다른 등장 모티프*와 연결되어야 함. 같은 문구가 반복되면 다양성 부족으로 자기 감점.
  단서가 거의 없으면 "책 요약/목차/보강 컨텍스트에 명시되지 않음" 으로 솔직히 (드물어야 함).
- userContextLinks: [사용자 맥락 카드] 와 *명확히* 연결될 때만 채움. 단어만 비슷한 무리한 연결 금지. 없으면 빈 배열.

STEP 2: patches[] — **반드시 비어있지 않게** "개념 페이지 누적" 원칙
- patches.length 가 0 이면 그 출력은 즉시 실패. analyses 만 출력하고 patches 를 빈 배열로 두지 말 것.
- analyses 의 keyConcepts 를 dedupe 해서 각 개념마다 create patch 1장 (기존 wiki 비어있을 때 기본 경로).
- 메모 N개 → 페이지 N개가 아니라, 메모 N개 → 개념 K개 → 페이지 K개 (K ≤ N). 보통 5~10개.

페이지는 *메모마다 만들지 않는다*. 개념(keyConcept) 단위로 1장, 같은 개념을 다룬 새 메모가 들어오면 기존 페이지에 *추가만* 한다.

머지 규칙 (필수):
- 기존 페이지 중 메모의 keyConcepts 와 겹치는 게 있으면 → **반드시 update**.
- 겹치는 페이지가 없을 때만 → create (pageDraft.type = "concept" 우선).
- 메모 N개를 N개 페이지로 만들지 말 것. 같은 개념이면 1 페이지에 모두 모일 것.

CREATE 시 pageDraft.body 구조 (해당 섹션만):
  ## 개요
  {이 개념 자체를 3~5문장으로 설명. 아래 순서로 작성:
   1) 이 개념이 무엇인지 (정의·핵심 의미)
   2) 책이 이 개념을 어떤 각도로 분석·비판하는지 (책 고유의 주장, "이 책은 탐구한다" 같은 홍보문구 금지)
   3) 이 개념이 왜 논쟁적이거나 흥미로운지 (메모·맥락에서 드러난 긴장·질문)
   ⚠️ 같은 책의 다른 개념 페이지와 동일한 문장을 쓰지 말 것. 개념마다 고유한 서술.
   책 인용 시 [^book-meta:${book.id}] 각주.}

  ## 키 개념
  - {concept}

  ## 메모 흐름
  > [날짜:YYYY-MM-DD] {memo.text}  [^memo:{memoId}]
  > — 논지: {thesis}
  > 💭 {myThought}  ← 메모에 myThought 있을 때만

  ## 내 맥락과의 연결  ← userContextLinks 가 있을 때만
  - **{카드 title}**: {note 1문장}  [^user-context:{contextId}]

UPDATE 시 append 본문 (기존 "## 메모 흐름" 섹션 뒤에 chronological 추가):
  >
  > [날짜:YYYY-MM-DD] {memo.text}  [^memo:{memoId}]
  > — 논지: {thesis}
  > 💭 {myThought}

  (userContextLinks 가 있으면 같은 update patch 의 append 본문에 "## 내 맥락과의 연결" 항목 추가)

sources / addSources:
- 메모 id 필수 {kind:"memo", id:memoId, bookId:"${book.id}"}
- 책 사실 인용 시 {kind:"book-meta", id:"${book.id}"}
- user-context 연결 시 {kind:"user-context", id:contextId}
- 추론은 {kind:"llm-inference", id:"inf-N", confidence:"low|med|high"}

기타:
- linkedBooks: ["${book.id}"], bookId: "${book.id}"
- keyConcepts: analyses 의 keyConcepts dedupe해서 page 의 keyConcepts 에 누적

스키마:
${JSON.stringify(INGEST_SCHEMA)}

JSON만 출력.
  `.trim();
}

export function interpretProfilePrompt({ profile }) {
  const fmt = (arr) => Array.isArray(arr) && arr.length ? arr.map(x => `  - ${x}`).join('\n') : '  (없음)';
  return `
[사용자 프로필]
role: ${profile.role || '(없음)'}
interests:
${fmt(profile.interests)}
currentConcerns:
${fmt(profile.currentConcerns)}
values:
${fmt(profile.values)}

[작업]
이 사용자의 프로필을, 독서 wiki 페이지와 매칭할 때 쓸 **2차 키워드** 5~10개로 풀어낸다.

원칙:
- 직군의 직접 단어("디자이너", "디지털 프로덕트") 그대로 쓰지 말 것. 그 직군이 *어떤 사고/감정/실무 패턴*을 갖는지로 변환.
- axis 3축으로 분배:
  - 인지: 이 사람이 *어떻게 사고하는가* (예: "제약 안에서의 결정", "왜를 먼저 정렬")
  - 정서: 이 사람이 *무엇에 끌리고 무엇을 두려워하는가* (예: "정답 없는 문제의 몰입감", "사소한 결정의 마비")
  - 실무: 이 사람이 *무엇을 다루는가* (예: "복잡한 사용성 문제", "프로토타입을 통한 학습")
- 각 키워드는 짧은 명사구(1~6단어). 슬로건/문장 금지.
- 환각 금지: 입력에 없는 정보 추정 X. reasoning 에 입력 어느 줄에서 파생됐는지 명시.
- 다양성: 3축에 골고루 분배 (한 축에 5개 이상 몰리면 다양성 부족).

좋은 예:
  { keyword: "제약 안에서의 결정", axis: "인지", reasoning: "values 의 '주인의식·오너십'과 '왜를 먼저 알고 시작'에서 파생", sourceField: "values" }
  { keyword: "정답 없는 영역의 몰입감", axis: "정서", reasoning: "interests 의 '창의적 새 아이디어' + currentConcerns 의 '자유도 높고 범용성 높은 사용성 문제'에서 파생", sourceField: "interests" }

나쁜 예:
  { keyword: "디자인", axis: "실무", ... }  → 직군 직접 단어
  { keyword: "성장하고 싶다", axis: "정서", ... }  → 누구에게나 통하는 일반론

스키마:
${JSON.stringify(PROFILE_SCHEMA)}

JSON만 출력.
  `.trim();
}

export function nudgePrompt({ memos, pages, profile, derivedKeywords = [] }) {
  return `
[사용자 프로필]
background: ${profile.background || profile.role || '(없음)'}
interests: ${(profile.interests || []).join(', ') || '(없음)'}

[파생 키워드 — interpretProfile 결과]
${derivedKeywords.length ? derivedKeywords.map(k => `- ${k.keyword} (${k.axis})`).join('\n') : '  (없음)'}

[Wiki 페이지 인덱스]
${pages.length ? pages.map(p => `- id: ${p.id} | bookId: ${p.bookId || '-'} | type: ${p.type} | title: ${p.title}`).join('\n') : '  (없음)'}

[최근 메모]
${memos.slice(-20).map(m => `- ${m.bookId} / ${m.chapter || '-'} : ${m.text.slice(0, 80)}`).join('\n') || '  (없음)'}

[작업]
아래 3종 중 조건이 만족되는 것 1개만 골라 질문 1개를 생성:
- memo-memo: 같은 책 내 메모 2개 이상이 같은 개념 페이지를 공유할 때
- profile-memo: 사용자 프로필 키워드와 메모 개념이 교차할 때
- book-book: 다른 책 페이지와 개념이 겹칠 때

규칙:
- 책 원문 추론이 필요한 질문 금지.
- sourcePageIds 에 근거 페이지 ID 최소 1개 필수.
- 질문은 답하기 쉬운 한 문장.
- profile-memo 타입을 고를 때는 [파생 키워드] 중 하나 이상을 질문 표현·초점에 *실제로 반영*해야 함. usedDerivedKeywords 에 사용한 키워드 명시.
- 같은 wiki에서 다른 프로필을 넣으면 다른 질문이 나올 정도로 키워드를 살릴 것.

스키마:
${JSON.stringify(NUDGE_SCHEMA)}

조건 만족 X 면 { "type":"none", "question":"", "sourcePageIds":[] } 로 출력.
JSON만 출력.
  `.trim();
}

export function answerPrompt({ nudge, answer, pages }) {
  const targets = pages.filter(p => nudge.sourcePageIds.includes(p.id));
  return `
[넛지 질문]
type: ${nudge.type}
question: ${nudge.question}

[사용자 답변]
"""${answer}"""

[근거 페이지 (이 답변으로 갱신할 대상)]
${targets.map(p => `- id: ${p.id} | title: ${p.title}\n  body 일부: ${p.body.slice(0, 200)}`).join('\n')}

[작업]
사용자 답변을 근거 페이지에 자연스럽게 흡수.
각 페이지마다 update patch 작성:
- append: 페이지 본문 뒤에 붙일 단락. 답변을 인용하고 페이지 기존 흐름과 연결.
- addSources: [{kind:"user-answer", id:"${nudge.id}"}] 포함.

스키마:
${JSON.stringify(INGEST_SCHEMA)}

JSON만 출력.
  `.trim();
}

// ─── 호출 ────────────────────────────────────────────────────────
// 기본 transport: 브라우저 → Vite dev 플러그인 /api/llm.
// eval/runEval.mjs 같은 Node 환경에서는 setLLMTransport 로 OpenAI 직접 호출 주입.
let _llmTransport = async ({ system, user, model, temperature }) => {
  const r = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, user, model, temperature }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || 'llm proxy error');
  return data.text;
};

export function setLLMTransport(fn) { _llmTransport = fn; }

async function callLLM({ system, user, model, temperature }) {
  const text = await _llmTransport({ system, user, model, temperature });
  try { return JSON.parse(text); }
  catch { throw new Error('LLM 응답이 JSON이 아님: ' + String(text).slice(0, 200)); }
}

// ─── Follow-up: 메모 직후 1~2개 후속 질문 ─────────────────────────
export function followUpPrompt({ memo, book, profile = {}, contexts = [] }) {
  return `
[사용자 프로필]
배경: ${profile.background || '(없음)'}
진행 중: ${(profile.currentWork || []).join(', ') || '(없음)'}
열린 질문:
${(profile.openQuestions || []).map(q => `  - ${q}`).join('\n') || '  (없음)'}

[사용자 맥락 카드]
${contexts.length ? contexts.map(c => `- ${c.title}: ${c.body || '(상세 없음)'}`).join('\n') : '  (없음)'}

[책]
${book.title} / ${book.author}
summary: ${book.summary || '(없음)'}

[방금 작성한 메모]
chapter: ${memo.chapter || '(미지정)'}
text: """${memo.text}"""
myThought: ${memo.myThought || '(없음)'}

[작업]
사용자의 사고를 한 단계 깊게 만드는 후속 질문을 1~2개 생성.
원칙:
- 답하기 쉬워야 함 (1~2 문장으로 답할 수 있게).
- 추상 X. 사용자의 프로필·맥락 카드를 활용해 *구체적이고 본인 상황에 가까운* 질문.
- 책 원문 추측 X. 메모의 표현 안에서만 파생.
- "이 책의 다른 어디에서 이 개념을 다루나요?" 같이 책 지식 요구하는 질문 금지.

좋은 예: "정보 네트워크" 메모 + 사용자 맥락 "회사 정보 흐름 답답함"
  → "당신의 팀에서 정보 네트워크가 막히는 지점은 어디인가요?"

나쁜 예 (추상): "이 개념을 어떻게 일에 적용할 수 있을까요?"
나쁜 예 (책 추측): "저자는 이 다음에 무엇을 말할까요?"

스키마:
${JSON.stringify(FOLLOWUP_SCHEMA)}

JSON만 출력.
  `.trim();
}

export async function generateFollowUps({ memo, book, profile = {}, contexts = [] }) {
  const out = await callLLM({
    system: SYSTEM_RULES,
    user: followUpPrompt({ memo, book, profile, contexts }),
  });
  return Array.isArray(out?.questions) ? out.questions.slice(0, 2) : [];
}

// ─── 워크플로우 ───────────────────────────────────────────────────
export async function planIngest({ memos, book, existingPages, contexts = [], profile = {} }) {
  return callLLM({
    system: SYSTEM_RULES,
    user: ingestPrompt({ memos, book, existingPages, contexts, profile }),
  });
}

export async function interpretProfile({ profile }) {
  return callLLM({
    system: SYSTEM_RULES,
    user: interpretProfilePrompt({ profile }),
  });
}

export async function generateNudge({ memos, pages, profile, derivedKeywords = [] }) {
  if (!pages.length) return null;
  const out = await callLLM({
    system: SYSTEM_RULES,
    user: nudgePrompt({ memos, pages, profile, derivedKeywords }),
  });
  // 환각 차단: 근거 페이지 ID 검증
  if (!out || out.type === 'none' || !out.sourcePageIds?.length) return null;
  const validIds = new Set(pages.map(p => p.id));
  out.sourcePageIds = out.sourcePageIds.filter(id => validIds.has(id));
  if (!out.sourcePageIds.length) return null;
  return out;
}

export async function ingestAnswer({ nudge, answer, pages }) {
  return callLLM({
    system: SYSTEM_RULES,
    user: answerPrompt({ nudge, answer, pages }),
  });
}
