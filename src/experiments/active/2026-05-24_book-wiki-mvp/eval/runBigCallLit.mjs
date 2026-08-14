// 문학 빅콜 실험 (BKT-380 0811) — 비문학 빅콜("판단은 모델, 검증은 코드")의 문학판.
// 기존 literature-v1(gpt-4o 2콜 + 임베딩 배정) 대신 소네트 1콜에 메모 전체 +
// 알라딘 리치데이터 + 정본 모티프 앵커를 주고 모티프 트리를 통째로 받는다.
// 원칙은 lib/litEngine.mjs 의 것을 프롬프트로 이관:
//  · 1차 축 = 모티프(반복 심상·주제), 이름은 책 고유 표현 우선 (백과사전식 일반명사 금지)
//  · 문장 잎은 페이지순 — 소설에선 페이지 순서가 곧 서사 진행
//  · 화자·정서·resonance 는 잎의 속성. 줄거리 추론 금지(근거는 메모 문면+리치데이터뿐)
//  · 억지 편입 금지 — 안 맞는 메모는 뿌리 직속
//  · 정본 앵커는 어휘 참고용 — 메모에 근거 있는 축만
//
// 사용: [BOOK=그리스인 조르바] [MODEL=claude-sonnet-5] node runBigCallLit.mjs <라벨>

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { claudeCliTransport } from './lib/claudeCliTransport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const N = (s) => String(s || '').normalize('NFC');
const nrmT = (s) => N(s).trim();
const label = process.argv[2] || '1';
const title = nrmT(process.env.BOOK || '그리스인 조르바');

const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
let book = ds.books.find((b) => nrmT(b.title) === title);
if (!book) {
  const extra = JSON.parse(await readFile(resolve(__dir, 'golden/extra-lit-memos.json'), 'utf-8'));
  book = extra.books.find((b) => nrmT(b.title) === title);
}
if (!book) { console.error(`책을 못 찾음: ${title}`); process.exit(1); }
const memoId = (i) => `ds-b50-${title}-${i}`;

// 알라딘 리치데이터 + 정본 모티프 앵커 — runLitV1 과 같은 소스
let rich = '';
try {
  const meta = JSON.parse(await readFile(resolve(__dir, 'golden/aladin-lit-meta.json'), 'utf-8'));
  const m = meta[title];
  if (m) rich = [m.summary, m.aladin?.intro, m.aladin?.publisherIntro, m.aladin?.excerpts].filter(Boolean).join('\n').slice(0, 3000);
} catch {}
let canon = null;
try {
  const c = JSON.parse(await readFile(resolve(__dir, 'golden/lit-canon-motifs.json'), 'utf-8'));
  canon = c.books?.[title] || null;
} catch {}

const memoLines = book.memos.map((m, i) => {
  const my = m.myThought || m.my;
  return `[${memoId(i)}] (p.${m.p ?? m.page ?? '?'}) ${N(m.text).replace(/\s+/g, ' ')}${my ? `\n  (내 생각: ${N(my)})` : ''}`;
}).join('\n');

const canonBlock = canon ? `
## 참고 — 이 책에 대한 일반적 해석의 축 (앵커)
${(canon.themes || []).map((t) => `- ${t.name}: ${t.desc || ''}`).join('\n')}
${(canon.symbols || []).length ? `반복 심상: ${canon.symbols.join(' · ')}` : ''}
⚠ 위 축은 어휘·경계 참고용일 뿐이다. **메모에 실제 근거가 있는 축만** 세우고, 메모가 다루지 않는 축은 무시하라. 메모가 위 축과 다른 고유한 축을 이루면 그쪽을 우선하라.
` : '';

const prompt = `너는 소설 독서 메모를 정리하는 문학 편집자다. 아래는 『${title}』${book.author ? ` (${book.author})` : ''}에서 독자가 밑줄 그은 메모 전체다. 이것을 모티프 트리로 정리하라.

책의 줄거리를 아는 척 추론하지 마라 — 판단 근거는 오직 메모 문면과 아래 책 소개뿐이다.

${rich ? `## 책 소개·리치데이터 (유일하게 허용된 책 배경 근거)\n${rich}\n` : ''}## 독자가 밑줄 그은 메모
${memoLines}
${canonBlock}
## 정리 원칙
1. 1차 축은 모티프다 — 이 메모들을 관통하며 **반복되는** 심상·주제 3~6개를 세우고, 각 메모를 가장 맞는 모티프 밑에 문장 잎으로 배치한다. 문장 잎은 memoId 만 쓴다 — 메모 원문을 다시 출력하지 마라(원문은 memoId 로 복원된다).
2. 모티프 이름은 **메모에 실제로 등장하는 책 고유의 심상·표현을 우선** 사용하라 (예: "내면의 갈등" 대신 "두 세계"). 어느 책에나 붙일 수 있는 일반명사 이름은 실패다. gloss 에 이 모티프가 메모들 속에서 어떻게 나타나는지 1~2문장.
3. 각 모티프에 중요도 score(0~1) — 걸린 메모 수, 책 소개에서의 비중.
4. 모티프 밑 문장 잎은 **페이지 오름차순**으로 배열하라 — 소설에선 페이지 순서가 곧 서사 진행이라 변화 아크가 드러난다.
5. 문장 잎마다 속성을 붙인다:
   - speaker: 인물 이름(메모 문면의 호칭·대화 구조로 특정 가능할 때) / "서술자"(지문·내면 서술) / "미상"(따옴표 대사인데 단서가 전혀 없을 때만 — 최후 수단). 문면 단서 없이 줄거리 지식으로 귀속 금지.
   - emotion: 정서 톤 한 단어 (예: 불안, 해방감, 그리움, 냉소)
   - resonance: 독자가 왜 이 문장에 밑줄 그었을지 한 줄 가설 — 반드시 문면에서 읽히는 것만. (내 생각) 메모가 있으면 그것이 최우선 근거다.
