// v12 증분 동화 러너 (BKT-342 4단계 · 설계 C절) — 메모가 한 건씩 도착하는 실사용 경로.
//
// lift 는 단건 연산이라 온라인 패스에 그대로 들어간다. 조립 판정은 폐쇄형 유지:
// - attach|new: 표제어 클러스터 일치(정규화 자구; 임베딩은 후속) — LLM 0콜
// - 신규 클러스터의 블록 배정: 기존 블록 이름 중 하나를 고르는 폐쇄 선택 — 메모당 1콜
// - 블록이 아직 없으면(클러스터 8개 미만) 뿌리에 쌓는다 — v11 "씨앗 단계" 계승:
//   재료 없이 구조를 세우면 억지가 된다
// - 통합 패스(마지막): 역할 블록 재계산 1콜 — 온라인 배정과의 차이를 로그로 남긴다
//
// 사용: LIFTS=runs/lift-v12-haiku-1.json node runHierV12Incr.mjs [라벨]
//       (LIFTS 미지정 시 golden/lift-golden-피로사회.json — 동화 로직만 따로 검증)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizeLift } from './lib/liftV12.mjs';
import { BLOCK_ROLES } from './lib/hierV12Engine.mjs';
import { claudeCliTransport } from './lib/claudeCliTransport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] || '1';
const MODEL = process.env.MODEL || 'claude-haiku-4-5-20251001';
const liftsPath = process.env.LIFTS || 'golden/lift-golden-피로사회.json';
const src = JSON.parse(await readFile(resolve(__dir, liftsPath), 'utf-8'));

const N = (s) => String(s || '').normalize('NFC');
const nrm = (s) => N(s).replace(/\s+/g, '').toLowerCase();
const BLOCK_MIN_CLUSTERS = 8;

const usages = [];
const llm = claudeCliTransport({ model: MODEL, onUsage: (u) => usages.push(u) });

const clusters = []; // { id, rep, headwords:Set, claims:[] }
let blocks = null;   // [{ name, role, why, clusterIds:Set }]
const log = [];
let llmCalls = 0;

const devLine = (k) => {
  const d = {}; for (const c of k.claims) for (const x of c.devices) d[x] = (d[x] || 0) + 1;
  return Object.entries(d).sort((a, b) => b[1] - a[1]).map(([x, n]) => (n > 1 ? `${x}×${n}` : x)).join(',');
};
const clusterLine = (ks) => ks.map((k) => `${k.id} | ${k.rep} — 주장 ${k.claims.length}개 · 방식: ${devLine(k)} · 대표: ${k.claims[0].claim.slice(0, 60)}`).join('\n');
const byIdOrHead = (t) => clusters.find((k) => k.id === t) || clusters.find((k) => k.headwords.has(nrm(t)) || nrm(k.rep) === nrm(t));

// 역할 블록 편성/재계산 — 배치 엔진과 같은 프롬프트 계약 (기준 단일화)
async function organizeBlocks(kind) {
  let raw;
  try { raw = await llmCall(kind); } catch (e) { log.push(`[incr✗] ${kind} 콜 실패: ${e.message.slice(0, 80)}`); return null; }
  llmCalls++;
  let bj = []; try { bj = JSON.parse(raw).blocks || []; } catch { log.push(`[incr✗] ${kind} 파싱 실패`); return null; }
  const assigned = new Set();
  const out = [];
  for (const b of bj) {
    const ms = (b.memberIds || []).map(byIdOrHead).filter((k) => k && !assigned.has(k.id));
    if (!ms.length) continue;
    ms.forEach((k) => assigned.add(k.id));
    out.push({ name: N(b.name).trim() || b.role, role: BLOCK_ROLES.includes(b.role) ? b.role : '기타', why: N(b.why || '').trim(), clusterIds: new Set(ms.map((k) => k.id)) });
  }
  log.push(`[incr] ${kind}: 블록 ${out.length}개 — ${out.map((b) => `${b.name}(${b.role}·${b.clusterIds.size})`).join(' · ')} · 미배정 ${clusters.length - assigned.size}`);
  return out.length ? out : null;
}
function llmCall(kind) {
  return llm({
    system: `주장 키워드들을 책의 역할 블록으로 편성한다. 블록은 "이 키워드들이 책의 논지에서 맡는 역할"의 묶음이다 — 신호: 통념 반박·문답 계열 주장 → 문제의식 / 시대·사회의 이행을 서술하는 주장 → 배경 / 인과·분석 계열 주장 → 진단 / 중단·회복·해결을 말하는 주장 → 처방.
블록은 2~5개. name 은 이 책의 실제 내용을 가리키는 짧은 명사구, role 은 ${BLOCK_ROLES.join('|')} 중 하나. 모든 키워드를 어느 한 블록에 배정하라(한 키워드는 한 블록에만). 한 블록이 전체를 독식하면 안 된다. JSON만 출력.`,
    user: `책: 피로사회 (한병철)\n\n[주장 키워드 — 전개 방식 분포 포함]\n${clusterLine(clusters)}\n\n출력 JSON: {"blocks":[{"name":"블록 이름","role":"${BLOCK_ROLES.join('|')}","memberIds":["k0"],"why":"한 줄"}]}`,
    temperature: 0.1,
  });
}

