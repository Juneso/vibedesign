# 실험실 위키

이 문서는 프로토타입 작업의 **로그 + 아키텍처 메모** 입니다.
LLM-wiki 패턴(`## [YYYY-MM-DD] kind | title` 접두어)을 따릅니다.

```
grep "^## \[" docs/wiki.md | tail -10
```

---

## Index

### 활성 실험
- **[2026-05-04_reading-1](../src/experiments/active/2026-05-04_reading-1/)** — 책 선택 → AI 브리핑 + 독서 전략 + 목표 설정 (단일 페이지)
- **[2026-05-04_reading-2](../src/experiments/active/2026-05-04_reading-2/)** — 풀 스택 독서 도우미 앱 (홈/서재/Quote/내정보 + 챗봇 + LLM-wiki + Google Books)
- **[2026-05-04_reading-3](../src/experiments/active/2026-05-04_reading-3/)** — (다른 작업자 진행 중)

### 핵심 개념 페이지
- [LLM Wiki 패턴](#llm-wiki-패턴) — 채팅 토론 결과를 페이지로 누적하는 방식
- [앱 셸 라우팅](#앱-셸-라우팅) — main-tab vs 모달/플로우 구분
- [디자인 토큰](#디자인-토큰) — 레드브라운 단색 액센트 + 헤어라인 디바이더

---

## Log

### `## [2026-05-05] session | reading-2 외곽 앱 구조 + Google Books 연동`

**OMC 팀작업** (lead + 3 parallel agents). 페이지 2를 단일 챗봇/위키 화면 → 풀 독서 앱으로 확장.

**완성 구조**
```
reading-2/
├── index.html        7개 뷰 + 하단 nav (홈/서재/Quote+/내정보)
├── script.js         라우터 + 기존 챗·위키 로직 보존
├── config.js         seedBooks(넥서스) + seedQuotes + currentUser
├── services/
│   ├── storage.js    localStorage Books·Quotes + onChange pub/sub
│   └── books-api.js  Google Books 공개 API 래퍼
└── views/
    ├── home.js       지금 읽는 책 / 최근 인용 / 가로 서재
    ├── library.js    3-col 그리드 + 검색 모달 (300ms 디바운스)
    ├── quote.js      책 선택 바텀시트 + 4-필드 폼
    └── profile.js    헤더 + 3-stat + 설정 6행
```

**팀 분할**
- `team-lead` (셸·라우터·서비스): index/style/script 스캐폴딩, services/storage·books-api, views/home
- `library-eng`: views/library.js — 서재 그리드 + Google Books 검색/추가, `Books.onChange` 구독
- `quote-eng`: views/quote.js — 책 셀렉터 바텀시트, 검증, save 핸들러 재바인딩
- `profile-eng`: views/profile.js — currentUser 헤더, 동적 stat 카운트

**핵심 결정**
- 챗봇·위키는 *그대로 보존* — 새 라우터가 기존 view 위에 메인 탭 셸을 덧씌움
- bnav는 `home/library/profile`에서만 노출. `chat/notes/page-detail/*-modal`에서는 자동 hide
- 챗에서 80자 넘는 인용 입력 시 `Quotes.add()`로 자동 저장 → wiki/UI 양쪽에 자연스럽게 흐름

**커밋**: `feat(0504-2): 독서 앱 외곽 구조 + Google Books 연동` (e17e8f6)

→ [앱 셸 라우팅](#앱-셸-라우팅), [LLM Wiki 패턴](#llm-wiki-패턴)

---

### `## [2026-05-04] session | reading-2 LLM-wiki + 그래프 드래그`

기존 채팅 → 위키 흐름 완성. 그래프 노드 드래그에 BFS 깊이 2 이웃 끌어당김 + 스프링 복귀 모션. Robinhood 스타일로 평면화, 레드브라운 단색 액센트로 통일.

**커밋**: `7078120` (인스펙터 클라이언트 추가)

---

### `## [2026-05-04] session | reading-1·2 초기 셋업`

페이지 1: 책 브리핑 + 독서 전략 + 목표 설정. 페이지 2: 채팅 → LLM-wiki(개인 위키 빌더). Dot 스타일 챗 UI(말풍선 없는 AI 본문, 웜톤 그라디언트), 글자별 50ms 페이드인.

**커밋**: `c637b5a` (초기 푸시), `38ea997` (reading-3 머지)

---

## 핵심 개념

### LLM Wiki 패턴

채팅으로 토론한 결과가 *위키 페이지*로 자동 누적되는 아키텍처. 사용자는 토론에 집중하고, AI가 페이지 작성/링크/갱신을 백그라운드로 처리.

- **3-layer**: 원본 소스(immutable) → 위키 페이지(LLM이 작성/수정) → 스키마(이 문서가 그 역할)
- **위키 강조 ≠ 토론 강조**: 위키는 *결과*일 뿐, 메인은 토론. AI 응답이 "위키 저장됨" 멘트를 강조하면 안 됨 — 메타 배지로 약하게 표시
- **이번 세션 정리(diff)**: 종료 직후 `+ 새 페이지 / ~ 갱신 / ↔ 연결` 형태로 이번 대화로 위키가 어떻게 변했는지 한 화면

→ 구현: [reading-2/script.js](../src/experiments/active/2026-05-04_reading-2/script.js), [config.js wikiPages/wikiGraph](../src/experiments/active/2026-05-04_reading-2/config.js)

### 앱 셸 라우팅

뷰는 두 종류로 나뉨:
- **메인 탭 (`main-tab`)**: home/library/profile — bnav 노출, 메모리에 init 한 번 + 진입할 때마다 update
- **풀스크린 플로우**: chat/notes/page-detail/book-search/quote-add — bnav 자동 hide

뷰 모듈 인터페이스:
```js
import * as foo from './views/foo.js';
foo.init(deps);    // 첫 진입
foo.update(deps);  // 이후 진입
foo.open(deps);    // 모달성 뷰 (예: quote.open)
```

`deps`는 라우터가 람다로 감싼 메서드 묶음 — 뷰끼리 직접 import 안 함.

### 디자인 토큰

레드브라운 단색 액센트로 통일. 카드/그림자 자제. 헤어라인 디바이더로 섹션 구분.

```css
:root {
  --accent:      #8B3A1F;
  --accent-soft: rgba(139, 58, 31, 0.08);
  --hairline:    rgba(0, 0, 0, 0.07);
}
body[data-theme="dark"] {
  --accent:      #D96A48;
  --accent-soft: rgba(217, 106, 72, 0.14);
  --hairline:    rgba(255, 255, 255, 0.08);
}
```

폰트: Pretendard. 자간 -0.02em ~ -0.03em, 행간 본문 1.35.

채팅 화면만 예외적으로 웜톤 그라디언트(Dot 레퍼런스) — 톤을 분리해서 "토론 모드"임을 시각적으로 알림.
