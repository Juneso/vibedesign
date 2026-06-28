---
description: 리니어 프로젝트의 마일스톤→이슈 트리를 계층적 서브에이전트로 정독해 모순·정렬 이탈을 탐지·자동정정하고, 전용 리포트 이슈에 정리 후 Junseo를 @태그한다.
argument-hint: "[프로젝트명 | 프로젝트ID] (생략 시 Release) · 'dry' 추가 시 쓰기 없이 미리보기"
---

# /linear-align — 리니어 정렬 하네스

리니어에 작업 리프가 쌓이면서 생긴 **모순·방향 이탈**을 계층적 멀티에이전트로 잡아내는 하네스다.
이 명령이 실행되면 아래를 **그대로** 수행하라.

## 입력 해석
- `$ARGUMENTS` 가 비어 있으면 → 대상 프로젝트 = **Release(독서앱)**, ID `e22fbe86-71a4-4919-a690-5312dc2a6ab0`, 팀 `Booktracking`.
- 인자에 프로젝트명/ID가 있으면 → 그 프로젝트. 정확한 ID·팀을 모르면 먼저 `mcp__plugin_productivity_linear__list_projects(includeMilestones=true)` 로 해석한다.
- 인자에 `dry` / `dryrun` / `미리보기` 가 포함되면 → `dryRun: true` (리니어에 **아무것도 쓰지 않고** 리포트 본문만 생성).

## 실행 (Workflow 하네스 호출)
해석한 값으로 **Workflow 도구**를 호출한다. 이 스크립트가 계층 오케스트레이션 전부를 수행한다:

```
Workflow({
  scriptPath: ".claude/workflows/linear-align.mjs",
  args: {
    projectId: "<해석한 프로젝트 UUID>",
    projectName: "<프로젝트명>",
    team: "<팀명>",
    mention: "wnstj1021",     // 오준서 displayName — @태그 대상
    dryRun: <true 면 미리보기>
  }
})
```

> 참고: 여기서 말하는 Workflow 는 **Claude Code 의 Workflow 오케스트레이션 도구**다. Vercel Workflow DevKit 과 무관하니 그 문서를 읽지 말 것.

## 하네스가 하는 일 (스크립트 내부)
1. **Scan** — 프로젝트의 마일스톤·이슈 전체를 읽어 `마일스톤→핵심이슈(최상위)→서브→리프` 트리 구축.
2. **Analyze** — 핵심이슈마다 1 에이전트가 서브트리+댓글을 정독, 4종 모순(internal·stale·vs-sibling·vs-milestone) 탐지. (읽기만)
3. **Verify** — 자동수정 후보를 **독립 회의론자 에이전트**가 반증 시도. 사소+SSOT명확+비파괴만 통과(author≠reviewer).
4. **Apply** — 통과한 **사소한** 수정만 본문 갱신 + 변경 로그 댓글. 방향·우선순위·삭제 판단은 절대 자동화하지 않음.
5. **Milestone** — 마일스톤마다 상위 에이전트가 교차 모순·정렬을 취합해 마일스톤 댓글 작성.
6. **Overseer** — 최종 총괄이 `🔭 정렬 리포트 — <프로젝트명>` 전용 이슈를 **BKT-334(일하는 방식 / 리니어 마일스톤) 하위**에 find-or-create 해 본문(꼭 풀 모순·병목·우선순위·액션플랜)을 갱신하고, **@wnstj1021 멘션 댓글**로 Junseo를 호출. 로그는 그 이슈 댓글로 쌓인다.

## 완료 후 보고
Workflow 가 끝나면 반환값(reportIssue.url, 자동정정 건수, 결정 필요 high 건수)을 사용자에게 1~2줄로 요약하라.
**중요:** 이 하네스는 토큰을 많이 쓴다(수십 개 에이전트). 사용자가 명시적으로 `/linear-align` 을 호출했을 때만 실행한다.