// ── 온라인 패스: 메모 1건씩 ──────────────────────────────────
for (const l of src.lifts) {
  const { lift } = normalizeLift(l, { memoId: l.memoId });
  const fresh = [];
  for (const c of lift.claims) {
    const claim = { ...c, memoId: l.memoId, p: l.p, key: `${l.memoId}#${c.id}` };
    const hit = clusters.find((k) => k.headwords.has(nrm(c.headword)));
    if (hit) { hit.claims.push(claim); hit.headwords.add(nrm(c.headword)); log.push(`[incr] p${l.p} "${c.headword}" attach → ${hit.rep}(${hit.claims.length})`); }
    else { const k = { id: `k${clusters.length}`, rep: c.headword, headwords: new Set([nrm(c.headword)]), claims: [claim] }; clusters.push(k); fresh.push(k); }
  }
  if (fresh.length) log.push(`[incr] p${l.p} new ${fresh.length}: ${fresh.map((k) => k.rep).join(' · ')}`);

  if (!blocks && clusters.length >= BLOCK_MIN_CLUSTERS) {
    blocks = await organizeBlocks('첫 편성');
  } else if (blocks && fresh.length) {
    // 폐쇄 배정: 기존 블록 이름 중 하나 또는 보류 — 메모당 1콜.
    // 콜 실패는 보류로 강등 — 동화는 한 건의 실패가 런 전체를 죽이면 안 된다
    let raw = null;
    try { raw = await llm({
      system: '새 키워드를 기존 역할 블록 중 하나에 배정한다. 블록의 역할·구성원과 같은 역할일 때만 그 블록을 고르고, 어느 블록의 역할도 아니면 "보류"를 내라. JSON만 출력.',
      user: `책: 피로사회\n\n[기존 블록]\n${blocks.map((b) => `- ${b.name} (${b.role}): ${[...b.clusterIds].slice(0, 8).map((id) => clusters.find((k) => k.id === id)?.rep).join(', ')}`).join('\n')}\n\n[새 키워드]\n${clusterLine(fresh)}\n\n출력 JSON: {"assign":[{"id":"k?","block":"블록 이름 또는 보류"}]}`,
      temperature: 0.1,
    }); llmCalls++; } catch (e) { log.push(`[incr✗] p${l.p} 배정 콜 실패 — 보류: ${e.message.slice(0, 60)}`); }
    try {
      if (raw)
      for (const a of (JSON.parse(raw).assign || [])) {
        const k = byIdOrHead(a.id); if (!k) continue;
        const b = blocks.find((x) => nrm(x.name) === nrm(a.block));
        if (b) { b.clusterIds.add(k.id); log.push(`[incr] p${l.p} 배정 "${k.rep}" → ${b.name}`); }
        else log.push(`[incr] p${l.p} 보류 "${k.rep}"`);
      }
    } catch { log.push(`[incr✗] p${l.p} 배정 파싱 실패 — 보류`); }
  }
}

