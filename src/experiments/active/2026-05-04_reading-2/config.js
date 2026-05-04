// 0504 2 — 채팅 → LLM Wiki (개인 위키 빌더)
export const config = {
  view: { transitionMs: 320 },
  chat: {
    typingMsPerChar: 50,         // CSS keyframe charFadeIn 과 연동 (둘 다 같이 변경)
    typingEasing: 'linear',
    aiReplyDelayMs: 600,
    seedDelayMs: 350,
    savedBadgeDelayMs: 400,      // AI 메시지 직후 "위키 저장됨" 배지 등장 지연
  },
  wiki: { canvasH: 280 },
};

// AI가 채팅 안에서 자연스럽게 묻는 시작 멘트
export const openingPrompts = {
  greeting: '안녕하세요. 오늘도 넥서스 메모를 시작해볼게요.\n\n본격적으로 들어가기 전에, 가볍게 두 가지만 물어볼게요. 적어주시는 답은 위키의 출발점 페이지로 자연스럽게 저장될 거예요.',
  askWhy:   '먼저, 왜 이 책을 읽기 시작했어요?',
  ackWhy:   ({ why }) => `"${why}" — 그 동기가 책을 읽는 내내 어떤 부분을 더 예민하게 만들지 궁금해지네요.`,
  askGoal:  '그럼 이 책에서 얻고 싶은 건 뭐예요? 구체적이지 않아도 괜찮아요.',
  ackGoal:  ({ goal }) => `"${goal}" — 좋네요. 그 기준이 있으면 어떤 챕터에서 멈춰서 더 오래 머물지가 자연스럽게 정해질 거예요.`,
  startMemo: '그럼 본격적으로 이야기해볼까요. 지금까지 읽은 부분에서, 가장 마음에 걸렸던 문장이나 장면을 하나만 꺼내볼래요? 짧게라도, 통째로 옮겨와도 좋아요.',
};

// 빠른 응답 칩 — AI 질문 단계마다 다른 세트
export const quickReplies = {
  why: [
    '요즘 AI가 너무 빠르게 변해서',
    '하라리의 다음 책이 궁금해서',
    '업무에 쓸 인사이트를 찾으려고',
    '주변에서 추천받아서',
  ],
  goal: [
    'AI 시대를 보는 나만의 관점',
    '업무에 적용할 통찰 3가지',
    '하라리의 핵심 논지 정리',
    '토론용 메모',
  ],
};

// 메모 모드 진입 후의 AI 응답 (라운드로빈) — 토론을 끌어내는 게 1순위, 위키 저장은 부수효과
export const aiReplies = [
  {
    // 짧은 응답일 때
    text: '그 부분을 짚으셨다는 게 의미가 있네요. 한 발짝 더 들어가볼게요 — 그 문장이 본인이 평소에 일하거나 사람을 대할 때의 어떤 감각을 건드렸어요?',
  },
  {
    text: '그 경험과 책의 주장을 나란히 놓으면, 하라리의 말이 더 강해지는 쪽이에요, 아니면 오히려 반박하고 싶어지는 쪽이에요?',
  },
  {
    text: '재밌는 지점이에요. 그럼 책 바깥으로 한 번 끌어내볼게요 — 본인이 일하는 환경에서 이 개념을 적용해보면 가장 먼저 무엇이 보일 것 같아요?',
    saved: ['알고리즘 권력'],
  },
  {
    text: '거기까지 가셨으면, 책의 다른 챕터와 연결될 가능성이 보여요. "신화"와 "관료제"를 대비시키는 부분 기억나세요? 방금 말씀하신 게 그 둘 중 어디에 더 가까운지 한번 골라본다면요?',
  },
];

// 사용자가 인용/긴 글을 붙여넣었을 때 — 본문을 직접 읽고 반응하는 톤
export const quoteReply = ({ excerpt, theme }) =>
  `읽었어요. 특히 이 부분이 핵심이라고 본 거 맞죠 — “${excerpt}” 라는 대목.\n\n하라리가 여기서 정보를 ‘재현’이 아니라 ‘연결’로 정의 내리는 게 흥미로워요. 별자리·선전·군가를 같은 층위에 놓는 것도 도발적이고요.\n\n그런데 본인은 이 정의에 어떻게 반응했어요? 그동안 정보를 ‘진실의 도구’로 다뤄왔다면, 이 문장 앞에서 살짝 불편해지지 않았어요?`;

