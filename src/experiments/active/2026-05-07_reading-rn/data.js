// 0507 RN — config / 시드 / 위키 데이터
// 0504-2/config.js에서 그대로 가져옴 (RN/RN-Web 공유)

export const config = {
  view: { transitionMs: 320 },
  chat: {
    typingMsPerChar: 50,
    typingEasing: 'linear',
    aiReplyDelayMs: 600,
    seedDelayMs: 350,
    savedBadgeDelayMs: 400,
  },
  wiki: { canvasH: 280 },
};

export const openingPrompts = {
  greeting: '안녕하세요. 오늘도 넥서스 메모를 시작해볼게요.\n\n본격적으로 들어가기 전에, 가볍게 두 가지만 물어볼게요. 적어주시는 답은 위키의 출발점 페이지로 자연스럽게 저장될 거예요.',
  askWhy:   '먼저, 왜 이 책을 읽기 시작했어요?',
  ackWhy:   ({ why }) => `"${why}" — 그 동기가 책을 읽는 내내 어떤 부분을 더 예민하게 만들지 궁금해지네요.`,
  askGoal:  '그럼 이 책에서 얻고 싶은 건 뭐예요? 구체적이지 않아도 괜찮아요.',
  ackGoal:  ({ goal }) => `"${goal}" — 좋네요. 그 기준이 있으면 어떤 챕터에서 멈춰서 더 오래 머물지가 자연스럽게 정해질 거예요.`,
  startMemo: '그럼 본격적으로 이야기해볼까요. 지금까지 읽은 부분에서, 가장 마음에 걸렸던 문장이나 장면을 하나만 꺼내볼래요?',
};

export const quickReplies = {
  why: ['요즘 AI가 너무 빠르게 변해서', '하라리의 다음 책이 궁금해서', '업무에 쓸 인사이트를 찾으려고', '주변에서 추천받아서'],
  goal: ['AI 시대를 보는 나만의 관점', '업무에 적용할 통찰 3가지', '하라리의 핵심 논지 정리', '토론용 메모'],
};

export const aiReplies = [
  { text: '그 부분을 짚으셨다는 게 의미가 있네요. 한 발짝 더 들어가볼게요 — 그 문장이 본인이 평소에 일하거나 사람을 대할 때의 어떤 감각을 건드렸어요?' },
  { text: '그 경험과 책의 주장을 나란히 놓으면, 하라리의 말이 더 강해지는 쪽이에요, 아니면 오히려 반박하고 싶어지는 쪽이에요?' },
  { text: '재밌는 지점이에요. 그럼 책 바깥으로 한 번 끌어내볼게요 — 본인이 일하는 환경에서 이 개념을 적용해보면 가장 먼저 무엇이 보일 것 같아요?', saved: ['알고리즘 권력'] },
  { text: '거기까지 가셨으면, 책의 다른 챕터와 연결될 가능성이 보여요. "신화"와 "관료제"를 대비시키는 부분 기억나세요?' },
];

export const quoteReply = ({ excerpt }) =>
  `읽었어요. 특히 이 부분이 핵심이라고 본 거 맞죠 — "${excerpt}" 라는 대목.\n\n하라리가 여기서 정보를 '재현'이 아니라 '연결'로 정의 내리는 게 흥미로워요.`;

