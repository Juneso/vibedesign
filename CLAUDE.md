# vibedesign 작업 지침

## 프로젝트 개요

React + Vite + Motion(Framer Motion) 기반의 디자인 프로토타입 실험 레포.  
독서 도우미, 인터랙션 프로토타입 등 날짜별 실험이 누적된다.  
Vercel로 배포되며, 알라딘 API + OpenAI API를 연결한 풀스택 실험도 포함.

**기술 스택**
- React 19 + Vite 7
- Motion (Framer Motion 12)
- Tailwind CSS 4
- Vercel (배포) / `api/` 폴더 → Vercel Serverless Functions
- `native-preview/` → Expo React Native (iOS 네이티브 미리보기용)

---

## 폴더 구조

```
vibedesign/
├── src/
│   ├── experiments/
│   │   └── active/
│   │       └── YYYY-MM-DD_이름/     # 실험 단위 폴더 (날짜-이름 형식)
│   │           ├── index.html       # 실험 진입점
│   │           ├── meta.json        # 실험 메타데이터 (제목, 설명 등)
│   │           ├── main.jsx / script.js
│   │           ├── style.css
│   │           ├── screens/         # React 화면 컴포넌트 (book-wiki-mvp 등)
│   │           ├── lib/             # 실험 전용 유틸/서비스
│   │           └── eval/            # LLM 품질 평가 스크립트 및 결과
│   ├── shared/
│   │   ├── styles/                  # 공통 CSS (base, tokens, device, shell)
│   │   ├── js/                      # 공통 JS 유틸 (animation, router, theme 등)
│   │   ├── plugins/                 # 공통 플러그인 (aladin, openai)
│   │   └── viewer/                  # 디자인 토큰 뷰어
│   └── registry.js                  # 실험 목록 등록
├── api/                             # Vercel Serverless Functions
│   ├── book-search.js
│   └── book-detail.js
├── docs/                            # 작업 가이드, 프로세스 문서
├── native-preview/                  # Expo 앱 (React Native)
├── .agents/workflows/               # Claude Code 에이전트 워크플로우
├── index.html                       # 실험 목록 진입점
├── vite.config.js
└── vercel.json
```

**새 실험 추가 시**: `src/experiments/active/YYYY-MM-DD_이름/` 폴더 생성 → `meta.json` 작성 → `src/registry.js`에 등록

---

## 커밋 컨벤션

```
<type>(<scope>): <설명>
```

**type**
| 타입 | 의미 |
|------|------|
| `feat` | 새 기능, 실험 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서만 변경 |
| `style` | CSS/스타일 변경 |
| `refactor` | 리팩터 (기능 변화 없음) |
| `eval` | LLM 평가 실행/결과 추가 |
| `chore` | 빌드, 설정, 의존성 |

**scope**: 실험 폴더 이름 또는 공통 영역 이름 (선택적으로 `/DES-123` Linear 이슈 번호 병기)

```
feat(book-wiki-mvp/DES-270): 넛지 V5/V6 변형 eval + seed 4책 확장
docs(book-wiki-mvp): Linear 룰 글로벌로 이동
fix(shared): router 뒤로가기 버그 수정
chore: vite 7 업그레이드
```

---

## 역할 분리 (서브에이전트)

작업 지시가 들어오면 아래 두 단계를 분리해서 진행한다.
각 역할은 `.claude/agents/`에 Claude Code 서브에이전트로 정의되어 있으며 Task 도구로 호출 가능하다.

| 단계 | 역할 | 정의 파일 |
|------|------|----------|
| 1단계 | 기획자 (Planner) — 계획 수립, Junseo 승인 대기 | [`.claude/agents/planner.md`](.claude/agents/planner.md) |
| 2단계 | 엔지니어 (Executor) — 승인된 계획 구현 | [`.claude/agents/executor.md`](.claude/agents/executor.md) |

### 트리거 키워드

| 키워드 | 진입 역할 |
|--------|----------|
| "기획", "정리해줘", "어떻게 할지", "이슈로 만들어줘", "계획 짜줘" | **Planner** |
| "구현해줘", "코드 작성", "이대로 진행", 명확한 스펙 + "해줘" | **Executor** |
| 모호하면 → **Planner** (안전 기본값) |

---

## 레포 작업 기본 절차

```
1. git pull (쓰기 작업 전 필수)
2. 관련 파일 탐색 → 기획자 단계: 계획 제시
3. Junseo 승인
4. 엔지니어 단계: 구현
5. 결과 보고 (변경 파일 경로 포함)
```

---

## Linear 연동

Linear 이슈 작성 규칙 (제목 원칙, 마일스톤 배정, 어휘 통일, 책임 관리 등) → [`LINEAR.md`](LINEAR.md) 참고.

### 커밋 자동 동기화 (post-commit 훅)

husky `.husky/post-commit` 훅이 매 커밋마다 `scripts/linear-sync.mjs`를 실행한다.

동작:
1. 커밋 메시지에서 `DES-XXX` 모두 추출
2. 각 이슈에 대해 — Linear API로 본문의 `## 결과` 섹션에 엔트리 append + 코멘트 추가
3. 상태 전환은 하지 않음 (Done/In Review는 수동)

필요 env: `.env.local`의 `LINEAR_API_KEY` (이미 설정됨).
