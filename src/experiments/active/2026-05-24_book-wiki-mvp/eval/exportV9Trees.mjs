// V9 스냅샷 → 대시보드 트리(SVG) 런으로 내보내기 (BKT-378)
//
// V9 러너들은 트리를 ASCII 문자열로만 남겨서 대시보드가 그림으로 못 그렸다.
// hier-v9-batch.json 이 56권 전수의 snapshot 을 이미 담고 있으므로 재실행 없이 변환한다.
// V8(obsidian-hier-v8)과 같은 tree 형식({rootId,nodes})으로 맞춰 나란히 비교할 수 있게 한다.
//
// 키워드의 논지(claim)를 gloss 로 넣으면 TreeSvg 가 말단 키워드의 설명을
// 문장별 노드로 자동으로 펼친다(별도 처리 불필요).
//
// 사용: node eval/exportV9Trees.mjs           (V8 과 겹치는 책만 — 비교용)
//        ALL=1 node eval/exportV9Trees.mjs    (56권 전수)
// 결과: runs/hier-v9-tree-{N}.json + .md  (시리즈 hier-v9-tree)
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const RUNS = resolve(__dir, 'runs');
const PREFIX = 'hier-v9-tree-';
const ALL = !!process.env.ALL;
const N = (s) => String(s || '').normalize('NFC');

const batch = JSON.parse(await readFile(resolve(RUNS, 'hier-v9-batch.json'), 'utf-8'));

// 비교 대상: V8 을 돌린 옵시디언 책들 (없으면 전수)
let wanted = null;
if (!ALL) {
  try {
    const meta = JSON.parse(await readFile(resolve(__dir, 'golden/obsidian-books-meta.json'), 'utf-8'));
    wanted = new Set(Object.values(meta).map((m) => N(m.title)));
  } catch { /* 메타 없으면 전수 */ }
}

// V9 스냅샷 → TreeSvg 형식.
// 계층: 책 → (목차 장) → 키워드 → (승격된 하위 키워드). 목차가 없으면 장 단계를 건너뛴다.
function snapToTree(snap, bookTitle) {
  const src = snap.nodes || [];
  const byId = new Map(src.map((n) => [n.id, n]));
  const nodes = [{ id: 'root', title: N(bookTitle), parentId: null, level: 0, kind: 'root', sources: [] }];

  // 장 노드 — chapter 문자열이 있는 것만 (폴백 모드면 전부 빈 문자열이라 생성되지 않는다)
  const chapters = [...new Set(src.map((n) => n.chapter).filter(Boolean))];
  const chapterId = new Map();
  chapters.forEach((c, i) => {
    const id = `ch${i}`;
    chapterId.set(c, id);
    nodes.push({ id, title: N(c), parentId: 'root', level: 1, kind: 'chapter', sources: [] });
  });

  // 부모 체인 깊이
  const depth = (n) => {
    let d = 0, cur = n;
    while (cur?.parentId && byId.has(cur.parentId)) { d++; cur = byId.get(cur.parentId); }
    return d;
  };
  const base = chapters.length ? 2 : 1;

  for (const n of src) {
    const pages = (n.memos || []).map((m) => m.p);
    const parent = n.parentId && byId.has(n.parentId)
      ? n.parentId
      : (n.chapter && chapterId.has(n.chapter) ? chapterId.get(n.chapter) : 'root');
    // 논지가 곧 설명이다. 승격된 가상 노드는 논지가 비어 있어 페이지만 붙는다.
    const gloss = [n.claim || '', pages.length ? `근거 p.${pages.join(', p.')}` : '']
      .filter(Boolean).join('\n\n');
    nodes.push({
      id: n.id,
      title: N(n.title) + (pages.length ? ` (p.${Math.min(...pages)})` : ''),
      parentId: parent,
      level: base + depth(n),
      kind: n.virtual ? 'promoted' : 'keyword',
      sources: pages,
      gloss,
    });
  }
  return { rootId: 'root', nodes };
}

// 이전 산출물 정리 (권수가 줄어도 유령 런이 안 남게)
for (const f of await readdir(RUNS)) {
  if (f.startsWith(PREFIX) && (f.endsWith('.json') || f.endsWith('.md'))) await unlink(resolve(RUNS, f));
}

const targets = (batch.results || []).filter((r) => !wanted || wanted.has(N(r.title)));
console.log(`[V9 트리] ${targets.length}권 내보내기 (${wanted ? 'V8 비교 대상' : '전수'})`);

let i = 0;
for (const r of targets) {
  const tree = snapToTree(r.snap || { nodes: [] }, r.title);
  const keywords = tree.nodes.filter((n) => n.kind === 'keyword').length;
  const promoted = tree.nodes.filter((n) => n.kind === 'promoted').length;
  const base = resolve(RUNS, `${PREFIX}${++i}`);

  await writeFile(`${base}.json`, JSON.stringify({
    label: N(r.title),
    runAt: new Date().toISOString(),
    kind: 'hier-v9-tree',
    variant: 'v9',
    model: batch.model || 'gpt-4o-mini',
    note: 'hier-v9-batch 스냅샷에서 변환 — 재실행 없음. 목차 없는 폴백 모드 결과다.',
    memoN: r.memoN,
    stability: { agree: r.agree, jac: r.jac },
    counts: { keywords, promoted, thick: r.thick },
    tree,
  }, null, 2) + '\n', 'utf-8');

  let md = `# ${N(r.title)} — V9 위계\n\n`;
  md += `- 메모 ${r.memoN}개 · 키워드 ${keywords}개 · 승격 ${promoted}개 · 두꺼운 노드 ${r.thick}개\n`;
  md += `- 안정성: 라벨 일치 ${(r.agree * 100).toFixed(0)}% · 관계쌍 자카드 ${(r.jac * 100).toFixed(0)}%\n`;
  md += `- 목차 없는 폴백 모드 결과 (hier-v9-batch 스냅샷에서 변환)\n\n`;
  md += `## 트리\n\n말단 키워드는 논지가 문장별로 펼쳐진다.\n\n`;
  await writeFile(`${base}.md`, md, 'utf-8');
  console.log(`  [${i}/${targets.length}] ${N(r.title)} — 키워드 ${keywords} · 승격 ${promoted} · 노드 ${tree.nodes.length}`);
}
console.log(`\n✓ ${i}권 → runs/${PREFIX}*.json`);
