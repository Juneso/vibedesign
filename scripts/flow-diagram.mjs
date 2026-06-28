#!/usr/bin/env node
// 최상위 플로우 이슈의 "## 구조 (한눈에)" 도표를 갱신한다.
//
// 사용법: node scripts/flow-diagram.mjs <ISSUE> <SVG_PATH>
//   ISSUE    : 플로우 이슈 식별자 (예: BKT-259)
//   SVG_PATH : 자립형 SVG (흰 배경 + 인라인 색). docs/flow-diagrams/*.svg 권장
//
// 동작: SVG → PNG 렌더 → Linear 업로드 → 이슈 본문 "## 구조 (한눈에)" 섹션의
//       이미지를 교체(없으면 삽입). 멱등 — 같은 SVG면 같은 결과.
//
// 필요 env: LINEAR_API_KEY (.env.local 또는 셸 환경변수)
// 규칙 문서: docs/flow-structure.md

import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const repoRoot = execSync('git rev-parse --show-toplevel').toString().trim()

// .env.local 후보: 현재 워크트리 + 메인 워크트리(.env.local은 gitignore라 워크트리엔 없을 수 있음)
function envCandidates() {
  const paths = [join(repoRoot, '.env.local')]
  try {
    const main = execSync('git worktree list --porcelain').toString().split('\n')
      .find((l) => l.startsWith('worktree '))?.slice('worktree '.length).trim()
    if (main) paths.push(join(main, '.env.local'))
  } catch {}
  return [...new Set(paths)]
}
function loadEnv() {
  for (const envPath of envCandidates()) {
    if (!existsSync(envPath)) continue
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) {
        let v = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        process.env[m[1]] = v
      }
    }
  }
}
loadEnv()

const TOKEN = process.env.LINEAR_API_KEY
if (!TOKEN) { console.error('[flow-diagram] LINEAR_API_KEY 없음 — .env.local 확인'); process.exit(1) }

const [issueArg, svgPath] = process.argv.slice(2)
if (!issueArg || !svgPath) { console.error('사용법: node scripts/flow-diagram.mjs <ISSUE> <SVG_PATH>'); process.exit(1) }
if (!existsSync(svgPath)) { console.error('[flow-diagram] SVG 없음:', svgPath); process.exit(1) }

async function gql(query, variables) {
  const r = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: TOKEN },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors))
  return j.data
}

// 1) SVG → PNG (시스템 폰트 로드 — 한글 포함)
const svg = readFileSync(svgPath)
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1360 }, font: { loadSystemFonts: true } }).render().asPng()

// 2) Linear 업로드 URL 요청 → PUT
const filename = `flow-structure-${issueArg.toLowerCase()}.png`
const up = await gql(
  `mutation($ct:String!,$fn:String!,$sz:Int!){fileUpload(contentType:$ct,filename:$fn,size:$sz){success uploadFile{uploadUrl assetUrl headers{key value}}}}`,
  { ct: 'image/png', fn: filename, sz: png.length },
)
if (!up.fileUpload?.success) { console.error('[flow-diagram] fileUpload 실패'); process.exit(1) }
const uf = up.fileUpload.uploadFile
const headers = { 'content-type': 'image/png' }
for (const h of uf.headers) headers[h.key] = h.value
const putRes = await fetch(uf.uploadUrl, { method: 'PUT', headers, body: png })
if (!putRes.ok) { console.error('[flow-diagram] 업로드 PUT 실패:', putRes.status); process.exit(1) }
const assetUrl = uf.assetUrl

// 3) 식별자 → 이슈 uuid + 현재 본문
const m = issueArg.match(/^([A-Za-z]+)-(\d+)$/)
if (!m) { console.error('[flow-diagram] 식별자 형식 오류 (예: BKT-259)'); process.exit(1) }
const data = await gql(
  `query($key:String!,$num:Float!){issues(filter:{team:{key:{eq:$key}},number:{eq:$num}}){nodes{id title description}}}`,
  { key: m[1].toUpperCase(), num: Number(m[2]) },
)
const issue = data.issues.nodes[0]
if (!issue) { console.error('[flow-diagram] 이슈 못 찾음:', issueArg); process.exit(1) }

// 4) "## 구조 (한눈에)" 섹션 이미지 교체/삽입 (멱등)
const SEC = '## 구조 (한눈에)'
const imgLine = `![flow-structure](${assetUrl})`
const imgRe = /!\[[^\]]*\]\(https?:\/\/[^)]*\)/
let desc = issue.description || ''
if (desc.includes(SEC)) {
  const idx = desc.indexOf(SEC)
  const before = desc.slice(0, idx)
  const rest = desc.slice(idx)
  const nextIdx = rest.indexOf('\n## ', SEC.length)
  const end = nextIdx === -1 ? rest.length : nextIdx
  let section = rest.slice(0, end)
  const after = rest.slice(end)
  section = imgRe.test(section) ? section.replace(imgRe, imgLine) : section.replace(SEC, `${SEC}\n\n${imgLine}`)
  desc = before + section + after
} else {
  desc = `${SEC}\n\n${imgLine}\n\n` + desc
}
await gql(`mutation($id:String!,$desc:String!){issueUpdate(id:$id,input:{description:$desc}){success}}`, { id: issue.id, desc })
console.log(`[flow-diagram] ${issueArg} "${issue.title}" 구조도 갱신 완료`)
console.log(`  asset: ${assetUrl}`)
