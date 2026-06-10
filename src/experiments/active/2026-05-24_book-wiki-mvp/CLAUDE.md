# Book Wiki MVP-0 — Claude 행동 지침

> 이 파일은 Claude Code가 book-wiki-mvp 세션에서 따르는 규칙.
> 기획 단일 진실은 PLAN.md. 이 파일은 *작업 방식*만 다룬다.

---

## 0. 세션 시작 시 반드시 할 것

1. **Linear 현황 확인** — SessionStart hook이 자동 주입. 오픈 이슈와 최근 커밋 확인.
2. **PLAN.md 읽기** — 현재 단계와 다음 액션 파악.
3. **한 줄 브리핑** — "현재 DES-XXX 진행 중, 다음은 DES-YYY" 형태로 상태 확인.

---

## 1. Linear 연동 (프로젝트 특화)

> Linear 활용 공통 규칙(상태 변경 / 진행방식 변경 로그 / 제목 라이팅)은 글로벌 `~/.claude/CLAUDE.md` 의 "Linear 활용 규칙" 섹션에 있음. 이 파일에는 이 프로젝트에만 해당되는 사항만.

- 이슈 prefix: `DES-XXX`. 커밋 메시지는 `feat(book-wiki-mvp/DES-XXX): ...`
- 마일스톤 표는 § 4 참조
- 이슈 description에 `## 산출물` 의 파일 경로/함수명을 작업 시 참고할 것

### 이슈 완료/변경 시 — Claude가 직접 할 것

> 헷갈리기 쉬움: "Done/In Review는 수동"은 **post-commit 훅**(`scripts/linear-sync.mjs`)이 상태를 안 건드린다는 뜻이지, Claude가 못 한다는 뜻이 **아니다**. Claude는 MCP로 직접 한다.

- **완료 시**: ① 본문 `## 결과` 섹션에 실제 산출물(커밋 해시·파일 경로·무엇이 달라졌나) 기록 → ② 상태를 **Done으로 전환**. 결과를 코멘트로만 남기고 끝내지 말 것 — 본문이 정칙, 코멘트는 보조.
- **방향 변경 시**: 본문에 `## 방향 변경 로그` 추가 + 코멘트로 언제·왜 기록 + 충돌 이슈에도 코멘트.
- post-commit 훅은 `## 결과` append + 코멘트만 자동 처리(상태 전환 X). 워크트리에 `.env.local`이 없으면 훅이 스킵되므로, 그 경우 Claude가 MCP로 본문·상태를 직접 갱신.
- 공통 규칙 단일 진실: `~/.claude/conventions/linear.md`.

---

## 2. 커밋 컨벤션

```
feat(DES-XXX): 알라딘 검색 결과 실데이터 연결
fix(DES-XXX): BookDetailScreen 챕터 드롭다운 버그
```

- 이슈 번호 항상 포함 → Linear가 커밋과 이슈를 자동 연결
- 완료 커밋은 메시지 끝에 `(closes DES-XXX)` 추가 가능

---

## 3. 스택 & 파일 규칙

- **환각 방지 1순위**: lib/llm.js 의 SYSTEM_RULES, 스키마 절대 임의 수정 금지
- **LLM 호출 추가 시**: INGEST_SCHEMA / NUDGE_SCHEMA 벗어나는 자유 서술 출력 금지
- **aladin.js**: 이미 완전 구현. 수정 전에 읽고 시작.
- **storage.js**: 추가 함수 전에 기존 API 확인.
- 수치/상수는 파일 상단에 모을 것 (실험실 전체 원칙 동일).

---

## 4. 현재 밀스톤 로드맵

| 밀스톤 | 마감 | 핵심 이슈 |
|---|---|---|
| M1 — 책 추가 + 메모 입력 | 5/31 | DES-167, DES-168, DES-169 |
| M2 — Ingest 루프 | 6/7 | DES-170, DES-171 |
| M3 — 넛지 루프 + 검증 | 6/21 | DES-172, DES-173 |

---

## 5. 하지 말 것

- ❌ PLAN.md 확정 결정을 Claude 판단으로 번복
- ❌ 이슈 없는 큰 작업을 Linear 등록 없이 진행
- ❌ lib/llm.js 프롬프트 자의적 수정 (프롬프트 튜닝은 DES-173)
- ❌ 이슈 설명과 다른 파일 건드리기 ("김에 정리" 금지)
