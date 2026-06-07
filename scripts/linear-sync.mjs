#!/usr/bin/env node
// post-commit 훅에서 호출. 커밋 메시지에서 DES-XXX 추출 →
// Linear 이슈에 코멘트 추가 + 본문 ## 결과 섹션 갱신.
//
// 필요 env: LINEAR_API_KEY (.env.local 또는 셸 환경변수)

import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = execSync('git rev-parse --show-toplevel').toString().trim()

// .env.local에서 LINEAR_API_KEY 로드
function loadEnv() {
  const envPath = join(repoRoot, '.env.local')
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) {
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      process.env[m[1]] = v
    }
  }
}
loadEnv()

const TOKEN = process.env.LINEAR_API_KEY
if (!TOKEN) {
  console.error('[linear-sync] LINEAR_API_KEY 없음 — 스킵')
  process.exit(0)
}

// 최신 커밋 정보
const sha = execSync('git rev-parse HEAD').toString().trim()
const shortSha = sha.slice(0, 7)
const message = execSync('git log -1 --pretty=%B').toString().trim()
const files = execSync('git show --stat --name-only --format= HEAD')
  .toString()
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)

// 커밋 메시지에서 DES-XXX 모두 추출
const ids = [...new Set([...message.matchAll(/\bDES-\d+\b/g)].map((m) => m[0]))]
if (ids.length === 0) {
  console.log('[linear-sync] DES-XXX 없음 — 스킵')
  process.exit(0)
}

async function gql(query, variables) {
  const r = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: TOKEN },
    body: JSON.stringify({ query, variables }),
  })
  const json = await r.json()
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors))
  }
  return json.data
}

const ISSUE_QUERY = `
  query Issue($id: String!) {
    issue(id: $id) {
      id
      identifier
      description
      url
    }
  }
`

const COMMENT_MUTATION = `
  mutation CommentCreate($issueId: String!, $body: String!) {
    commentCreate(input: { issueId: $issueId, body: $body }) {
      success
    }
  }
`

const ISSUE_UPDATE_MUTATION = `
  mutation IssueUpdate($id: String!, $description: String!) {
    issueUpdate(id: $id, input: { description: $description }) {
      success
    }
  }
`

// 커밋 1줄 요약(헤더) 추출
const header = message.split('\n')[0]

// ## 결과 섹션 엔트리 (LINEAR.md 컨벤션 — 완료 시 채우는 섹션)
function buildResultEntry() {
  const fileLines = files.slice(0, 20).map((f) => `  - \`${f}\``).join('\n')
  const moreNote = files.length > 20 ? `\n  - ... 외 ${files.length - 20}개 파일` : ''
  return `- **\`${shortSha}\`** ${header}\n${fileLines}${moreNote}`
}

// 기존 description에 ## 결과 섹션 갱신
function mergeResult(description = '') {
  const entry = buildResultEntry()
  if (/^##\s*결과\s*$/m.test(description)) {
    // 기존 ## 결과 섹션 뒤에 append (다음 ## 헤더 직전까지)
    return description.replace(
      /(^##\s*결과\s*\n)([\s\S]*?)(?=\n##\s|\n*$)/m,
      (_, head, body) => `${head}${body.trimEnd()}\n${entry}\n`,
    )
  }
  // 없으면 끝에 추가
  return `${description.trimEnd()}\n\n## 결과\n\n${entry}\n`
}

function buildComment() {
  const fileLines = files.slice(0, 20).map((f) => `- \`${f}\``).join('\n')
  const moreNote = files.length > 20 ? `\n- ... 외 ${files.length - 20}개` : ''
  return `🔗 commit \`${shortSha}\` — ${header}\n\n**변경 파일**\n${fileLines}${moreNote}`
}

for (const id of ids) {
  try {
    const data = await gql(ISSUE_QUERY, { id })
    const issue = data.issue
    if (!issue) {
      console.warn(`[linear-sync] ${id} 이슈 없음`)
      continue
    }
    const newDesc = mergeResult(issue.description || '')
    await gql(ISSUE_UPDATE_MUTATION, { id: issue.id, description: newDesc })
    await gql(COMMENT_MUTATION, { issueId: issue.id, body: buildComment() })
    console.log(`[linear-sync] ${issue.identifier} 갱신 — ${issue.url}`)
  } catch (e) {
    console.error(`[linear-sync] ${id} 실패:`, e.message)
  }
}
