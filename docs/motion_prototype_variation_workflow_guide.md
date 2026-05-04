# ADDING_VARIATIONS.md

## 목적

이 문서는 Motion Prototype Lab에서 새로운 배리에이션을 추가할 때,
기존 시안을 깨지 않고 아카이브 가능한 구조로 추가하는 방법을 설명한다.

핵심 원칙:

- 기존 실험을 직접 수정하지 않는다.
- 새 배리에이션은 기존 실험 폴더를 복제해서 만든다.
- 공통 로직(shared)은 건드리지 않고, 실험 폴더 안에서만 수정한다.
- 최종 승인본은 archive로 이동한다.

---

# 추천 위치

이 문서는 아래 위치 중 하나에 둔다.

```text
/docs/ADDING_VARIATIONS.md
```

또는

```text
/docs/prototype/ADDING_VARIATIONS.md
```

권장: `docs/ADDING_VARIATIONS.md`

이유:
- 프로젝트 루트에서 바로 찾기 쉽다.
- 새 실험을 추가할 때마다 개발자/디자이너가 동일한 문서를 참고할 수 있다.
- GitHub에서 README처럼 열어보기 쉽다.

---

# 전제 폴더 구조

```text
project-root/
├─ docs/
│  └─ ADDING_VARIATIONS.md
├─ src/
│  ├─ shared/
│  │  ├─ styles/
│  │  │  ├─ tokens.css
│  │  │  ├─ base.css
│  │  │  ├─ shell.css
│  │  │  └─ device.css
│  │  └─ js/
│  │     ├─ animation.js
│  │     ├─ lottie.js
│  │     ├─ theme.js
│  │     ├─ router.js
│  │     └─ registry.js
│  └─ experiments/
│     ├─ active/
│     │  ├─ 2026-04-09_top-gradient-adjust/
│     │  └─ 2026-04-09_toast-custom-shadow/
│     └─ archive/
```

---

# 새로운 배리에이션 추가 절차

## Step 1. 기준 실험 폴더 선택

가장 비슷한 기존 실험 폴더를 찾는다.

예:

```text
src/experiments/active/2026-04-09_toast-custom-shadow/
```

---

## Step 2. 폴더 복제 후 이름 변경

기존 폴더를 복제해서 새 이름을 붙인다.

예:

```text
2026-04-09_toast-custom-shadow
→ 2026-04-11_toast-custom-shadow-v2
```

네이밍 규칙:

```text
YYYY-MM-DD_slug
```

예:

```text
2026-04-11_top-gradient-v2
2026-04-11_toast-entry-soft
2026-04-12_ai-call-delay-test
```

---

## Step 3. meta.json 수정

새 폴더 안의 `meta.json`을 수정한다.

```json
{
  "id": "2026-04-11_toast-custom-shadow-v2",
  "title": "토스트 등장 (커스텀 섀도우) v2",
  "version": "v0.2",
  "status": "active",
  "basedOn": "2026-04-09_toast-custom-shadow",
  "notes": [
    "shadow blur 감소",
    "toast y 이동량 축소",
    "gradient 회전 타이밍 조정"
  ]
}
```

필드 의미:

- `id`: 폴더명과 동일
- `title`: 메뉴에 노출될 이름
- `version`: 내부 버전
- `status`: `active` 또는 `archived`
- `basedOn`: 어떤 시안에서 파생됐는지
- `notes`: 이번 수정 포인트

---

## Step 4. config.js에서 값 수정

가능하면 수치는 `script.js`가 아니라 `config.js`에서 수정한다.

```js
export const toastMotionConfig = {
  yFrom: 16,
  yTo: 0,
  opacityFrom: 0,
  opacityTo: 1,
  blurFrom: 24,
  blurTo: 14,
  duration: 420,
  delay: 80,
  scaleFrom: 0.98,
  scaleTo: 1
};
```

여기에 넣을 것:

