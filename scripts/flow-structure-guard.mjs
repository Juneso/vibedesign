#!/usr/bin/env node
// PostToolUse 훅: Linear save_issue 직후, 플로우 구조 도표 갱신을 상기시킨다.
// 플로우(N | …) / 핵심 기획(N-M | …) / 기획·UX·인프라 라벨 이슈가 바뀌면
// 최상위 플로우 이슈의 "## 구조 (한눈에)" 도표가 최신인지 확인하라는 컨텍스트를 출력.
//
// 비차단(always exit 0). 규칙: docs/flow-structure.md

let raw = ''
process.stdin.on('data', (d) => (raw += d))
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(raw || '{}')
    const inp = j.tool_input || j.toolInput || {}
    const title = String(inp.title || '')
    const labels = (inp.labels || []).map(String)
    const isFlow = /^\s*\d+\s*\|/.test(title) // "1 | 로그인"
    const isPlan = /^\s*\d+-\d+\s*\|/.test(title) || labels.includes('기획')
    const isImpl = labels.includes('UX') || labels.includes('인프라')
    if (isFlow || isPlan || isImpl) {
      const lines = [
        '[flow-structure] 플로우 구조에 영향이 있을 수 있는 이슈가 변경됨.',
        '→ 해당 최상위 플로우(N | …) 이슈의 "## 구조 (한눈에)" 도표가 최신 기획을 반영하는지 확인.',
        '→ 바뀌었다면 docs/flow-diagrams/<flow>.svg 수정 후: node scripts/flow-diagram.mjs <flowIssue> <svg>',
        '규칙: docs/flow-structure.md',
      ]
      process.stdout.write(lines.join('\n') + '\n')
    }
  } catch {
    // 파싱 실패 시 조용히 통과
  }
  process.exit(0)
})
