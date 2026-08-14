// 빅콜 3차 (BKT-380 0810) — 2차의 잔존 편차(블록을 세울지 86↔75)의 발생 지점 자체를 제거.
// 2차 대비 프롬프트 변경:
//  · 역할 블록(6·6-1) 삭제 → 메타 층으로 대체: 뿌리 thesis + 핵심 노드별 why
//    (블록이 하려던 "논증에서의 자리"를 트리 모양을 비틀지 않고 자연어로 실음)
//  · 통시 한 줄 추가 — 목차가 시간 순 전개면 최상위 갈래에 순서 번호 (V10 디스패치 흡수 실험)
//  · 대조축(5)·양변 자구 보존(8) 유지 — 트리가 못 표현하는 유일한 관계
//  · 인과·나머지 11종 전개 방식은 비도입 — 위계·문장이 이미 실어 나름. 채점 축으로만 감시
//
// 사용: [BOOK=피로사회|MEMOS_FILE=golden/adhoc-넥서스.json] [MODEL=claude-sonnet-5] node runBigCallV2.mjs <라벨>

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
5. 저자가 명시적으로 대비시키는 두 개념이 둘 다 중요하면 "A ↔ B" 대조축 노드(relation: "대조축")를 만들고 두 개념을 그 자식으로 둔다. 지엽적 대조는 문장에만 남긴다. 축 제목과 contrasts 의 양변은 메모 본문에 등장하는 가장 구체적인 개념 명사여야 한다 — 저자가 그것들을 묶어 부르는 범주어·역할어(예: "~장치", "~의 구성원")를 양변에 쓰지 마라. 범주어는 why 에서 설명하라. 대조 쌍마다 별도 축을 세우고, 여러 대조를 하나의 추상 주제 축으로 묶지 마라.
6. 역할 블록(배경·진단·처방 같은 묶음)은 만들지 마라 — 뿌리 직속은 항상 개념 키워드 또는 대조축이다. 책의 논증 구조는 블록이 아니라 아래 9의 thesis 와 why 로 표현한다.
6-1. 키워드 제목은 항상 단일 개념 명사다 — "A와 B", "A과 그 귀결" 같은 복합·주제문 제목을 만들지 마라. 두 개념이 긴밀해도 노드는 따로 세우고 위계로 잇는다.
6-2. 키워드 간 위계를 적극적으로 세워라 — 뿌리 직속에는 큰 맥 키워드(프레임)만 남기고, 그 상세 설명·하위 유형·귀결 개념 키워드는 큰 맥 밑에 중첩시켜라. 메모가 "X의 주민은 Y다", "Y는 X가 낳는다"처럼 말하면 Y는 X의 자식이다. 예: 사회 프레임 개념 밑에 그 사회가 낳는 주체 개념, 주체 밑에 그 주체의 행동 양상·병리 개념. 뿌리 직속 키워드의 평면 나열은 실패다. 대조축의 양변 개념 밑에도 하위 개념을 계속 중첩시켜라 — 축의 한 변이 책의 중심 개념이면 그 변은 큰 서브트리를 가져도 되고 가져야 한다. 변의 하위 개념(그 사회가 낳는 주체, 주체의 병리 등)을 뿌리로 승격시키지 마라. 축이 한쪽으로 깊어지는 것은 정상이다.
7. 한 메모에 서로 다른 개념 여럿이 있으면 각각 제 키워드 밑으로 흩어 배치한다 — 뭉뚱그리지 마라.
8. contrasts 에는 저자가 대비시키는 모든 쌍을 담되, 쌍의 양변은 트리의 키워드 제목 또는 본문에 실제로 쓰인 표현을 그대로 써라 — 새 표현으로 바꿔 쓰면 대조가 유실된다.
9. 메타 이해를 함께 실어라 — 이 트리를 읽는 독자가 "무엇이 있었나"만이 아니라 "왜 그렇게 짜였나"를 이해하도록. 단 why 는 트리를 다 짠 뒤에 붙이는 주석이다 — why 를 쓰기 좋게 하려고 개념을 합치거나, 제목을 주제문으로 바꾸거나, 노드 구성을 바꾸지 마라. 트리 구조는 1~8 만으로 결정된다.
   - thesis: 이 책 전체의 주장을 1~2문장으로. 트리 최상위 갈래들이 그 주장에 각각 어떻게 기여하는지가 드러나게 써라.
   - why: 뿌리 직속 노드와 모든 대조축 노드에, 그 개념/축이 저자의 논증에서 하는 역할을 1~2문장으로. 개념이 무엇인지 다시 요약하지 말고, 왜 이것이 이 책의 큰 축인지 — 어떤 질문에 답하는 자리인지, 어떤 주장을 떠받치는지 — 를 써라.