- 변화 대상
- 변화량
- duration
- delay
- easing
- blur / glow / gradient 관련 수치
- 다크모드용 override 값

---

## Step 5. script.js는 config를 읽기만 하게 유지

좋은 예:

```js
import { toastMotionConfig } from './config.js';

animate(toastEl, {
  opacity: [toastMotionConfig.opacityFrom, toastMotionConfig.opacityTo],
  y: [toastMotionConfig.yFrom, toastMotionConfig.yTo]
}, {
  duration: toastMotionConfig.duration / 1000,
  delay: toastMotionConfig.delay / 1000
});
```

나쁜 예:

```js
animate(toastEl, { opacity: [0, 1], y: [16, 0] }, { duration: 0.42, delay: 0.08 });
```

---

## Step 6. style.css는 실험 전용 스타일만 수정

수정해도 되는 것:

- 토스트 shadow
- glow 강도
- top gradient 위치
- 실험 전용 spacing
- 실험 전용 상태 클래스

수정하면 안 되는 것:

- sidebar
- device frame
- theme toggle
- safe area
- reset
- 공통 토큰

그런 건 모두 `src/shared/styles/` 에서 관리한다.

---

## Step 7. registry.js에 등록

새 실험은 registry에 추가해야 메뉴에 보인다.

파일 위치:

```text
src/shared/js/registry.js
```

예:

```js
export const experimentRegistry = [
  {
    id: '2026-04-09_top-gradient-adjust',
    title: '최종-상단 그라 조정',
    status: 'active',
    entry: 'src/experiments/active/2026-04-09_top-gradient-adjust/index.html'
  },
  {
    id: '2026-04-11_toast-custom-shadow-v2',
    title: '토스트 등장 (커스텀 섀도우) v2',
    status: 'active',
    entry: 'src/experiments/active/2026-04-11_toast-custom-shadow-v2/index.html'
  }
];
```

---

# 메뉴 연결 방식

`router.js`가 `registry.js`를 읽어서 메뉴를 자동 생성하도록 한다.

권장 구조:

```js
import { experimentRegistry } from './registry.js';

const activeExperiments = experimentRegistry.filter(
  item => item.status === 'active'
);
```

- `active` → 메인 메뉴에 노출
- `archived` → archive 페이지에만 노출

---

# Inspect 모드 대비 설정

지금 바로 inspect를 만들 필요는 없지만, 나중에 붙이기 쉽게 data attribute는 미리 심어둔다.

예:

```html
<div
  class="floating-toast"
  data-node-id="toast.container"
  data-node-group="toast"
></div>

<div
  class="ft-shadow-layer"
  data-node-id="toast.shadow"
  data-node-group="toast"
></div>
```

실험 루트에도 붙인다:

```html
<section
  data-experiment-id="2026-04-11_toast-custom-shadow-v2"
>
```

---

# 아카이브 방법

승인 완료되었거나 더 이상 수정하지 않는 실험은 아래처럼 이동한다.

```text
src/experiments/active/2026-04-11_toast-custom-shadow-v2/
→
src/experiments/archive/2026-04-11_toast-custom-shadow-v2/
```

그리고 `meta.json`도 수정한다.

```json
{
  "status": "archived"
}
```

`registry.js`의 entry 경로도 archive로 바꾼다.

```js
entry: 'src/experiments/archive/2026-04-11_toast-custom-shadow-v2/index.html'
```

---

# 새 배리에이션 추가 체크리스트

실험 추가 후 반드시 확인:

- [ ] 폴더명을 날짜+slug 형식으로 만들었는가
- [ ] meta.json을 수정했는가
- [ ] registry.js에 등록했는가
- [ ] config.js에서만 수치를 수정했는가
- [ ] 공통 shared 파일을 불필요하게 수정하지 않았는가
- [ ] 다크모드 / 라이트모드 둘 다 확인했는가
- [ ] 기존 실험이 깨지지 않았는가
- [ ] 승인본이면 archive로 이동 가능한 상태인가