// 위키 인덱스 — 사용자가 책에 대해 만들어가고 있는 페이지들
export const wikiPages = [
  {
    id: 'info-network',
    title: '정보 네트워크',
    kind: 'concept',
    summary: '책의 가장 큰 우산 개념. 사회를 묶는 신경계로서의 정보.',
    updated: '방금',
    links: ['관료제', '신화', '알고리즘 권력', '자기수정'],
    body: `# 정보 네트워크

하라리는 정보를 단순한 진실의 도구가 아니라, 사회를 묶고 권력을 분배하는 **신경계**로 본다.

## 내 생각
- 회사 내부 의사결정도 결국 '정보 네트워크'다.
- 이 비유가 책 전체의 척추.

## 연결된 페이지
- [[관료제]] — 정보를 처리하는 형식
- [[신화]] — 정보에 의미를 부여하는 형식
- [[알고리즘 권력]] — 새로운 처리자
- [[자기수정]] — 네트워크의 건강성 지표`,
  },
  {
    id: 'algorithmic-power',
    title: '알고리즘 권력',
    kind: 'concept',
    summary: '신경계의 통제 권한을 갖는 새로운 관료제.',
    updated: '방금',
    isNew: true,
    links: ['관료제', '정보 네트워크', '관료제 vs 알고리즘'],
    body: `# 알고리즘 권력

새로 만들어진 페이지. 이번 세션에서 떠오른 개념.

## 핵심 주장
> 알고리즘은 "정보 네트워크"의 새로운 신경 다발이다.

## 내 메모
- 추천 시스템도 이 범주.
- '의도하지 않은 권력'이라는 점이 핵심.

## 관련
- [[관료제]] — 닮은 점/다른 점
- [[관료제 vs 알고리즘]] — 비교 페이지로 분리됨`,
  },
  {
    id: 'bureaucracy-vs-myth',
    title: '관료제 vs 신화',
    kind: 'compare',
    summary: '하라리 책의 척추 — 질서와 의미의 두 메커니즘.',
    updated: '방금',
    links: ['정보 네트워크', '신화', '관료제'],
    body: `# 관료제 vs 신화

| 축 | 관료제 | 신화 |
| --- | --- | --- |
| 역할 | 질서 | 의미 |
| 형식 | 규칙·문서 | 이야기·상징 |
| 실패할 때 | 무기력 | 광기 |

## 내 결론
둘 다 살아있어야 사회가 자기수정할 수 있다.`,
  },
  {
    id: 'self-correction',
    title: '자기수정',
    kind: 'concept',
    summary: '강한 정보 네트워크의 핵심 — 오류를 발견하고 고치는 능력.',
    updated: '어제',
    links: ['정보 네트워크', '알고리즘 권력'],
    body: `# 자기수정

> 진실 그 자체가 아니라, 오류를 발견하고 고치는 능력이 네트워크의 강도를 결정한다.

## 적용
- 회의에서 반대 의견을 자르지 않는 것.
- 측정 지표를 주기적으로 재검토하는 것.`,
  },
  {
    id: 'why-i-read',
    title: '내가 이 책을 읽는 이유',
    kind: 'meta',
    summary: '대화 첫머리에 적은 동기. 모든 페이지의 출발점.',
    updated: '오늘',
    pinned: true,
    links: ['이 책에서 얻고 싶은 것'],
    body: `# 내가 이 책을 읽는 이유

(첫 대화에서 답해주신 내용이 여기에 저장됩니다.)`,
  },
  {
    id: 'reading-goal',
    title: '이 책에서 얻고 싶은 것',
    kind: 'meta',
    summary: '독서 목표. 위키의 우선순위를 정하는 기준.',
    updated: '오늘',
    pinned: true,
    links: ['내가 이 책을 읽는 이유'],
    body: `# 이 책에서 얻고 싶은 것

(첫 대화에서 답해주신 내용이 여기에 저장됩니다.)`,
  },
  {
    id: 'quotes',
    title: '인용',
    kind: 'collection',
    summary: '책에서 마음에 걸린 문장들 모음.',
    updated: '오늘',
    links: ['정보 네트워크', '알고리즘 권력'],
    body: `# 인용

대화 중에 언급한 인상적인 문장이 자동으로 모입니다.`,
  },
];

export const wikiLog = [
  { ts: '[오늘 21:04]', kind: 'session', text: '메모 세션 종료 · 4개 페이지 영향' },
  { ts: '[오늘 20:48]', kind: 'ingest',  text: '도입 대화 ingest · 2개 페이지 생성' },
  { ts: '[어제 11:30]', kind: 'lint',    text: '린트 통과 · 고아 페이지 0개' },
  { ts: '[5월 1일]',    kind: 'session', text: '첫 세션 · 「자기수정」 페이지 생성' },
];

export const wikiGraph = {
  nodes: [
    { id: 'info-network',       label: '정보 네트워크', center: true, x: 0.50, y: 0.50 },
    { id: 'bureaucracy-vs-myth',label: '관료제 vs 신화',               x: 0.20, y: 0.22 },
    { id: 'quotes',             label: '인용',                          x: 0.82, y: 0.22 },
    { id: 'algorithmic-power',  label: '알고리즘 권력',                 x: 0.16, y: 0.78 },
    { id: 'self-correction',    label: '자기수정',                      x: 0.84, y: 0.78 },
    { id: 'why-i-read',         label: '왜 이 책을',                    x: 0.50, y: 0.95 },
  ],
  edges: [
    ['info-network','bureaucracy-vs-myth'],
    ['info-network','algorithmic-power'],
    ['info-network','self-correction'],
    ['info-network','quotes'],
    ['info-network','why-i-read'],
    ['algorithmic-power','self-correction'],
    ['quotes','algorithmic-power'],
  ],
};