// ── 통합 패스: 역할 블록 재계산 — 온라인 배정과의 차이 기록 ────
const before = blocks ? blocks.map((b) => `${b.name}:${[...b.clusterIds].length}`).join(' · ') : '(없음)';
const rebuilt = await organizeBlocks('통합 재계산');
if (rebuilt) {
  const moved = [];
  if (blocks) for (const nb of rebuilt) for (const id of nb.clusterIds) {
    const ob = blocks.find((b) => b.clusterIds.has(id));
    if (ob && nrm(ob.name) !== nrm(nb.name)) moved.push(`${clusters.find((k) => k.id === id)?.rep}(${ob.name}→${nb.name})`);
  }
  if (moved.length) log.push(`[incr] 통합 패스 이동 ${moved.length}건: ${moved.join(' · ')}`);
  blocks = rebuilt;
}

// ── 트리 직렬화 + 대조 엣지 (배치와 같은 형태 → 같은 채점기 소비) ──
let SEQ = 0; const id = () => `n${++SEQ}`;
const nodes = [];
const root = { id: id(), title: '피로사회', parentId: null, level: 0, kind: 'root', sources: [] };
nodes.push(root);
const addKw = (k, parent) => {
  const kw = { id: id(), title: k.rep, parentId: parent.id, level: parent.level + 1, kind: 'concept', sources: [], gloss: k.claims[0].claim.slice(0, 160), promoted: k.claims.length >= 2, clusterId: k.id };
  nodes.push(kw); k.nodeId = kw.id;
  for (const c of k.claims) {
    nodes.push({ id: id(), title: c.claim, parentId: kw.id, level: kw.level + 1, kind: 'sentence', sources: c.p != null ? [c.p] : [], gloss: c.headword, memoId: c.memoId, claimKey: c.key, devices: c.devices, confidence: c.confidence });
    if (c.p != null && !kw.sources.includes(c.p)) kw.sources.push(c.p);
  }
  return kw;
};
const placed = new Set();
for (const b of (blocks || [])) {
  const bn = { id: id(), title: b.name, parentId: root.id, level: 1, kind: 'concept', role: b.role, sources: [], gloss: b.why };
  nodes.push(bn);
  for (const cid of b.clusterIds) { const k = clusters.find((x) => x.id === cid); if (k) { addKw(k, bn); placed.add(cid); } }
}
for (const k of clusters.filter((x) => !placed.has(x.id))) addKw(k, root);

const edges = [];
const findByText = (text, exclude) => {
  const name = nrm(N(text).split('—')[0]);
  return clusters.find((k) => k !== exclude && [...k.headwords].some((h) => h === name || (h.length >= 4 && name.includes(h))));
};
for (const k of clusters) for (const c of k.claims) {
  const s = c.slots?.['대조']; if (!s) continue;
  const bSide = s.pair.map((t) => findByText(t, k)).find(Boolean) || null;
  edges.push({ type: '대조', axis: s.axis, pair: s.pair, claimKey: c.key, a: k.nodeId, b: bSide?.nodeId || null });
}

const sum = (f) => usages.reduce((s, u) => s + (f(u) || 0), 0);
const out = {
  label: `hier-v12-incr-${label}`, runAt: new Date().toISOString(), kind: 'hier-v12-incr',
  model: MODEL, liftsFrom: liftsPath, nMemos: src.lifts.length, llmCalls,
  counts: { claims: clusters.reduce((s, k) => s + k.claims.length, 0), clusters: clusters.length, promoted: clusters.filter((k) => k.claims.length >= 2).length, blocks: blocks?.length || 0, contrastEdges: edges.length, onlineBlocks: before },
  usage: { calls: usages.length, ms: sum((u) => u.ms), outputTokens: sum((u) => u.outputTokens), costUsd: Math.round(sum((u) => u.costUsd) * 1000) / 1000 },
  tree: { rootId: root.id, nodes, edges }, log,
};
await writeFile(resolve(__dir, `runs/${out.label}.json`), JSON.stringify(out, null, 2));
console.log(`✓ ${out.label} — 클러스터 ${out.counts.clusters} · 블록 ${out.counts.blocks} · LLM ${llmCalls}콜 (${Math.round(out.usage.ms / 1000)}초)`);
