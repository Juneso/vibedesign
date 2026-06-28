export const meta = {
  name: 'linear-align',
  description: '리니어 프로젝트의 마일스톤→핵심이슈→서브→리프 트리를 계층적 서브에이전트로 정독해 모순·정렬 이탈을 탐지하고, 사소한 것은 자동 수정(검증 후), 나머지는 전용 리포트 이슈에 정리해 Junseo를 @태그한다.',
  phases: [
    { title: 'Scan', detail: '프로젝트 이슈 트리 구축' },
    { title: 'Analyze', detail: '핵심이슈마다 1 에이전트 — 모순 탐지' },
    { title: 'Verify', detail: '자동수정 후보를 독립 회의론자가 검증' },
    { title: 'Apply', detail: '검증 통과한 사소한 수정만 리니어에 반영' },
    { title: 'Milestone', detail: '마일스톤마다 교차 모순·정렬 취합' },
    { title: 'Overseer', detail: '최종 리포트 작성 + 정렬 리포트 이슈 + 나 태그' },
  ],
}

// ───────────────────────────── 설정 ─────────────────────────────
// args 가 JSON 문자열로 전달되는 경우가 있어(그러면 args.dryRun 이 undefined → 의도치 않은 라이브 실행),
// 문자열이면 파싱해 객체로 정규화한다.
const cfg = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch { return {} } })() : args || {}
const PROJECT_ID = cfg?.projectId || 'e22fbe86-71a4-4919-a690-5312dc2a6ab0' // 정렬 대상: Release(독서앱)
const PROJECT_NAME = cfg?.projectName || 'Release'
const TEAM_NAME = cfg?.team || 'Booktracking' // 정렬 대상 프로젝트의 팀
const MENTION = cfg?.mention || 'wnstj1021' // 오준서 displayName — @태그 대상

// 리포트가 쌓이는 곳(분석 대상과 별개): BKT-334 "Linear Alignment" 하위
const REPORT_PARENT = cfg?.reportParent || 'BKT-334'
const REPORT_PROJECT = cfg?.reportProject || '일하는 방식'
const REPORT_MILESTONE = cfg?.reportMilestone || '리니어'
const REPORT_TEAM = cfg?.reportTeam || 'Booktracking'
const REPORT_TITLE = cfg?.reportTitle || `🔭 정렬 리포트 — ${PROJECT_NAME}`
const DRY_RUN = cfg?.dryRun ?? false

// 모든 에이전트가 리니어 MCP 도구를 쓰려면 먼저 스키마를 로드해야 한다.
const READ_TOOLS =
  'ToolSearch 를 먼저 호출해 리니어 읽기 도구 스키마를 로드하라: ' +
  'query="select:mcp__plugin_productivity_linear__get_issue,mcp__plugin_productivity_linear__list_issues,' +
  'mcp__plugin_productivity_linear__list_comments,mcp__plugin_productivity_linear__list_milestones,' +
  'mcp__plugin_productivity_linear__get_project,mcp__plugin_productivity_linear__get_milestone". ' +
  '로드 후에만 해당 도구를 호출할 수 있다.'
const WRITE_TOOLS =
  'ToolSearch 를 먼저 호출해 리니어 읽기+쓰기 도구 스키마를 로드하라: ' +
  'query="select:mcp__plugin_productivity_linear__get_issue,mcp__plugin_productivity_linear__list_issues,' +
  'mcp__plugin_productivity_linear__list_comments,mcp__plugin_productivity_linear__list_milestones,' +
  'mcp__plugin_productivity_linear__save_issue,mcp__plugin_productivity_linear__save_comment". ' +
  '로드 후에만 해당 도구를 호출할 수 있다.'

const SSOT_RULE =
  '리니어 본문 SSOT 원칙: 이슈 본문(배경·목표·작업)은 "현재 기획"의 단일 진실이다. ' +
  '방향이 바뀐 흔적이 댓글/서브이슈/완료물에 있으면, 가장 최신·구체적·완료에 가까운 것이 SSOT다. ' +
  '본문이 그 최신 진실과 어긋나면 그것이 "모순(stale)"이다. ' +
  '같은 마일스톤 안에서 두 이슈가 상충하는 결정을 담고 있으면 "vs-sibling 모순"이다. ' +
  '이슈가 자기 마일스톤 목표와 어긋나면 "vs-milestone 모순"이다.'