export const wikiPages = [
  { id: 'info-network', title: '정보 네트워크', kind: 'concept', summary: '책의 가장 큰 우산 개념. 사회를 묶는 신경계로서의 정보.', updated: '방금', links: ['관료제', '신화', '알고리즘 권력', '자기수정'],
    body: `# 정보 네트워크\n\n하라리는 정보를 단순한 진실의 도구가 아니라, 사회를 묶고 권력을 분배하는 **신경계**로 본다.\n\n## 내 생각\n- 회사 내부 의사결정도 결국 '정보 네트워크'다.\n- 이 비유가 책 전체의 척추.\n\n## 연결된 페이지\n- [[관료제]]\n- [[신화]]\n- [[알고리즘 권력]]\n- [[자기수정]]` },
  { id: 'algorithmic-power', title: '알고리즘 권력', kind: 'concept', summary: '신경계의 통제 권한을 갖는 새로운 관료제.', updated: '방금', isNew: true, links: ['관료제', '정보 네트워크'],
    body: `# 알고리즘 권력\n\n새로 만들어진 페이지.\n\n## 핵심 주장\n> 알고리즘은 "정보 네트워크"의 새로운 신경 다발이다.\n\n## 관련\n- [[관료제]]` },
  { id: 'bureaucracy-vs-myth', title: '관료제 vs 신화', kind: 'compare', summary: '하라리 책의 척추 — 질서와 의미의 두 메커니즘.', updated: '방금', links: ['정보 네트워크'],
    body: `# 관료제 vs 신화\n\n| 축 | 관료제 | 신화 |\n| --- | --- | --- |\n| 역할 | 질서 | 의미 |\n| 형식 | 규칙·문서 | 이야기·상징 |` },
  { id: 'self-correction', title: '자기수정', kind: 'concept', summary: '강한 정보 네트워크의 핵심 — 오류를 발견하고 고치는 능력.', updated: '어제', links: ['정보 네트워크'],
    body: `# 자기수정\n\n> 진실 그 자체가 아니라, 오류를 발견하고 고치는 능력이 네트워크의 강도를 결정한다.` },
  { id: 'why-i-read', title: '내가 이 책을 읽는 이유', kind: 'meta', summary: '대화 첫머리에 적은 동기.', updated: '오늘', pinned: true, links: ['이 책에서 얻고 싶은 것'],
    body: `# 내가 이 책을 읽는 이유\n\n(첫 대화에서 답해주신 내용이 여기에 저장됩니다.)` },
  { id: 'reading-goal', title: '이 책에서 얻고 싶은 것', kind: 'meta', summary: '독서 목표.', updated: '오늘', pinned: true, links: ['내가 이 책을 읽는 이유'],
    body: `# 이 책에서 얻고 싶은 것\n\n(첫 대화에서 답해주신 내용이 여기에 저장됩니다.)` },
  { id: 'quotes', title: '인용', kind: 'collection', summary: '책에서 마음에 걸린 문장들 모음.', updated: '오늘', links: ['정보 네트워크'],
    body: `# 인용\n\n대화 중에 언급한 인상적인 문장이 자동으로 모입니다.` },
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

export const seedBooks = [
  { id: 'nexus-default', title: '넥서스', subtitle: '석기시대부터 AI까지의 정보 네트워크 역사', authors: ['유발 하라리'], cover: '', publisher: '김영사', publishedDate: '2024', pageCount: 656, isCurrent: true },
  { id: 'sapiens', title: '사피엔스', authors: ['유발 하라리'], cover: '', publisher: '김영사', publishedDate: '2015', pageCount: 636 },
  { id: 'maintenance-of-everything', title: 'Maintenance: Of Everything', authors: ['Stewart Brand'], cover: '', publisher: 'Stripe Press', publishedDate: '2025', pageCount: 320, spineColor: '#D9CFAE' },
  { id: 'origins-of-efficiency', title: 'The Origins of Efficiency', authors: ['Brian Potter'], cover: '', publisher: 'Stripe Press', publishedDate: '2025', pageCount: 412, spineColor: '#2A3848' },
  { id: 'scaling-era', title: 'The Scaling Era', authors: ['Dwarkesh Patel'], cover: '', publisher: 'Stripe Press', publishedDate: '2025', pageCount: 380, spineColor: '#5A5E62' },
  { id: 'boom', title: 'BOOM', authors: ['Hobart and Huber'], cover: '', publisher: 'Stripe Press', publishedDate: '2024', pageCount: 290, spineColor: '#5C1B33' },
  { id: 'atomic-habits', title: '아주 작은 습관의 힘', authors: ['제임스 클리어'], cover: '', publisher: '비즈니스북스', publishedDate: '2019', pageCount: 384, spineColor: '#1E2A24' },
  { id: 'thinking-fast-slow', title: '생각에 관한 생각', authors: ['대니얼 카너먼'], cover: '', publisher: '김영사', publishedDate: '2018', pageCount: 728, spineColor: '#3D2A1E' },
  { id: 'homo-deus', title: '호모 데우스', authors: ['유발 하라리'], cover: '', publisher: '김영사', publishedDate: '2017', pageCount: 636 },
  { id: 'demon-haunted', title: 'The Demon-Haunted World', authors: ['Carl Sagan'], cover: '', publisher: 'Ballantine', publishedDate: '1996', pageCount: 480, spineColor: '#2A3848' },
  { id: 'godel-escher-bach', title: 'Gödel, Escher, Bach', authors: ['Douglas Hofstadter'], cover: '', publisher: 'Basic Books', publishedDate: '1979', pageCount: 824, spineColor: '#3D2A1E' },
  { id: 'shape-of-things', title: 'The Shape of Things', authors: ['Vilém Flusser'], cover: '', publisher: 'Reaktion', publishedDate: '1999', pageCount: 200, spineColor: '#1E2A24' },
  { id: 'beautiful-questions', title: 'A Beautiful Question', authors: ['Frank Wilczek'], cover: '', publisher: 'Penguin Press', publishedDate: '2015', pageCount: 448, spineColor: '#5C1B33' },
  { id: 'moneyball', title: 'Moneyball', authors: ['Michael Lewis'], cover: '', publisher: 'Norton', publishedDate: '2003', pageCount: 320, spineColor: '#5A5E62' },
  { id: 'dune', title: 'Dune', authors: ['Frank Herbert'], cover: '', publisher: 'Chilton', publishedDate: '1965', pageCount: 688, spineColor: '#3D2A1E' },
  { id: 'fooled-randomness', title: 'Fooled by Randomness', authors: ['Nassim Taleb'], cover: '', publisher: 'Random House', publishedDate: '2001', pageCount: 368, spineColor: '#D9CFAE' },
  { id: 'pragmatic-programmer', title: 'The Pragmatic Programmer', authors: ['Hunt', 'Thomas'], cover: '', publisher: 'Addison-Wesley', publishedDate: '1999', pageCount: 320, spineColor: '#2A3848' },
  { id: 'design-of-everyday', title: 'The Design of Everyday Things', authors: ['Don Norman'], cover: '', publisher: 'Basic Books', publishedDate: '1988', pageCount: 368, spineColor: '#1E2A24' },
  { id: 'master-and-his-emissary', title: 'The Master and His Emissary', authors: ['Iain McGilchrist'], cover: '', publisher: 'Yale UP', publishedDate: '2009', pageCount: 608, spineColor: '#5A5E62' },
  { id: 'brothers-karamazov', title: 'The Brothers Karamazov', authors: ['Dostoyevsky'], cover: '', publisher: 'Vintage', publishedDate: '1880', pageCount: 796, spineColor: '#5C1B33' },
];

export const seedQuotes = [
  { bookId: 'nexus-default', text: '정보의 결정적인 특징은 재현이 아니라 연결이며, 따라서 정보란 서로 다른 지점들을 네트워크로 연결하는 무언가다.', page: '37', memo: '책 전체의 척추가 되는 문장.', createdAt: Date.now() - 1000 * 60 * 60 * 8 },
  { bookId: 'nexus-default', text: '강한 정보 네트워크는 진실 그 자체가 아니라 오류를 발견하고 고치는 능력에 의해 결정된다.', page: '142', memo: '자기수정 메커니즘.', createdAt: Date.now() - 1000 * 60 * 60 * 30 },
];

export const currentUser = { name: '준서', handle: '@junseo', initial: '준', joinedAt: '2026-01' };
