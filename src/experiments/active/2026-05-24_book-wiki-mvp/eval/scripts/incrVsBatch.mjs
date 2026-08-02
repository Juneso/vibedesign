// BKT-382 합격 기준 ① — 증분 인제스트(hier-incr) vs 일괄 인제스트(hier-auto)
// 구조 일치도 측정. 같은 책의 두 파이프라인 결과가 "메모 동거 관계"로 봤을 때
// 얼마나 같은 구조인지를 litStability.mjs 의 pairSet/jaccard 방식을 그대로 차용해 잰다.
// (개념 "이름"은 실행/파이프라인마다 달라질 수 있으므로 항상 메모 페이지를 기준으로 삼는다 —
//  비문학 memoPairRelations 와 같은 원리)
//
// 입력: runs/ 에서 해당 label 의 가장 최근 hier-incr-{N}.json 과 가장 최근 hier-auto-{N}.json
//       각 1개씩을 찾아 비교한다. 둘 중 하나라도 없으면 어느 쪽이 없는지 말하고 exit 1.
//
// 두 가지 동거-쌍 집합:
//   a) 최상위 동거 — topOf(litStability 방식): 루트 직속이면 자기 자신 그룹
//   b) 키워드 동거 — 직접 부모(parentId) 기준 그룹핑
//
// 사용: node eval/scripts/incrVsBatch.mjs "책제목"
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const RUNS = resolve(__dir, '../runs');
const N = (s) => String(s || '').normalize('NFC');

const [, , title] = process.argv;
if (!title) { console.error('usage: node incrVsBatch.mjs "책제목"'); process.exit(1); }

function latestRun(series) {
  const runs = readdirSync(RUNS)
    .map((f) => f.match(new RegExp(`^${series}-(\\d+)\\.json$`))).filter(Boolean)
    .map((m) => ({ n: +m[1], d: JSON.parse(readFileSync(resolve(RUNS, `${series}-${m[1]}.json`), 'utf-8')) }))
    .filter((r) => N(r.d.label) === N(title))
    .sort((a, b) => b.n - a.n);
  return runs[0] || null;
}

const incr = latestRun('hier-incr');
const auto = latestRun('hier-auto');
if (!incr || !auto) {
  const missing = [!incr && 'hier-incr', !auto && 'hier-auto'].filter(Boolean).join(', ');
  console.error(`"${title}" — ${missing} 런을 찾지 못했다`);
  process.exit(1);
}

// 런 하나 → 메모(페이지) → 동거 그룹 id 매핑
// mode: 'top'(최상위 동거) | 'parent'(키워드 동거, 직접 부모)
function groupMap(d, mode) {
  const { nodes, rootId } = d.tree;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const topOf = (n) => { let c = n; while (c.parentId && c.parentId !== rootId) c = byId.get(c.parentId); return c.id; };
  const groupOf = new Map(); // memoId(page) → 그룹 id
  const sentenceNodes = nodes.filter((n) => n.kind === 'sentence');
  if (sentenceNodes.length) {
    // 문학형 스키마: 문장 노드의 memoId 기준
    for (const s of sentenceNodes) {
      const p = s.sources?.[0]; if (p == null) continue;
      const key = `${p}:${s.memoId}`;
      if (groupOf.has(key)) continue;
      const anchor = mode === 'top'
        ? (s.parentId === rootId ? `root-${s.memoId}` : topOf(byId.get(s.parentId)))
        : (s.parentId ?? 'root');
      groupOf.set(key, anchor);
    }
  } else {
    // 비문학형 스키마: concept 노드의 sources(=메모 페이지) 기준 (memoPairRelations 와 같은 원리)
    for (const n of nodes.filter((x) => x.kind === 'concept')) {
      for (const p of (n.sources || [])) {
        const key = `${p}`;
        if (groupOf.has(key)) continue; // 한 페이지가 여러 노드에 걸치면 최초 등장 노드 기준
        const anchor = mode === 'top'
          ? (n.parentId === rootId ? `root-${n.id}` : topOf(n))
          : (n.parentId ?? 'root');
        groupOf.set(key, anchor);
      }
    }
  }
  return groupOf;
}

function pairSet(groupOf) {
  const keys = [...groupOf.keys()].sort();
  const pairs = new Set();
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    if (groupOf.get(keys[i]) === groupOf.get(keys[j])) pairs.add(`${keys[i]}|${keys[j]}`);
  }
  return pairs;
}

const jaccard = (a, b) => {
  const inter = [...a].filter((x) => b.has(x)).length;
  const uni = new Set([...a, ...b]).size;
  return uni ? inter / uni : 1;
};

console.log(`[incr-vs-batch] ${N(title)} — hier-incr-${incr.n} ↔ hier-auto-${auto.n}`);

for (const [name, r] of [['hier-incr', incr], ['hier-auto', auto]]) {
  const c = r.d.counts || {};
  const covered = c.coveredMemos ?? c.sentences ?? 0;
  console.log(`  ${name}-${r.n}: 개념 ${c.concepts ?? '?'} · 커버리지 ${covered}/${r.d.nMemos ?? '?'}`);
}

const topA = groupMap(incr.d, 'top');
const topB = groupMap(auto.d, 'top');
const parA = groupMap(incr.d, 'parent');
const parB = groupMap(auto.d, 'parent');

const jTop = jaccard(pairSet(topA), pairSet(topB));
const jPar = jaccard(pairSet(parA), pairSet(parB));

console.log(`  최상위 동거 자카드: ${(jTop * 100).toFixed(1)}%`);
console.log(`  키워드(직접 부모) 동거 자카드: ${(jPar * 100).toFixed(1)}%`);