10. 목차의 장 제목이 시간 순(시대·연대기)으로 전개되는 책이면 최상위 갈래를 그 순서대로 배열하고, 시대를 다루는 갈래의 제목은 반드시 "1 · ", "2 · " 순서 번호로 시작하라 — 읽는 순서가 트리에 그대로 보여야 한다. 목차가 시간 순이 아니면 절대 번호를 붙이지 마라.

## 출력 전 자기 점검 (속으로 빠르게 — 점검 과정은 쓰지 말고 고친 결과만 출력)
출력 직전에 딱 두 가지만 확인하고 **빠진 것만** 채워라. 트리 구조를 다시 짜지 마라.
a. 책의 큰 대비(저자가 반복해서 맞세우는 쌍)가 contrasts 에 빠졌으면 추가. 한 문장에만 스치는 대조는 추가 금지.
b. 빠진 memoId 가 있으면 가장 맞는 키워드 밑에 추가.

## 출력 (JSON만, 다른 텍스트 금지)
{"thesis":"책 전체 주장 1~2문장","tree":[{"title":"키워드","kind":"concept","score":0.9,"relation":null,"why":"논증에서의 역할 (뿌리 직속·대조축만)","children":[{"title":"주장 문장","kind":"sentence","memoId":"ds-…","p":126}]}],"contrasts":[{"pair":["A","B"],"axis":"대조 축 설명"}]}
tree 는 뿌리 직속 노드의 배열이다. concept 는 children 을 가질 수 있고 sentence 는 잎이다.`;

let usage = null;
const llm = claudeCliTransport({ model: process.env.MODEL || 'claude-sonnet-5', timeoutMs: Number(process.env.TIMEOUT_MS) || 480000, onUsage: (u) => { usage = u; } });
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
      relation: x.relation || undefined, why: x.why ? N(x.why) : undefined,
    };
    nodes.push(n);
    if (x.children) walk(x.children, n);
  }
};
walk(parsed.tree, root);
const edges = (parsed.contrasts || []).map((c) => ({ type: '대조', pair: c.pair || [], axis: c.axis || '', a: null, b: null }));

const out = {
  label: `hier-bigcall3-${label}`, runAt: new Date().toISOString(), kind: 'hier-bigcall3',
  thesis: parsed.thesis ? N(parsed.thesis) : null,
  provider: 'claude-bigcall', model: process.env.MODEL || 'claude-sonnet-5', nMemos: book.memos.length,
  llmCalls: 1, sec, promptChars: prompt.length, rawChars: raw.length, usage,
  tree: { rootId: 'root', nodes, edges }, log: [`[bigcall] 1콜 ${sec}초 · 입력 ${prompt.length}자 · 출력 ${raw.length}자`],
};
await writeFile(resolve(__dir, `runs/${out.label}.json`), JSON.stringify(out, null, 2));

// 사람용 md
let md = `# ${out.label} — 소네트 빅콜 3차 (블록→메타 층)\n\n> ${out.runAt} · ${out.model} · 1콜 · ${sec}초\n\n`;
if (out.thesis) md += `## 테제\n\n${out.thesis}\n\n`;
md += `## 트리\n\n`;
const render = (nid, depth) => {
  for (const n of nodes.filter((x) => x.parentId === nid)) {
    const ind = '  '.repeat(depth);
    if (n.kind === 'concept') {
      md += `${ind}- **${n.title}**${typeof n.score === 'number' ? ` (${n.score})` : ''}${n.relation === '대조축' ? ' (대조축)' : ''}\n`;
      if (n.why) md += `${ind}  - _why: ${n.why}_\n`;
    } else {
      md += `${ind}- p.${n.p ?? '?'} ${n.title}\n`;
    }
    render(n.id, depth + 1);
  }
};
render('root', 0);
md += `\n## 대조\n${edges.map((e) => `- ${e.pair.join(' ↔ ')} — ${e.axis}`).join('\n')}\n`;
await writeFile(resolve(__dir, `runs/${out.label}.md`), md);
console.log(`✓ ${out.label} — 노드 ${nodes.length} · 대조 ${edges.length} · 1콜 ${sec}초 · in ${prompt.length}자/out ${raw.length}자`);
console.log(`  → runs/${out.label}.json / .md`);
