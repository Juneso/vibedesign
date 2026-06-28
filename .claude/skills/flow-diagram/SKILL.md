---
name: flow-diagram
description: Booktracking/Release 프로젝트의 이슈 트리 구조(N | 플로우 → N-M | 기획 → UX/인프라)와 최상위 플로우 구조도를 유지·갱신한다. 트리거 — "플로우", "최상위 플로우", "구조도", "플로우 구조", "서재 플로우", Release 프로젝트의 플로우 이슈를 만들거나 기획을 바꿀 때.
---

# 플로우 구조 + 구조도 유지

Release 프로젝트의 이슈를 만들거나 고칠 때 이 규칙을 따른다. 상세 SSOT: [`docs/flow-structure.md`](../../../docs/flow-structure.md).

## 트리 구조 (항상 이 형태)

```
N | 플로우명          최상위 플로우 (정수)        구조도 보유 의무
└─ N-M | 핵심 기획     플로우의 핵심 결정          라벨: 기획
   ├─ (UX) 구현        화면 설계가 핵심            라벨: UX
   ├─ (인프라) 구현    백엔드·데이터·시스템        라벨: 인프라
   └─ N-M | 하위 기획  더 작은 결정 (중첩 가능)    라벨: 기획
```

원칙: **결정이 위, 구현(UX·인프라)이 아래.** 새 작업이 들어오면 "어떤 기획을 구현하나?"를 먼저 정하고 그 기획 하위에 UX/인프라로 단다.

**리프 이슈는 "구현 등급"** — 이 이슈만 보고 그대로 구현 가능해야 한다: 데이터 필드·타입·필수·출처(표), DB 매핑(SwiftData @Model + Firestore 경로/shape + 관계), 단계별 플로우·외부 API 매핑, 검증·엣지케이스, 합격 기준, 미결정(기본안+대안). 데이터 모델은 SSOT 기획 이슈 하나에 모으고 화면/구현 이슈가 참조. 기준 예시: BKT-329(책 모델)·262·330·331.

## 최상위 플로우는 항상 구조도

- 모든 `N | …` 플로우 이슈 본문에 `## 구조 (한눈에)` + 구조도 이미지가 있어야 한다.
- **기획이 바뀌면(기획/구현 이슈 추가·삭제·의미변경) 구조도를 갱신한다.**

### 구조도가 담아야 할 것 (의미 규약)

화면 나열이 아니라 **유저 행동 → 수집 데이터(종류·필드) → 저장 위치(SwiftData/Firestore 경로) → 데이터 간 연관(1:N·ingest·공유·캐스케이드)** 을 한 장에. 권장 레이아웃 = `유저 행동 | 수집 데이터 | 저장 & 연관` 3열, 행마다 한 행동을 매핑하고 연관은 화살표·라벨로. 기준 예시: `docs/flow-diagrams/flow-2-library.svg` (BKT-282).

### 갱신 절차

1. 그 플로우의 현재 서브트리(기획/UX/인프라)를 Linear에서 읽어 최신 상태 파악.
2. `docs/flow-diagrams/<flow>.svg` 를 작성/수정 — **자립형 SVG**:
   - `<rect ... fill="#ffffff"/>` 흰 배경, 인라인 hex 색만(CSS 변수·클래스 금지), `font-family="Apple SD Gothic Neo, sans-serif"`.
   - 팔레트: 기획/클라우드=purple(`#EEEDFE`/`#534AB7`/`#3C3489`), UX/로컬=teal(`#E1F5EE`/`#0F6E56`/`#085041`), 인프라/중립=gray(`#F1EFE8`/`#5F5E5A`/`#444441`).
3. 렌더+업로드+본문 교체(멱등):
   ```
   node scripts/flow-diagram.mjs <flowIssue> docs/flow-diagrams/<flow>.svg
   ```
4. Linear에서 `## 구조 (한눈에)` 이미지가 갱신됐는지 확인.

기존 소스: `docs/flow-diagrams/flow-1-login.svg`(BKT-259 동작 흐름), `docs/flow-diagrams/plan-backend-baas.svg`(BKT-273 백엔드 구조).

## 새 플로우를 시작할 때 (예: 서재)

1. `N | 플로우명` 최상위 이슈 생성 (project=Release, team=Booktracking, milestone 지정).
2. 핵심 기획 `N-M | …` 이슈들 생성 (`기획` 라벨), 각각 그 플로우 하위.
3. 각 기획 하위에 UX/인프라 구현 이슈 (`UX`/`인프라` 라벨).
4. 최상위 플로우용 `docs/flow-diagrams/<flow>.svg` 작성 → `flow-diagram.mjs` 로 구조도 박기.
5. 본문 포맷은 LINEAR.md 규칙(짧은 제목·3불렛+콜랩스·본문 SSOT) 준수.

## 주의

- 이 스킬·훅은 이 레포 한정. 사용자의 글로벌 OMC 훅 / LINEAR.md 와 양립(추가만, 비차단).
- 구조도 SVG는 위젯(visualize)이 아니라 **레포에 저장된 자립형 SVG** 가 진실원본. 위젯으로 미리 그려봐도 되지만, 최종은 `docs/flow-diagrams/`에 커밋하고 스크립트로 반영.
