# Book Wiki MVP-0 — 기획 로그

> 2026-05-24 시작. 1인용 웹 프로토. SwiftUI 본 구현 전 가치 검증용.
> 다음 세션에서 맥락 끊기지 않게 이 문서를 먼저 읽을 것.

---

## 한 줄 정의
독서 메모가 LLM Wiki(Karpathy 패턴) 위에 복리로 누적되고, 질문형 넛지로 다시 사용자에게 돌아오는 모바일 앱.

## 핵심 가설
"독서 메모가 LLM을 통해 누적·연결될 때 한 명의 사고에 실질적 영향을 준다."
- 1인용 사용으로 3주 검증 → 가치 있으면 SwiftUI 이행 + 온디바이스 모델 도입.
- 가치 없으면 컨셉 피벗.

## 확정된 결정
1. **Wiki 단위 = 통합(전역) + 책별 sub-wiki 하이브리드.** 책 간 연결이 핵심 가치.
2. **넛지 = 질문형.** 사용자 답변이 다시 wiki에 편입되는 폐쇄 루프. 환각 방지가 1순위.
3. **기본 프로필**은 온보딩의 최소 개인화 장치. wiki 누적되면 자동으로 고도화.
4. **본 서비스 비용 전략**: Apple Foundation Model 온디바이스 + 책 전체 X, 메모만 ingest. 책 컨텍스트는 알라딘 API 요약·목차.
5. **모바일 그래프뷰**: 누적되고 있다는 대시보드 성격만. 본격 wiki 작업 X.
6. **콜드 스타트**: 최소 3번의 문장 수집을 빠르게 유도 + 알라딘 요약·목차 + (추후) 공개 서평.
7. **출처 표시 강제**: 모든 wiki 문장에 source 각주.
8. **차별점 vs ChatGPT**: 메모리 = 책+맥락 위키 호출 → 개인화 깊이.
9. **북극성 지표 = 30일 후 회상률(C)**, 선행 = 주간 넛지 응답수(A).

## 환각 방지 룰 (넛지)
넛지는 아래 3종으로만:
- (a) 메모-메모 연결 (같은 책 내)
- (b) 배경-메모 연결 (사용자 프로필 ↔ 메모 개념)
- (c) 책-책 연결 (다른 책 wiki 페이지와 개념 겹침)

→ **책 원문 추론이 필요한 질문은 금지.** 모든 넛지는 근거 페이지 ID 첨부 필수, 근거 없으면 발행 차단.

## 데이터 모델 (frontmatter)
모든 wiki 페이지에 출처 강제:
```
type: concept | entity | reflection | connection
sources:
  - {kind: memo|book-meta|user-answer|llm-inference, id, confidence?}
linkedBooks: []
```
LLM 출력은 항상 JSON 스키마, 자유 서술 금지. input 3000 토큰 이하 (온디바이스 이행 대비).

## 화면 5개 (모바일 393×852)
1. 책 추가 (알라딘 검색 → 선택 → 왜 읽는지 1줄)
2. 책 상세 (요약·목차·메모 입력·sub-wiki·Ingest)
3. 메모 캡처 (텍스트 + 챕터 드롭다운 + 내 생각 1줄)
4. 넛지 (오늘의 질문 1개 + 답변)
5. Wiki 뷰 (전역+책별, 출처 각주 표시)

바텀 탭: `책` / `넛지` / `Wiki`

## 핵심 워크플로우 3개
### A. Ingest
메모 N개 → LLM이 목차 매핑 + 키 개념 추출 → 기존 wiki와 머지 판단 → JSON patch 생성 → **사용자 diff 승인** → 파일 반영 + log.md.
→ Step 4 승인은 프로토 전용. 본 서비스에선 자동화.

### B. Nudge 생성
조건 만족하는 3종 중 우선순위로 1개 발행. 근거 페이지 ID 강제.

### C. Nudge 답변 → wiki 반영
답변은 `user-answer` 타입 메모로 저장 → 근거 페이지 ingest 재실행.

## 의도적으로 안 만드는 것 (MVP-0)
그래프뷰, 푸시, 인증, 다중 책 동시 ingest, 검색, OCR, 음성, 공유, 다크모드, 온보딩 튜토리얼, 일지 페이지.

## 측정
사용자 일지 X. 대신 `log.md`에 모든 이벤트(ingest input/output, 넛지 발행, 사용자 답변, 페이지 diff) 기록.
3주 후 로그 직접 분석 또는 LLM에 분석 의뢰.

## 일정
- W1: 데이터 모델 + 모바일 셸 + 책 추가/메모 입력 + 알라딘 API
- W2: Ingest 워크플로우 + diff 승인 시트 + Wiki 뷰
- W3: 넛지 루프 + 사용 시작 + 프롬프트 튜닝

## 스택
- React 19 + Tailwind v4 (실험실 루트 Vite + @tailwindcss/vite 활용)
- 저장: localStorage (프로토 한정. 본 구현은 마크다운 파일+git 컨셉)
- LLM: 우선 Claude API 어댑터로 품질 천장 확인. 추후 교체.
- 책 메타: 알라딘 OpenAPI (현재는 stub)

## 다음 액션
1. ~~알라딘 OpenAPI 키~~ ✅ `.env.local` `ALADIN_TTB_KEY` — Vite 플러그인 `aladinPlugin.js` 가 `/api/aladin/*` 프록시
2. ~~LLM API 키~~ ✅ `.env.local` `OPENAI_API_KEY` (예정) — `openaiPlugin.js` 가 `/api/llm` 프록시. 모델 기본 `gpt-4o-mini`, JSON 모드.
3. ~~Ingest/Nudge/Answer 프롬프트 + JSON 스키마~~ ✅ `lib/llm.js` 에 작성 + 클라이언트 검증(근거 페이지 ID 화이트리스트)
4. 사용자가 직접 책 1권 시드 메모 5~10개 넣고 첫 ingest 돌려보기
5. 프롬프트 튜닝 (출력 일관성, 환각 케이스 잡기)
6. (선택) 본 서비스용: 프로덕션 환경에서 `/api/llm` 대체 — Vercel Functions 또는 SwiftUI 본 앱의 자체 서버

## 파일 위치 가이드 (다음 세션용)
- `PLAN.md` — 이 문서. 항상 먼저 읽기.
- `App.jsx` — 바텀 탭 + 라우팅
- `screens/*.jsx` — 화면 5개
- `lib/storage.js` — localStorage 어댑터 (책/메모/wiki/넛지/로그)
- `lib/aladin.js` — 책 메타 API (stub)
- `lib/llm.js` — LLM 어댑터 (stub, JSON 스키마 강제)
- `style.css` — Tailwind + 디바이스 프레임 보정
