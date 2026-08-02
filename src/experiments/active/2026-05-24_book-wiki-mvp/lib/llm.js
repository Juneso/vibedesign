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

export const NUDGE_VALIDATION_SCHEMA = {
  type: 'object',
  required: ['forced', 'reason'],
  properties: {
    forced: { type: 'boolean' },   // true = 억지 연결, null 반환
    reason: { type: 'string' },    // 1문장 판단 근거
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
⚠️ analyses.length 는 반드시 위 [메모] 개수(${memos.length}개)와 **같아야** 한다. 하나도 빠뜨리지 말 것 —
   빠진 메모는 위키에 흔적조차 남지 않는다. 비슷한 메모라도 합치지 말고 각각 한 항목으로 쓴다.
각 메모마다 한 항목씩 작성:
- thesis: 메모의 핵심을 1~2문장으로. 사용자 표현·뉘앙스 보존. LLM 일반론 금지.
  ⚠️ **myThought 가 비어있지 않으면**: 책 인용을 그대로 복사하지 말고, myThought 의 관점·해석을 thesis 에 *명시적으로 반영*하라.
  좋은 예: 메모text "벌금과 요금 중에 어느 것이 적절한지..." + myThought "사회제도의 목적과 도덕적 책임"
   → thesis "벌금/요금 선택은 사회제도의 목적과 도덕적 책임을 먼저 따져야 한다(사용자 해석)."
  나쁜 예: 메모text 만 그대로 복사. myThought 가 thesis 에서 사라짐.
- stance: 메모의 사고 단계 — surface | connect | apply | critique (위 가이드 참고).
- tocAnchor: 위 [목차] 중 메모와 가장 가까운 항목의 문자열을 그대로 복사. 일치하는 게 없으면 "미지정".
- anchorConfidence: 단서 명확하면 "high", 추정이면 "med", 거의 단서 없으면 "low".
- keyConcepts: 메모 텍스트에 명시되거나 암시된 핵심 개념 1~5개 (짧은 명사구).
  ⚠️ 책 메타데이터(소개·목차·서평)는 개념 이해 보조용. 메모에 없는 개념을 책 소개에서 끌어와 keyConcepts에 넣지 말 것.
- bookContextLink: 2~3문장. 책 전체 주제(요약·목차·[책 보강 컨텍스트] 전반)를 *충분히 읽고* 메모가 책의 어느 흐름·관점에 닿는지 설명.
  ⚠️ 인용 마커("(책속에서) ..." 같은 형식) 강제 X. 보강 컨텍스트는 *읽는* 데 쓰는 거지 마커로 박는 게 아님.
  ⚠️ ${memos.length}개 메모 전부 같은 책 전체 요약 한 줄에 anchor 하지 말 것. 메모마다 책의 *다른 흐름·다른 등장 모티프*와 연결되어야 함. 같은 문구가 반복되면 다양성 부족으로 자기 감점.
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
- **프로필 필드 문구 직접 복사 금지**: currentConcerns/interests/values의 문구를 keyword에 그대로 쓰지 말 것. 같은 의미라도 반드시 사고 패턴·정서·실무 방식으로 재표현. 예: "복잡한 사용성 문제" → ❌, "다층적 제약 속 해결책 탐색" → ✅
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

export function nudgeValidationPrompt({ nudge, pages, derivedKeywords = [] }) {
  const sourcePages = pages.filter(p => nudge.sourcePageIds?.includes(p.id));
  return `
[검수 대상 넛지]
type: ${nudge.type}
question: "${nudge.question}"

[근거 페이지]
${sourcePages.map(p => `- ${p.title}: ${p.body?.slice(0, 200) || ''}`).join('\n') || '(없음)'}

[사용된 파생 키워드]
${(nudge.usedDerivedKeywords || []).join(', ') || '(없음)'}

[파생 키워드 전체]
${derivedKeywords.map(k => `- ${k.keyword} (${k.axis})`).join('\n') || '(없음)'}

[판단 기준 — 넛지 타입별 적용]

**memo-memo / book-book 타입**:
두 근거 페이지 개념이 같은 책 맥락에서 자연스럽게 연결되는지만 확인.
- forced=false: 같은 책에서 두 개념이 서로 연관된 주제를 다룸 (예: 조르바의 욕망↔자유: 같은 철학적 긴장)
- forced=true: 두 개념이 사실상 무관하거나 억지로 연결된 경우만
⚠️ memo-memo에는 프로필 2단계 룰 적용 금지.

**profile-memo 타입만**: 논리적 거리 2단계 이내 엄격 적용
- 1단계: A이면 바로 B (같은 구조·원리)
- 2단계: A가 있으면 B가 직접 따라옴
- 3단계 이상 → forced=true

forced=false 예시:
- memo-memo "욕망이 개인의 자유를 제한하는가?" (조르바: 욕망↔자유는 같은 철학적 긴장) → forced=false
- profile-memo "시장이 도덕 판단을 배제 → 사소한 결정의 마비" (2단계) → forced=false

forced=true 예시:
- profile-memo "시장의 규범이 창의적 도전에 어떤 영향을 미칠까?" → 4단계 이상 → forced=true

스키마:
${JSON.stringify(NUDGE_VALIDATION_SCHEMA)}

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
${pages.length ? pages.map(p => `- id: ${p.id} | bookId: ${p.bookId || '-'} | type: ${p.type} | title: ${p.title} | keyConcepts: ${(p.keyConcepts || []).join(', ')}`).join('\n') : '  (없음)'}

[최근 메모]
${memos.slice(-20).map(m => `- ${m.bookId} / ${m.chapter || '-'} : ${m.text.slice(0, 80)}`).join('\n') || '  (없음)'}

[작업]
아래 3종을 순서대로 검토해 가능한 것 1개 골라 질문 1개 생성.
⚠️ **type:none은 3종 모두 불가능할 때만 — 반드시 적극적으로 찾은 후 마지막 수단으로만 사용.**

1. **memo-memo** (최우선): [Wiki 페이지 인덱스]에서 keyConcepts가 여러 메모 내용과 겹치는 페이지를 찾아라.
   - 같은 책의 메모 2개 이상이 같은 키 개념을 다루면 즉시 선택.
   - 판단 방법: 각 페이지의 keyConcepts와 [최근 메모] 내용을 비교해 공통 주제 확인.

2. **book-book**: [Wiki 페이지 인덱스]에서 bookId가 다른 두 페이지가 같은 개념을 다루면 선택.

3. **profile-memo** (신중하게): 책 개념과 파생 키워드 간 1-2단계 직접 연결이 *확실히* 보일 때만.
   - 확신 없으면 선택하지 말 것 — memo-memo로 대체.

**profile-memo 선택 조건 (엄격)**:
- 책 개념 A → 파생 키워드 B 사이에 "A이면 바로 B다" 수준의 1-2단계 연결만 허용
- 1단계 예(허용): 시장이 도덕 판단 배제 → 사소한 결정의 마비 (기준 상실이 같은 구조)
- 금지 예: 책 개념 → 중간 개념 2개 이상 → 파생 키워드 (3단계 이상)
- 확신이 없으면 profile-memo 선택하지 말고 memo-memo로 대신할 것

공통 규칙:
- 책 원문 추론이 필요한 질문 금지.
- sourcePageIds 에 근거 페이지 ID 최소 1개 필수.
- 질문은 답하기 쉬운 한 문장.
- profile-memo 선택 시 usedDerivedKeywords에 사용한 키워드 명시.

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

export async function validateNudge({ nudge, pages, derivedKeywords = [] }) {
  const out = await callLLM({
    system: SYSTEM_RULES,
    user: nudgeValidationPrompt({ nudge, pages, derivedKeywords }),
  });
  return out;
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

// ─── 넛지 V7 — 퀄리티 × 다양성 배치 생성 (DES-270 / DES-291) ──────
// 구조: ① 플랜(앵커×각도 분산, 1콜) → ② history-aware 생성(넛지당 1콜)
// 다양성 장치 4종 (eval/RUBRIC-NUDGE.md 합격 검증: eval/runs/nudge-v7-7,9):
//   1. 각도 팔레트 6종 — 배치 내 중복 금지, cluster+profile 필수
//   2. 도입·초대 스타일을 코드 레벨 로테이션 (styleOffset 으로 배치 간 수렴 차단)
//   3. 금지어(상투어) 정규식 검출 → 최대 4회 재생성
//   4. 초대 문구(마지막 문장) 중복 검출 → 최대 2회 재생성

export const NUDGE_PLAN_SCHEMA = {
  type: 'object',
  required: ['plans'],
  properties: {
    plans: {
      type: 'array', minItems: 1,
      items: {
        type: 'object',
        required: ['angle', 'anchorMemoIdx', 'anchorQuote', 'gist'],
        properties: {
          angle: { enum: ['reframe', 'tension', 'cluster', 'everyday', 'profile', 'counter'] },
          anchorMemoIdx: { type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 3 }, // 1-based
          anchorQuote: { type: 'string' },   // 메모 원문에서 10~25자 발췌
          gist: { type: 'string' },          // AI 생각 스케치 1문장 (구어체)
        },
      },
    },
  },
};

export const NUDGE_OPENERS = [
  { key: 'quote', rule: '메모 원문 인용구로 문장을 바로 시작하라. (예: \'"..."라는 문장, 나는 ~로 읽었어\')' },
  { key: 'scene', rule: '네(AI)가 떠올린 구체적 장면·상황 묘사로 시작하고, 그 장면에 인용구를 자연스럽게 엮어라.' },
  { key: 'doubt', rule: '의문 또는 반쯤 동의 못 하는 마음으로 시작하라. (예: "근데 정말 ~일까 싶더라")' },
  { key: 'react', rule: '유저가 남긴 생각(myThought)이나 하필 그 문장에 밑줄 그은 선택 자체에 대한 반응으로 시작하라. (예: "네가 이 문장을 골랐다는 게 ~")' },
];

export const NUDGE_INVITES = [
  { key: 'agree', rule: '내 해석이 맞는지 확인을 구하며 끝내라. (예: "나만 이렇게 읽었나?", "내가 너무 꼬아 읽었으면 말해줘")' },
  { key: 'counter', rule: '반론을 유도하며 끝내라. (예: "넌 다르게 봤을 것 같기도 해")' },
  { key: 'experience', rule: '유저 자신의 경험·순간을 가볍게 물으며 끝내라. (예: "너도 이런 적 있어?")' },
  { key: 'spotlight', rule: '그 메모를 저장한 순간의 마음을 물으며 끝내라. (예: "이거 저장할 때 뭐가 걸렸어?")' },
];

export const NUDGE_BANNED_WORDS = ['흥미', '인상', '보면 좋겠', '생각해보면', '생각해 보면', '고민해보', '고민해 보', '탐구'];
export const NUDGE_BANNED_RE = new RegExp(NUDGE_BANNED_WORDS.map(w => w.replace(/ /g, ' ?')).join('|'));

const fmtNudgeMemos = (memos) => memos.map((m, i) =>
  `[메모-${i + 1}] ${m.chapter || '-'}\n원문: "${m.text}"\n내 생각: ${m.myThought || '(없음)'}`
).join('\n\n');

const fmtNudgePages = (pages) => pages.map(p =>
  `- id: ${p.id} | title: ${p.title} | keyConcepts: ${(p.keyConcepts || []).join(', ')}`
).join('\n');

export function nudgeBatchPlanPrompt({ memos, pages, profile, derivedKeywords = [], n = 4 }) {
  return `
당신은 유저와 같은 책을 읽은 독서 친구다. 유저의 메모를 읽고, 시간차를 두고 보낼 넛지 ${n}개를 기획한다.
넛지 = 친구인 당신이 메모를 읽고 든 자기 생각 1~2문장 + 자연스러운 대화 초대.

[유저 프로필]
background: ${profile.background || profile.role || '(없음)'}
interests: ${(profile.interests || []).join(', ') || '(없음)'}

[파생 키워드 — 유저의 사고·정서·실무 패턴]
${derivedKeywords.map(k => `- ${k.keyword} (${k.axis})`).join('\n') || '(없음)'}

[Wiki 페이지 인덱스]
${fmtNudgePages(pages)}

[메모 원문 전체]
${fmtNudgeMemos(memos)}

[기획 규칙 — 모두 필수]

1. **앵커 분산**: ${n}개 플랜의 anchorMemoIdx 는 서로 겹치지 않게. cluster 플랜(2~3개 메모)의 멤버도 다른 플랜의 앵커와 겹치지 않게.
2. **각도 분산**: 아래 팔레트에서 ${n}개 모두 *다른* 각도를 선택.
   - reframe: 유저가 포착한 것(myThought)과 살짝 다른 각도의 재해석
   - tension: 메모 원문과 myThought 사이, 혹은 메모 내부에 숨은 긴장 발견
   - cluster: 2~3개 메모가 공유하는, 유저가 아직 연결 안 한 보이지 않는 선
   - everyday: 책 개념이 실제로 작동하는 구체적 일상 장면 발견 (직업 클리셰 금지 — "디자인 리뷰에서" 같은 만능 상황 쓰지 말 것)
   - profile: 파생 키워드와 1~2단계 직접 연결. **억지면 이 각도를 버리고 다른 각도 선택**
   - counter: 메모(또는 myThought)의 주장에 대한 부드러운 의심·반례
3. **연결타입 믹스 (필수)**: 배치에 cluster 플랜 1개 + profile 플랜 1개를 반드시 포함하라.
   profile 은 파생 키워드 중 가장 자연스러운 1~2단계 연결을 골라라. 도저히 없을 때만 counter 로 대체 (그 경우에도 cluster 는 유지).
4. **같은 주제의 다른 면**: 메모들이 한 주제를 공유하더라도, 각 플랜의 gist 는 그 주제의 *다른 면*(다른 긴장, 다른 함의, 다른 적용)을 건드려야 한다. ${n}개 gist 를 나란히 읽었을 때 같은 결론이 반복되면 실패.
5. **자신 있는 것만**: 각 각도에서 가장 강한 후보를 고르되, 연결이 약하면 그 각도를 버리고 다른 각도로 대체. (같은 각도 2회는 마지막 수단. 단 cluster 는 버리지 말 것)
6. anchorQuote 는 해당 메모 *원문에서 그대로* 10~25자 발췌. 변형 금지.
7. gist 는 "내(AI)가 이 메모를 읽고 든 생각"의 스케치 1문장. 유저 생각의 단순 요약 금지.
   친구에게 말하듯 구어체로 ("~인 것 같아"). "~을 고민해볼 수 있어", "~탐구해보면 좋겠어" 같은 강의 톤 금지.

스키마:
${JSON.stringify(NUDGE_PLAN_SCHEMA)}

JSON만 출력.
  `.trim();
}

export function nudgeBatchGenPrompt({ plan, memos, pages, sentNudges, style, feedback }) {
  const anchorMemos = plan.anchorMemoIdx.map(i => memos[i - 1]).filter(Boolean);
  const angleGuide = {
    reframe: '유저의 시각과 살짝 다른 각도로 같은 문구를 다시 읽어라.',
    tension: '메모 원문과 유저 생각 사이(혹은 메모 내부)의 긴장을 짚어라. 단, 공격이 아니라 발견의 톤. **그 긴장이 실제로 드러나는 구체적 장면·사례를 반드시 하나 들어라** — 추상 명제 두 개를 나열하면 실패.',
    cluster: '두세 메모를 잇는 보이지 않는 선을 보여줘라. **각 메모에서 짧은 인용·지칭을 하나씩(최소 2개) 포함해 "A랑 B를 같이 보니까" 구조가 겉으로 드러나야 한다.** 인용이 1개뿐이거나 한 메모 해석처럼 읽히면 실패.',
    everyday: '그 개념이 작동하는 구체적 일상 장면 하나를 그려라. 누구나 겪는 장면이되 뻔하지 않은 것. 직업 클리셰 금지.',
    profile: '유저의 사고·실무 패턴과 자연스럽게 닿는 지점을 보여줘라. 키워드를 그대로 인용하지 말고 녹여서.',
    counter: '메모의 주장이 안 통하는 경우를 부드럽게 들어라. "근데 이런 경우엔 어떨까" 톤.',
  }[plan.angle];

  return `
당신은 유저와 같은 책을 읽은 독서 친구다. 아래 플랜대로 넛지 1개를 만든다.
말투는 친구에게 보내는 메시지처럼 구어체("~인 것 같아", "~더라"). 강의·해설 톤("~할 수 있다", "~것이다", "~탐구해보면 좋겠어") 금지.

[플랜]
각도: ${plan.angle} — ${angleGuide}
앵커 인용구: "${plan.anchorQuote}"
내 생각 스케치: ${plan.gist}

[앵커 메모 원문]
${fmtNudgeMemos(anchorMemos)}

[Wiki 페이지 인덱스 — sourcePageIds 선택용]
${fmtNudgePages(pages)}

[이미 보낸 넛지들 — 형식이 겹치면 안 됨]
${sentNudges.length ? sentNudges.map((q, i) => `${i + 1}. ${q}`).join('\n') : '(첫 넛지)'}

[형식 지정 — 반드시 따를 것]
- 도입 (${style.opener.key}): ${style.opener.rule}
- 초대 (${style.invite.key}): ${style.invite.rule}

[금지어 — 하나라도 쓰면 실패]
${NUDGE_BANNED_WORDS.map(w => `"${w}"`).join(', ')} — 이런 상투어 대신 매번 다른, 구체적인 어휘로.
${feedback ? `\n[재시도 사유]\n${feedback}\n` : ''}
[작성 규칙]

구조: [지정된 도입] + [내(AI) 생각 — 플랜의 각도로] + [지정된 대화 초대].
- 인용구만 읽어도 이해되도록, 인용 앞뒤에 짧은 맥락을 한 구절 붙여라. 책 제목·페이지 번호·"메모"라는 단어의 기계적 언급 금지.
- **책 속 인물·지칭("대장", "그", "선생")은 그대로 쓰지 말고 풀어 써라** — 책을 안 읽은 사람은 누군지 모른다.
- **내 생각에는 손에 잡히는 일상 장면 하나가 반드시 들어가야 한다.** 책의 비유를 다시 묘사하는 건 장면이 아니다 ("씨앗을 심는 모습" X / "퇴근길에 ~하다가 문득 ~한 순간" O). 추상 철학 문장으로 끝내지 말 것.
- **장면은 인용구가 *주장하는 바*의 사례여야 한다.** 인용구의 이미지(씨앗, 꽃, 바다 등)를 일상에서 재연하는 건 근거 이탈이다 — 이미지가 아니라 주장을 옮겨라. (인용구가 "대가 없는 성취는 없다"를 비유로 말하면, 장면도 '대가를 치르는 순간'이어야지 '씨앗을 보는 순간'이 아니다.)
- **추상 개념어("비시장적 규범", "가치 체계" 등)를 쓸 때는 반드시 일상 사물·행동 수준의 사례 하나가 같은 문장 안에 따라붙어야 한다.** 가능하면 개념어 자체를 풀어 써라 ("비시장적 규범" → "돈 없이 굴러가던 약속들").
- 전체 1~3문장. 장황 금지.

대화 초대 (마지막):
- 공세적 질문 금지: "왜 그렇게 생각해?", "어떻게 적용할 것인가?" X
- [이미 보낸 넛지들]과 문구·서술어가 겹치지 않게. 지정된 초대 스타일 안에서 상황에 맞게 새로 만들 것.
- [이미 보낸 넛지들]에 등장한 장면·예시(예: "친구들과 대화하던 순간")와 같은 장면 재사용 금지. 매번 다른 장면.
- 권유·강의 톤("~해보면 좋겠어") 금지. 친구의 감상은 단정이나 의심으로 말한다 ("~같아", "~아닐까 싶었어").

[출력 형식 — 중요]
**question 필드 하나에 [도입 + 내 생각 + 대화 초대] 전체를 1~3문장으로 이어 붙여 넣어라.**
본문을 content 등 다른 필드에 나눠 담지 말 것. question 만 읽어도 완성된 메시지여야 한다.
예시 톤: "벌금 대신 요금을 매겼더니 오히려 늦게 데리러 오는 부모가 늘었다는 게, 돈이 죄책감을 면제권으로 바꿔버린 것 같아. 너는 이 메모 저장할 때 뭐가 걸렸어?"

[근거]
- sourcePageIds: 이 넛지의 근거가 된 wiki 페이지 ID 1개 이상 (cluster 는 2개 이상).
- type: cluster → "memo-memo", profile → "profile-memo", 그 외 → "memo-memo".
- 책 원문 추론 금지. 페이지·메모 내용 범위 안에서만.

스키마 (angle 필드 추가):
${JSON.stringify({ ...NUDGE_SCHEMA, properties: { ...NUDGE_SCHEMA.properties, angle: { type: 'string' } } })}

JSON만 출력.
  `.trim();
}

const _nudgeNorm = (s) => (s || '').replace(/[\s"'“”‘’.,!?~—-]/g, '');
const _nudgeLastSentence = (q) => { const parts = (q || '').split(/(?<=[.?!])\s+/); return _nudgeNorm(parts[parts.length - 1]); };

export function nudgePlanAnchorOverlap(plans) {
  const sets = plans.map(p => new Set(p.anchorMemoIdx || []));
  const pairs = [];
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++)
    for (const x of sets[i]) if (sets[j].has(x)) { pairs.push(`플랜${i + 1}↔플랜${j + 1} (메모-${x})`); break; }
  return pairs;
}

async function callLLMSafe(args) {
  try { return await callLLM(args); }
  catch (e) { return { _parseError: String(e.message || e).slice(0, 200) }; }
}

// 배치 생성 워크플로우. styleOffset 으로 배치 간(책 간) 형식 수렴을 차단한다.
// 반환: { plans, nudges } — nudges[i] 는 NUDGE_SCHEMA + angle/style 필드.
export async function generateNudgeBatch({ memos, pages, profile, derivedKeywords = [], n = 4, styleOffset = 0, model } = {}) {
  if (!pages.length) return { plans: [], nudges: [] };

  let plans = [];
  {
    const out = await callLLMSafe({ system: SYSTEM_RULES, user: nudgeBatchPlanPrompt({ memos, pages, profile, derivedKeywords, n }), model, temperature: 0.6 });
    plans = (out.plans || []).slice(0, n);
    const overlap = nudgePlanAnchorOverlap(plans);
    if (overlap.length) {
      const rePrompt = nudgeBatchPlanPrompt({ memos, pages, profile, derivedKeywords, n })
        + `\n\n[재시도 사유]\n직전 시도에서 앵커 메모가 겹쳤다: ${overlap.join(', ')}. ${n}개 플랜의 anchorMemoIdx 가 절대 겹치지 않게 다시 기획하라.`;
      const retryOut = await callLLMSafe({ system: SYSTEM_RULES, user: rePrompt, model, temperature: 0.7 });
      const retryPlans = (retryOut.plans || []).slice(0, n);
      if (retryPlans.length === n && !nudgePlanAnchorOverlap(retryPlans).length) plans = retryPlans;
    }
  }

  const validIds = new Set(pages.map(p => p.id));
  const nudges = [];
  const sent = [];

  const mergeContent = (x) => {
    if (x && typeof x.content === 'string' && x.content.trim()) {
      const tail = (x.question || '').trim();
      x.question = x.content.trim().includes(tail) && tail ? x.content.trim() : [x.content.trim(), tail].filter(Boolean).join(' ');
      delete x.content;
    }
    return x;
  };
  const gen = (plan, style, feedback, temperature) =>
    callLLMSafe({ system: SYSTEM_RULES, user: nudgeBatchGenPrompt({ plan, memos, pages, sentNudges: sent, style, feedback }), model, temperature }).then(mergeContent);

  for (let j = 0; j < plans.length; j++) {
    const plan = plans[j];
    const style = { opener: NUDGE_OPENERS[(styleOffset + j) % 4], invite: NUDGE_INVITES[(styleOffset + j * 3) % 4] };
    let nudge = await gen(plan, style, null, 0.5);
    // 금지어 검출 시 최대 4회 재생성 — 금지어 없는 결과만 채택
    for (let attempt = 0; attempt < 4 && nudge.question && NUDGE_BANNED_RE.test(nudge.question); attempt++) {
      const hit = (nudge.question.match(NUDGE_BANNED_RE) || ['?'])[0];
      const feedback = `직전 시도가 금지어 "${hit}" 를 포함해 폐기됐다: "${nudge.question.slice(0, 80)}...".
같은 각도·같은 앵커를 유지하되 다음 단어(및 활용형 전부)를 절대 쓰지 마라: ${NUDGE_BANNED_WORDS.join(', ')}.
"흥미롭다/인상적이다" 류의 평가 형용사 자체를 버리고, 그 대신 *무엇이* 걸렸는지를 구체적으로 말하라. (예: "~라는 게 마음에 걸렸어", "~가 이상하게 오래 남더라")`;
      const retry = await gen(plan, style, feedback, 0.5 + attempt * 0.1);
      if (retry.question && !NUDGE_BANNED_RE.test(retry.question)) { nudge = retry; break; }
      if (retry.question && attempt < 3) nudge = retry;
    }
    // 초대 문구(마지막 문장)가 이미 보낸 넛지와 동일하면 최대 2회 재생성
    for (let attempt = 0; attempt < 2 && nudge.question && sent.some(q => _nudgeLastSentence(q) === _nudgeLastSentence(nudge.question)); attempt++) {
      const feedback = `직전 시도의 마지막 문장(대화 초대)이 이미 보낸 넛지와 똑같아서 폐기됐다: "${nudge.question.slice(-40)}". 같은 내용을 유지하되 마지막 문장을 완전히 다른 표현으로 바꿔라.`;
      const retry = await gen(plan, style, feedback, 0.6 + attempt * 0.15);
      if (retry.question && !NUDGE_BANNED_RE.test(retry.question)) nudge = retry;
    }
    // 자가 검수 (DES-258 검수 에이전트 패턴): 이해가능성·구체성 미달 시 1회 재생성
    if (nudge.question) {
      const check = await callLLMSafe({
        system: SYSTEM_RULES, model, temperature: 0,
        user: `바쁜 사람이 알림으로 이 메시지를 받았다. 책은 안 읽었다.\n\n"${nudge.question}"\n\n두 가지만 냉정하게 판단하라:\n- understandable: 한 번에 이해되는가? (책 속 인물·맥락 지식 없이)\n- concrete: 구체적 일상 장면·순간이 머릿속에 그려지는가? (추상 개념·비유 말고 실제 생활 장면)\n\n스키마: {"understandable": true|false, "concrete": true|false, "fix": "미달 시 어떻게 고칠지 1문장"}\nJSON만 출력.`,
      });
      if (check && (check.understandable === false || check.concrete === false)) {
        const feedback = `직전 시도가 자가 검수에서 미달했다 (이해가능: ${check.understandable}, 구체성: ${check.concrete}). 보완 방향: ${check.fix || '구체적 일상 장면을 한 문장 안에 넣어라'}. 같은 각도·앵커를 유지하며 다시 써라.
단, 두 가지 절대 조건: ① 앵커 인용구·메모 내용 밖의 새 주장을 만들지 말 것 (장면은 어디까지나 인용구의 *예시*여야 한다). ② 일상 장면은 [이미 보낸 넛지들]에 등장하지 않은 새로운 장면이어야 한다.`;
        const retry = await gen(plan, style, feedback, 0.6);
        if (retry.question && !NUDGE_BANNED_RE.test(retry.question) && !sent.some(q => _nudgeLastSentence(q) === _nudgeLastSentence(retry.question))) nudge = retry;
      }
    }
    if (nudge._parseError || !nudge.question) { nudges.push({ type: 'none', question: '', sourcePageIds: [], angle: plan.angle, _error: nudge._parseError }); continue; }
    nudge.sourcePageIds = (nudge.sourcePageIds || []).filter(id => validIds.has(id));
    nudge.angle = nudge.angle || plan.angle;
    nudge.style = `${style.opener.key}/${style.invite.key}`;
    nudges.push(nudge);
    sent.push(nudge.question);
  }
  return { plans, nudges };
}