// ───────────────────────────── 스키마 ─────────────────────────────
const TREE_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    projectSummary: { type: 'string', description: '프로젝트의 목적·방향 한 단락' },
    milestones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          progress: { type: 'string' },
        },
        required: ['name'],
      },
    },
    coreIssues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          id: { type: 'string', description: '예: BKT-282' },
          title: { type: 'string' },
          milestoneName: { type: 'string', description: '없으면 "(마일스톤 없음)"' },
          status: { type: 'string' },
          descendantIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'milestoneName', 'descendantIds'],
      },
    },
  },
  required: ['milestones', 'coreIssues'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    coreIssueId: { type: 'string' },
    coreIssueTitle: { type: 'string' },
    milestoneName: { type: 'string' },
    summary: { type: 'string', description: '이 핵심이슈 서브트리의 현재 상태 2~3줄' },
    alignmentWithMilestone: { type: 'string', description: '마일스톤 목표와의 정렬 평가' },
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          id: { type: 'string', description: '짧은 슬러그, 예: stale-body-BKT282' },
          title: { type: 'string', description: '비개발자 언어 한 줄' },
          severity: { type: 'string', enum: ['low', 'med', 'high'] },
          kind: { type: 'string', enum: ['internal', 'vs-sibling', 'vs-milestone', 'stale'] },
          locations: { type: 'array', items: { type: 'string' }, description: '관련 이슈 ID들' },
          evidence: { type: 'string', description: '어디서 무엇을 보고 모순이라 판단했는지' },
          latestSSOT: { type: 'string', description: '현재 진실이 무엇이며 왜 그것이 최신인지' },
          ssotClear: { type: 'boolean', description: '최신 SSOT가 논쟁의 여지 없이 분명한가' },
          proposedResolution: { type: 'string' },
          autoFixable: { type: 'boolean', description: 'ssotClear=true 이고 수정이 사소(오타·용어·중복·명백한 stale 본문 갱신)할 때만 true' },
          fixOps: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                issueId: { type: 'string' },
                op: { type: 'string', enum: ['body-edit', 'comment', 'status'] },
                detail: { type: 'string', description: '구체적으로 무엇을 어떻게 바꿀지' },
              },
              required: ['issueId', 'op', 'detail'],
            },
          },
        },
        required: ['id', 'title', 'severity', 'kind', 'locations', 'latestSSOT', 'ssotClear', 'proposedResolution', 'autoFixable'],
      },
    },
  },
  required: ['coreIssueId', 'coreIssueTitle', 'milestoneName', 'summary', 'contradictions'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    findingId: { type: 'string' },
    confirmedTrivial: { type: 'boolean' },
    confirmedSSOTClear: { type: 'boolean' },
    safeToAutoApply: { type: 'boolean', description: '사소 + SSOT명확 + 비파괴적일 때만 true. 조금이라도 의심되면 false' },
    reason: { type: 'string' },
  },
  required: ['findingId', 'safeToAutoApply', 'reason'],
}

const APPLY_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    findingId: { type: 'string' },
    applied: { type: 'boolean' },
    what: { type: 'string', description: '실제로 무엇을 바꿨는지(또는 dryRun이라 무엇을 바꿀 예정이었는지)' },
    issueIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['findingId', 'applied', 'what'],
}

const MILESTONE_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    milestoneName: { type: 'string' },
    alignment: { type: 'string', description: '이 마일스톤이 목표 방향에 정렬돼 있는가' },
    crossIssueContradictions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'med', 'high'] },
          issues: { type: 'array', items: { type: 'string' } },
          recommendation: { type: 'string' },
        },
        required: ['title', 'severity', 'recommendation'],
      },
    },
    topUnresolved: { type: 'array', items: { type: 'string' }, description: 'Junseo 판단이 필요한 상위 항목 요약' },
    commentPosted: { type: 'boolean' },
  },
  required: ['milestoneName', 'alignment', 'crossIssueContradictions'],
}

// ───────────────────────────── 실행 ─────────────────────────────
log(`linear-align 시작 — 프로젝트="${PROJECT_NAME}" (${PROJECT_ID})${DRY_RUN ? ' · DRY-RUN(쓰기 없음)' : ''}`)

