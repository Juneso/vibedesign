// 빅콜 실험 (BKT-380 0809) — "판단은 모델, 검증은 코드" 역전 가설의 A/B.
// 소네트 1콜에 메모 전체 + 목차·소개를 주고 트리 JSON 을 통째로 받는다.
// 산출은 v13 채점기가 읽는 run 포맷(tree.nodes/edges)으로 변환 — 룰 파이프라인과 같은 잣대.
//
// 사용: [BOOK=피로사회|MEMOS_FILE=golden/adhoc-넥서스.json] [MODEL=claude-sonnet-5] node runBigCall.mjs <라벨>

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { claudeCliTransport } from './lib/claudeCliTransport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const N = (s) => String(s || '').normalize('NFC');
const nrmT = (s) => N(s).trim();
const label = process.argv[2] || '1';

let book;
if (process.env.MEMOS_FILE) {
  book = JSON.parse(await readFile(resolve(__dir, process.env.MEMOS_FILE), 'utf-8'));
} else {
  const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
  book = ds.books.find((b) => nrmT(b.title) === nrmT(process.env.BOOK || '피로사회'));
}
const memoId = (i) => `ds-b50-${nrmT(book.title)}-${i}`;

// 리치데이터 (목차·소개) — runSalience 와 같은 경로
let rich = [book.toc, book.summary, book.intro].filter(Boolean);
if (!rich.length) {
  try {
    const meta = JSON.parse(await readFile(resolve(__dir, 'golden/obsidian-books-meta.json'), 'utf-8'));
    const m = Object.values(meta).find((b) => nrmT(b.title || b.matchedTitle).includes(nrmT(book.title)) || nrmT(book.title).includes(nrmT(b.matchedTitle || b.title)));
    if (m) rich = [m.toc, m.summary].filter(Boolean);
  } catch {}
}

const memoLines = book.memos.map((m, i) => `[${memoId(i)}] (p.${m.p ?? m.page ?? '?'}) ${N(m.text).replace(/\s+/g, ' ')}`).join('\n');

const prompt = `너는 독서 앱의 인제스트 엔진이다. 아래는 『${nrmT(book.title)}』에서 독자가 수집한 메모 전체다. 이것을 개념 위키 트리로 정리하라.

${rich.length ? `## 책 정보 (목차·소개)\n${rich.join('\n\n').slice(0, 3000)}\n` : ''}
## 수집된 메모
${memoLines}

## 정리 원칙
1. 키워드(개념) 노드를 세우고, 각 메모의 논지를 문장 노드로 그 밑에 배치한다. 메모 원문을 요약한 주장 문장으로 쓰되 출처 memoId 와 페이지를 보존한다.
2. 키워드는 "책 수준에서 중점적으로 설명되는 개념"만 세운다. 한 문장에만 스치는 지엽 화제, 저자가 중요하지 않다고 명시한 것은 키워드로 세우지 말고 관련 키워드 밑 문장으로 흡수한다.
3. 각 키워드에 중요도 score(0~1)를 매긴다 — 기준: 등장 빈도, 여러 메모에 걸친 분포, 다른 개념 설명에 참조되는 정도, 목차·소개에서 중점적으로 다뤄지는지.
4. 위계: 큰 맥(프레임 개념)이 부모, 상세 설명·하위 유형이 자식. 자식의 score 는 부모보다 높을 수 없다.
5. 저자가 명시적으로 대비시키는 두 개념이 둘 다 중요하면 "A ↔ B" 대조축 노드(relation: "대조축")를 만들고 두 개념을 그 자식으로 둔다. 지엽적 대조는 문장에만 남긴다.
6. 메모가 풍부해 책의 논증 구조가 보이면 뿌리 직속에 역할 블록을 세우고 키워드를 그 밑에 배치해도 된다. role 값은 반드시 "배경"·"문제의식"·"진단"·"처방" 넷 중에서만 고른다 — 다른 이름(증상, 원인, 해법 등)을 지어내지 마라. 재료가 부족하면 절대 억지로 만들지 말고 키워드를 뿌리에 평면 배치한다.
6-1. 블록을 세웠더라도 키워드 간 위계는 유지하라 — 블록 바로 밑에 모든 키워드를 평면 나열하지 말고, 큰 맥 키워드(프레임) 밑에 그 상세·하위 개념 키워드를 중첩시켜라. 예: 사회 프레임 개념 밑에 그 사회가 낳는 주체 개념, 주체 밑에 그 주체의 행동 양상 개념.
7. 한 메모에 서로 다른 개념 여럿이 있으면 각각 제 키워드 밑으로 흩어 배치한다 — 뭉뚱그리지 마라.
8. contrasts 에는 저자가 대비시키는 모든 쌍을 담되, 쌍의 양변은 트리의 키워드 제목 또는 본문에 실제로 쓰인 표현을 그대로 써라 — 새 표현으로 바꿔 쓰면 대조가 유실된다.