6. 한 인물에 문장이 몰리면(인물이 곧 책인 경우) 그 인물을 모티프와 나란히 상위 축으로 승격해도 된다 (kind: "concept", 인물 이름).
7. 억지 편입 금지 — 어느 모티프에도 안 맞는 메모는 뿌리 직속에 문장 잎으로 남긴다. 억지로 끼워 넣는 것보다 낫다.
8. 저자가 명시적으로 대비시키는 두 축이 있으면 contrasts 에 담는다. 쌍의 양변은 트리에 실제로 쓴 표현 그대로.

## 출력 (JSON만, 다른 텍스트 금지)
{"tree":[{"title":"모티프","kind":"concept","score":0.9,"gloss":"…","children":[{"kind":"sentence","memoId":"ds-…","speaker":"서술자","emotion":"해방감","resonance":"…"}]}],"contrasts":[{"pair":["A","B"],"axis":"대조 축 설명"}]}
tree 는 뿌리 직속 노드의 배열이다. concept 는 children 을 가질 수 있고 sentence 는 잎이다.`;

let usage = null;
const llm = claudeCliTransport({ model: process.env.MODEL || 'claude-sonnet-5', timeoutMs: 480000, onUsage: (u) => { usage = u; } });
const t0 = Date.now();
const raw = await llm({ user: prompt });
const sec = Math.round((Date.now() - t0) / 100) / 10;
const parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || ['{}'])[0]);

// 룰 파이프라인과 같은 run 포맷(tree.nodes/edges)으로 변환.
// 잎은 memoId 만 오므로 원문·페이지를 여기서 복원한다 — 출력 토큰 절감(0811).
const memoById = new Map(book.memos.map((m, i) => [memoId(i), m]));
let seq = 0;
const id = () => `n${++seq}`;
const nodes = [];
const root = { id: 'root', title, parentId: null, level: 0, kind: 'root', sources: [] };
nodes.push(root);
const walk = (arr, parent) => {
  for (const x of arr || []) {
    const src = x.memoId ? memoById.get(x.memoId) : null;
    const n = {
      id: id(), parentId: parent.id, level: parent.level + 1, kind: x.kind === 'sentence' ? 'sentence' : 'concept',
      title: N(x.title || (src ? src.text : '')).replace(/\s+/g, ' ').trim(), gloss: N(x.gloss || x.resonance || ''),
      sources: [], memoId: x.memoId || null, p: x.p ?? (src ? (src.p ?? src.page ?? null) : null),
      score: typeof x.score === 'number' ? x.score : undefined,
      speaker: x.speaker || undefined, emotion: x.emotion || undefined,
    };
    nodes.push(n);
    if (x.children) walk(x.children, n);
  }
};
walk(parsed.tree, root);
const edges = (parsed.contrasts || []).map((c) => ({ type: '대조', pair: c.pair || [], axis: c.axis || '', a: null, b: null }));

const out = {
  label: `lit-bigcall-${label}`, runAt: new Date().toISOString(), kind: 'lit-bigcall', book: title,
  provider: 'claude-bigcall', model: process.env.MODEL || 'claude-sonnet-5', nMemos: book.memos.length,
  llmCalls: 1, sec, promptChars: prompt.length, rawChars: raw.length, usage,
  tree: { rootId: 'root', nodes, edges }, log: [`[bigcall-lit] 1콜 ${sec}초 · 입력 ${prompt.length}자 · 출력 ${raw.length}자`],
};
await writeFile(resolve(__dir, `runs/${out.label}.json`), JSON.stringify(out, null, 2));

let md = `# ${out.label} — 『${title}』 소네트 문학 빅콜\n\n> ${out.runAt} · ${out.model} · 1콜 · ${sec}초\n\n## 트리\n\n`;
const render = (nid, depth) => {
  for (const n of nodes.filter((x) => x.parentId === nid)) {
    const ind = '  '.repeat(depth);
    md += n.kind === 'concept'
      ? `${ind}- **${n.title}**${typeof n.score === 'number' ? ` (${n.score})` : ''}${n.gloss ? ` — ${n.gloss}` : ''}\n`
      : `${ind}- p.${n.p ?? '?'} [${n.speaker || '?'}·${n.emotion || '?'}] ${n.title}${n.gloss ? `\n${ind}  · ${n.gloss}` : ''}\n`;
    render(n.id, depth + 1);
  }
};
render('root', 0);
md += `\n## 대조\n${edges.map((e) => `- ${e.pair.join(' ↔ ')} — ${e.axis}`).join('\n') || '(없음)'}\n`;
await writeFile(resolve(__dir, `runs/${out.label}.md`), md);
console.log(`✓ ${out.label} [${title}] — 노드 ${nodes.length} · 대조 ${edges.length} · 1콜 ${sec}초 · $${usage?.costUsd ?? '?'}`);
console.log(`  → runs/${out.label}.json / .md`);