// Phase 0 — Scan: 이슈 트리 구축
phase('Scan')
const tree = await agent(
  `너는 리니어 프로젝트의 이슈 트리를 구축하는 스캐너다. ${READ_TOOLS}\n\n` +
    `대상 프로젝트 ID: ${PROJECT_ID} (이름 "${PROJECT_NAME}").\n` +
    `할 일:\n` +
    `1) get_project 로 프로젝트 설명/방향을 읽어 projectSummary 작성.\n` +
    `2) list_milestones(project="${PROJECT_ID}") 로 마일스톤 전체 + 설명/progress 수집.\n` +
    `3) list_issues(project="${PROJECT_ID}", limit=250) 로 모든 이슈를 가져온다. 각 이슈의 id(예 BKT-282), title, parentId, projectMilestone(마일스톤명), status 를 본다.\n` +
    `4) "핵심이슈" = parentId 가 없는(최상위) 이슈. 각 핵심이슈에 대해 그 자손(자식·손자 모두) 이슈 id 목록(descendantIds)을 parentId 체인으로 계산한다.\n` +
    `5) 핵심이슈를 milestoneName 별로 분류. 마일스톤 없으면 "(마일스톤 없음)".\n` +
    `완료된(Done/Canceled) 핵심이슈도 포함하되 status 에 표기하라(모순은 진행/미완 이슈에서 주로 나온다).\n` +
    `반드시 스키마대로 구조화 출력만 반환하라.`,
  { label: 'scan-tree', phase: 'Scan', schema: TREE_SCHEMA, model: 'sonnet', effort: 'low' },
)

if (!tree || !tree.coreIssues || tree.coreIssues.length === 0) {
  log('스캔 실패 또는 핵심이슈 없음. 중단.')
  return { error: 'no-core-issues', tree }
}
// 비용 절감(레버 2): 완료/취소된 핵심이슈는 Analyze 생략 — 모순은 대부분 진행 중 이슈에서 난다.
// (완료 이슈도 tree 안에 남아 형제·마일스톤 비교 컨텍스트로는 쓰인다.)
const activeCore = tree.coreIssues.filter((ci) => !/done|cancel|완료|취소/i.test(ci.status || ''))
const skipped = tree.coreIssues.length - activeCore.length
log(
  `핵심이슈 ${tree.coreIssues.length}개(활성 ${activeCore.length} · 완료/취소 ${skipped} 생략) · ` +
    `마일스톤 ${tree.milestones.length}개. 분석 시작(Analyze=Sonnet).`,
)

// Phase 1 — Analyze: 활성 핵심이슈마다 1 에이전트 (Sonnet — 1차 탐지, 비용 지배 구간)
phase('Analyze')
const coreFindings = (
  await parallel(
    activeCore.map((ci) => () =>
      agent(
        `너는 리니어 "핵심이슈" 1개와 그 서브트리 전체를 정독해 모순·정렬 이탈을 찾는 분석가다. ${READ_TOOLS}\n\n` +
          SSOT_RULE +
          `\n\n분석 대상 핵심이슈: ${ci.id} — "${ci.title}" (마일스톤: ${ci.milestoneName}, 상태: ${ci.status || '?'}).\n` +
          `자손 이슈 ID: ${JSON.stringify(ci.descendantIds)}.\n` +
          `소속 마일스톤 설명: ${JSON.stringify((tree.milestones.find((m) => m.name === ci.milestoneName) || {}).description || '')}.\n\n` +
          `할 일:\n` +
          `1) get_issue 로 핵심이슈 + 모든 자손 이슈의 본문을 읽는다. list_comments(issueId=...) 로 각 이슈의 댓글(변경 로그·인사이트)도 읽는다.\n` +
          `2) 다음 4종 모순을 찾는다: (internal) 한 이슈 본문 내부 자기모순 / (stale) 본문이 더 최신인 댓글·서브이슈·완료물과 어긋남 / (vs-sibling) 형제 이슈끼리 상충 / (vs-milestone) 마일스톤 목표와 이탈.\n` +
          `3) 각 모순마다 latestSSOT(현재 진실+왜 최신인지), ssotClear, proposedResolution 을 적는다.\n` +
          `4) autoFixable 은 오직 ssotClear=true 이고 수정이 "사소"할 때만 true: 오타/용어 불일치/명백한 중복/이미 합의된 stale 본문 한 줄 갱신 같은 비파괴적 변경. ` +
          `기획 방향 자체가 바뀌는 판단, 우선순위 변경, 이슈 삭제/대규모 본문 재작성은 절대 autoFixable=false (Junseo 판단 필요).\n` +
          `5) autoFixable=true 인 건 fixOps 에 정확한 변경 지시를 적는다. 이 단계에서는 절대 리니어에 쓰지 마라(읽기만).\n` +
          `모순이 없으면 contradictions=[] 로 정직하게 반환. 추측 금지, 근거(evidence)에 실제로 읽은 위치를 적어라.`,
        { label: `analyze:${ci.id}`, phase: 'Analyze', schema: FINDINGS_SCHEMA, model: 'sonnet' },
      ),
    ),
  )
).filter(Boolean)