## 출력 (JSON만, 다른 텍스트 금지)
{"tree":[{"title":"키워드","kind":"concept","score":0.9,"role":null,"relation":null,"children":[{"title":"주장 문장","kind":"sentence","memoId":"ds-…","p":126}]}],"contrasts":[{"pair":["A","B"],"axis":"대조 축 설명"}]}
tree 는 뿌리 직속 노드의 배열이다. concept 는 children 을 가질 수 있고 sentence 는 잎이다.`;

let usage = null;
const llm = claudeCliTransport({ model: process.env.MODEL || 'claude-sonnet-5', timeoutMs: 480000, onUsage: (u) => { usage = u; } });
const t0 = Date.now();
const raw = await llm({ user: prompt });
const sec = Math.round((Date.now() - t0) / 100) / 10;
const parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || ['{}'])[0]);

// v13 채점기 포맷으로 변환
let seq = 0;
const id = () => `n${++seq}`;
const nodes = [];
const root = { id: 'root', title: nrmT(book.title), parentId: null, level: 0, kind: 'root', sources: [] };
nodes.push(root);
const walk = (arr, parent) => {
  for (const x of arr || []) {
    const n = {
      id: id(), parentId: parent.id, level: parent.level + 1, kind: x.kind === 'sentence' ? 'sentence' : 'concept',
      title: N(x.title), gloss: x.kind === 'sentence' ? N(x.title) : (x.gloss ? N(x.gloss) : ''),
      sources: [], memoId: x.memoId || null, p: x.p ?? null,
      score: typeof x.score === 'number' ? x.score : undefined,
      role: x.role || undefined, relation: x.relation || undefined,
    };
    nodes.push(n);
    if (x.children) walk(x.children, n);
  }
};
walk(parsed.tree, root);
const edges = (parsed.contrasts || []).map((c) => ({ type: '대조', pair: c.pair || [], axis: c.axis || '', a: null, b: null }));

const out = {
  label: `hier-bigcall-${label}`, runAt: new Date().toISOString(), kind: 'hier-bigcall',
  provider: 'claude-bigcall', model: process.env.MODEL || 'claude-sonnet-5', nMemos: book.memos.length,
  llmCalls: 1, sec, promptChars: prompt.length, rawChars: raw.length, usage,
  tree: { rootId: 'root', nodes, edges }, log: [`[bigcall] 1콜 ${sec}초 · 입력 ${prompt.length}자 · 출력 ${raw.length}자`],
};
await writeFile(resolve(__dir, `runs/${out.label}.json`), JSON.stringify(out, null, 2));

// 사람용 md
let md = `# ${out.label} — 소네트 빅콜 (판단=모델 실험)\n\n> ${out.runAt} · ${out.model} · 1콜 · ${sec}초\n\n## 트리\n\n`;
const render = (nid, depth) => {
  for (const n of nodes.filter((x) => x.parentId === nid)) {
    const ind = '  '.repeat(depth);
    md += n.kind === 'concept'
      ? `${ind}- **${n.title}**${typeof n.score === 'number' ? ` (${n.score})` : ''}${n.role ? ` [${n.role}]` : ''}${n.relation === '대조축' ? ' (대조축)' : ''}\n`
      : `${ind}- p.${n.p ?? '?'} ${n.title}\n`;
    render(n.id, depth + 1);
  }
};
render('root', 0);
md += `\n## 대조\n${edges.map((e) => `- ${e.pair.join(' ↔ ')} — ${e.axis}`).join('\n')}\n`;
await writeFile(resolve(__dir, `runs/${out.label}.md`), md);
console.log(`✓ ${out.label} — 노드 ${nodes.length} · 대조 ${edges.length} · 1콜 ${sec}초 · in ${prompt.length}자/out ${raw.length}자`);
console.log(`  → runs/${out.label}.json / .md`);
