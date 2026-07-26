// literature-v1 재현성 측정 (BKT-381 남은 축 ① / 비문학 BKT-378 대응)
// 같은 책의 최근 N개 런에서 "메모 쌍이 같은 최상위 모티프에 속하는가" 관계의
// 쌍별 자카드 유사도를 계산한다. 모티프 "이름"은 실행마다 달라질 수 있으므로
// 항상 안정적인 메모 페이지를 기준으로 삼는다(비문학 memoPairRelations 와 같은 원리).
//
// 사용: node eval/scripts/litStability.mjs "그리스인 조르바" [N=3]
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const RUNS = resolve(__dir, '../runs');
const N = (s) => String(s || '').normalize('NFC');

const [, , title, nArg] = process.argv;
const takeN = Number(nArg) || 3;
if (!title) { console.error('usage: node litStability.mjs "책제목" [N]'); process.exit(1); }

const runs = readdirSync(RUNS)
  .map((f) => f.match(/^literature-v1-(\d+)\.json$/)).filter(Boolean)
  .map((m) => ({ n: +m[1], d: JSON.parse(readFileSync(resolve(RUNS, `literature-v1-${m[1]}.json`), 'utf-8')) }))
  .filter((r) => N(r.d.label) === N(title))
  .sort((a, b) => b.n - a.n)
  .slice(0, takeN)
  .reverse();
if (runs.length < 2) { console.error(`"${title}" 런이 ${runs.length}개뿐 — 2개 이상 필요`); process.exit(1); }

// 런 하나 → 메모 페이지별 최상위 모티프 id 매핑 → "같은 그룹" 쌍 집합
function pairSet(d) {
  const { nodes, rootId } = d.tree;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const topOf = (n) => { let c = n; while (c.parentId && c.parentId !== rootId) c = byId.get(c.parentId); return c.id; };
  const groupOf = new Map(); // page → top motif id
  for (const s of nodes.filter((n) => n.kind === 'sentence')) {
    const p = s.sources?.[0]; if (p == null) continue;
    groupOf.set(`${p}:${s.memoId}`, s.parentId === rootId ? `root-${s.memoId}` : topOf(byId.get(s.parentId)));
  }
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

console.log(`[stability] ${N(title)} — 런 ${runs.map((r) => r.n).join(', ')}`);
for (const r of runs) {
  const c = r.d.counts;
  console.log(`  run ${r.n}: 모티프 ${c.motifs} · 목소리 ${c.voices ?? c.characters ?? 0} · 잔류 ${c.rootSentences}`);
}
const sets = runs.map((r) => pairSet(r.d));
let sum = 0, cnt = 0;
for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
  const v = jaccard(sets[i], sets[j]);
  console.log(`  run ${runs[i].n} ↔ run ${runs[j].n}: 동일-그룹 쌍 자카드 ${(v * 100).toFixed(1)}%`);
  sum += v; cnt++;
}
console.log(`  평균: ${((sum / cnt) * 100).toFixed(1)}%`);