const allContradictions = coreFindings.flatMap((f) =>
  (f.contradictions || []).map((c) => ({ ...c, _coreIssueId: f.coreIssueId, _milestone: f.milestoneName })),
)
const autoCandidates = allContradictions.filter((c) => c.autoFixable && c.ssotClear)
log(`모순 총 ${allContradictions.length}건 · 자동수정 후보 ${autoCandidates.length}건. 검증 단계로.`)

// Phase 2 — Verify: 자동수정 후보를 독립 회의론자가 검증 (author≠reviewer)
phase('Verify')
const verdicts = autoCandidates.length
  ? (
      await parallel(
        autoCandidates.map((c) => () =>
          agent(
            `너는 자동수정 제안을 "반증"하려는 독립 회의론자다. ${READ_TOOLS}\n\n` +
              SSOT_RULE +
              `\n\n검증 대상 제안 (다른 에이전트가 만든 것):\n` +
              `- findingId: ${c.id}\n- 제목: ${c.title}\n- 종류: ${c.kind}, 심각도: ${c.severity}\n` +
              `- 관련 이슈: ${JSON.stringify(c.locations)}\n- 주장한 최신 SSOT: ${c.latestSSOT}\n` +
              `- 제안 해결: ${c.proposedResolution}\n- 변경 지시(fixOps): ${JSON.stringify(c.fixOps || [])}\n\n` +
              `할 일: get_issue/list_comments 로 관련 이슈를 직접 다시 읽고 독립 검증하라.\n` +
              `safeToAutoApply=true 는 다음을 모두 만족할 때만: (a) SSOT가 논쟁의 여지 없이 분명, (b) 변경이 사소·비파괴적(오타/용어/중복/명백한 한 줄 stale 갱신), (c) 기획 방향·우선순위·삭제 같은 인간 판단이 끼지 않음.\n` +
              `조금이라도 의심되거나 "방향 판단"이 섞이면 safeToAutoApply=false. 기본값은 false(보수적)다.`,
            { label: `verify:${c.id}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'opus' },
          ),
        ),
      )
    ).filter(Boolean)
  : []
const safeMap = new Map(verdicts.map((v) => [v.findingId, v]))
const confirmed = autoCandidates.filter((c) => safeMap.get(c.id)?.safeToAutoApply)
log(`검증 통과한 자동수정 ${confirmed.length}/${autoCandidates.length}건.${DRY_RUN ? ' (DRY-RUN: 실제 반영 생략)' : ''}`)

// Phase 3 — Apply: 검증 통과한 사소한 수정만 리니어에 반영
phase('Apply')
const applied = confirmed.length
  ? (
      await parallel(
        confirmed.map((c) => () =>
          agent(
            `너는 검증을 통과한 "사소한" 모순 수정만 리니어에 반영하는 작성자다. ${WRITE_TOOLS}\n\n` +
              `대상 findingId: ${c.id} — ${c.title}\n변경 지시(fixOps): ${JSON.stringify(c.fixOps || [])}\n` +
              `최신 SSOT: ${c.latestSSOT}\n해결: ${c.proposedResolution}\n\n` +
              (DRY_RUN
                ? `*** DRY-RUN 모드: 절대 save_issue/save_comment 를 호출하지 마라. 무엇을 바꿀 예정이었는지만 what 에 적고 applied=false 로 반환. ***\n`
                : `할 일:\n` +
                  `1) op="body-edit": get_issue 로 현재 본문을 읽고, 지시된 부분만 최소 변경해 save_issue(id=..., description=새 본문). 리니어 본문 포맷(섹션당 불렛 3줄, 콜랩스는 +++ 로 불렛 대체, 접힌 줄엔 개발용어 금지)을 깨지 마라.\n` +
                  `2) 본문을 고쳤다면 같은 이슈에 save_comment 로 변경 로그를 남겨라: "🤖 정렬봇: 어떤 모순을, 어떤 최신 SSOT 근거로, 어떻게 자동 정정했는지" 한 단락.\n` +
                  `3) op="comment"/"status" 면 해당 동작만 수행.\n` +
                  `실제 수행한 변경만 what 에 기록하고 applied=true. 중간에 SSOT가 불분명하다고 느끼면 멈추고 applied=false + 이유.`),
            { label: `apply:${c.id}`, phase: 'Apply', schema: APPLY_SCHEMA, model: 'sonnet', effort: 'low' },
          ),
        ),
      )
    ).filter(Boolean)
  : []
const appliedOk = applied.filter((a) => a.applied)
log(`반영 완료 ${appliedOk.length}건. 마일스톤 취합으로.`)

// Phase 4 — Milestone: 마일스톤마다 교차 모순·정렬 취합
phase('Milestone')
const byMilestone = new Map()
for (const f of coreFindings) {
  const k = f.milestoneName || '(마일스톤 없음)'
  if (!byMilestone.has(k)) byMilestone.set(k, [])
  byMilestone.get(k).push(f)
}
const milestoneSummaries = (
  await parallel(
    [...byMilestone.entries()].map(([mName, findings]) => () => {
      const mDesc = (tree.milestones.find((m) => m.name === mName) || {}).description || ''
      const appliedHere = appliedOk.filter((a) => findings.some((f) => f.coreIssueId === allContradictions.find((c) => c.id === a.findingId)?._coreIssueId))
      return agent(
        `너는 마일스톤 1개를 관장하는 상위 관리자다. 하위 분석가들이 만든 핵심이슈별 결과를 받아 교차 모순과 정렬을 판단한다. ${WRITE_TOOLS}\n\n` +
          SSOT_RULE +
          `\n\n마일스톤: "${mName}"\n마일스톤 목표(설명): ${JSON.stringify(mDesc)}\n\n` +
          `하위 핵심이슈 분석 결과(JSON):\n${JSON.stringify(findings, null, 2)}\n\n` +
          `이번 실행에서 이미 자동 반영된 사소 수정: ${JSON.stringify(appliedHere.map((a) => a.what))}\n\n` +
          `할 일:\n` +
          `1) 핵심이슈들의 결과를 종합해 (a) 마일스톤 목표와의 정렬, (b) 이슈끼리(형제) 충돌하는 결정 = crossIssueContradictions, (c) Junseo 판단이 필요한 상위 미해결 항목 topUnresolved 를 도출.\n` +
          `2) 개별 핵심이슈 안에서 이미 잡힌 모순은 중복 나열하지 말고, "마일스톤 수준에서만 보이는" 교차 모순·정렬 문제에 집중.\n` +
          (DRY_RUN
            ? `3) DRY-RUN: 댓글을 쓰지 말고 commentPosted=false.\n`
            : `3) save_comment 로 이 마일스톤에 요약 댓글을 남겨라. milestone 댓글은 milestoneId 가 필요하다 — list_milestones(project="${PROJECT_ID}") 로 "${mName}" 의 UUID를 찾아 save_comment(milestoneId=<uuid>, body=...). 댓글엔 정렬 평가 + 교차 모순 표 + Junseo가 결정할 것만. commentPosted=true.\n`) +
          `구조화 출력만 반환.`,
        { label: `milestone:${mName}`, phase: 'Milestone', schema: MILESTONE_SCHEMA, model: 'sonnet' },
      )
    }),
  )
).filter(Boolean)
log(`마일스톤 ${milestoneSummaries.length}개 취합 완료. 최종 총괄로.`)

// Phase 5 — Overseer: 최종 리포트 + 전용 이슈 + 나 태그
phase('Overseer')
const overview = {
  project: PROJECT_NAME,
  totals: {
    coreIssues: tree.coreIssues.length,
    contradictions: allContradictions.length,
    autoApplied: appliedOk.length,
    autoAppliedDetails: appliedOk.map((a) => ({ id: a.findingId, what: a.what })),
  },
  highSeverityUnresolved: allContradictions
    .filter((c) => c.severity === 'high' && !confirmed.includes(c))
    .map((c) => ({ id: c.id, title: c.title, kind: c.kind, milestone: c._milestone, locations: c.locations, proposed: c.proposedResolution })),
  milestoneSummaries,
}

const finalReport = await agent(
  `너는 프로젝트 전체를 관장하는 최종 총괄 에이전트다. 마일스톤 관리자들의 결과를 받아 프로젝트 차원의 결론을 낸다. ${WRITE_TOOLS}\n\n` +
    `프로젝트: "${PROJECT_NAME}" (ID ${PROJECT_ID}), 팀: "${TEAM_NAME}".\n` +
    `종합 데이터(JSON):\n${JSON.stringify(overview, null, 2)}\n\n` +
    `할 일:\n` +
    `1) 다음을 담은 "정렬 리포트" 본문(마크다운)을 작성하라 — 이건 매 실행 갱신되는 살아있는 대시보드(SSOT)다:\n` +
    `   ## 한눈에 — 이번 점검 요약(핵심이슈 N · 모순 N · 자동정정 N)\n` +
    `   ## 지금 꼭 풀어야 할 모순 — 심각도 high 우선, [이슈ID] 링크와 함께, 각 항목에 "왜 충돌인지 / 권장 결정"\n` +
    `   ## 병목 & 우선순위 — 진행을 막는 것, 먼저 결정할 것 순서\n` +
    `   ## 액션 플랜 — Junseo가 고를 수 있는 구체적 선택지 2~4개\n` +
    `   ## 자동 정정됨 — 이번에 봇이 스스로 고친 사소한 항목 목록\n` +
    `   포맷 규칙: 섹션당 불렛 간결하게. 비개발자가 읽어도 무엇을 결정해야 하는지 분명하게.\n` +
    (DRY_RUN
      ? `2) DRY-RUN: 리니어에 쓰지 말고, 작성한 리포트 본문 전체를 reportBody 로, 의도한 동작을 note 로 반환.\n`
      : `2) 전용 리포트 이슈를 "${REPORT_PARENT}" 의 하위 이슈로 find-or-create 한다(여기가 정렬 로그가 쌓이는 곳):\n` +
        `   - list_issues(parentId="${REPORT_PARENT}") 로 기존 자식들을 보고, title 이 "${REPORT_TITLE}" 인 것을 찾는다.\n` +
        `   - 있으면 save_issue(id=<그 이슈>, description=새 리포트 본문) 로 본문을 통째로 갱신(살아있는 대시보드).\n` +
        `   - 없으면 save_issue(title="${REPORT_TITLE}", team="${REPORT_TEAM}", project="${REPORT_PROJECT}", milestone="${REPORT_MILESTONE}", parentId="${REPORT_PARENT}", assignee="${MENTION}", description=리포트 본문) 로 생성.\n` +
        `   주의: 이 리포트는 "${PROJECT_NAME}" 프로젝트를 점검한 결과지만, 이슈 자체는 "${REPORT_PROJECT}" 프로젝트의 ${REPORT_PARENT} 하위에 둔다(둘 다 ${REPORT_TEAM} 팀이라 부모-자식 가능).\n` +
        `3) 그 리포트 이슈에 save_comment(issueId=<리포트이슈>, body=...) 로 이번 실행 요약 댓글을 남기되 반드시 @${MENTION} 멘션으로 시작하라(로그는 댓글로 쌓인다). 예: "@${MENTION} 이번 정렬 점검 결과입니다 — 결정 필요 N건, 자동정정 N건. 본문 리포트 확인 부탁."\n` +
        `   댓글엔 "지금 당장 네 결정이 필요한 것" top 3를 불렛으로.\n`) +
    `구조화 출력으로 reportIssueId, reportIssueUrl, commentPosted, note, reportBody 를 반환하라.`,
  {
    label: 'overseer',
    phase: 'Overseer',
    model: 'opus',
    schema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        reportIssueId: { type: 'string' },
        reportIssueUrl: { type: 'string' },
        commentPosted: { type: 'boolean' },
        reportBody: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['reportBody'],
    },
  },
)

log(
  DRY_RUN
    ? 'DRY-RUN 완료 — 리니어에 쓴 것 없음. 리포트 본문만 생성됨.'
    : `완료 — 정렬 리포트 이슈 ${finalReport?.reportIssueUrl || finalReport?.reportIssueId || '(생성)'} 갱신 + @${MENTION} 태그.`,
)

return {
  project: PROJECT_NAME,
  dryRun: DRY_RUN,
  coreIssues: tree.coreIssues.length,
  contradictions: allContradictions.length,
  autoApplied: appliedOk.length,
  reportIssue: { id: finalReport?.reportIssueId, url: finalReport?.reportIssueUrl },
  highSeverityUnresolved: overview.highSeverityUnresolved.length,
  milestones: milestoneSummaries.map((m) => ({
    name: m.milestoneName,
    crossContradictions: (m.crossIssueContradictions || []).length,
  })),
  reportBody: finalReport?.reportBody,
}
