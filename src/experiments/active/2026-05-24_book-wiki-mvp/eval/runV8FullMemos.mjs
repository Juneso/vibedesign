// V8 를 V9 와 같은 입력으로 돌리는 공정 비교 러너 (BKT-378)
//
// 기존 obsidian-hier-v8 는 볼트를 직접 파싱하며 MAX_MEMOS=14 로 잘라 넣었다.
// V9(hier-v9-*)는 golden/books50-memos.json 의 메모 전량을 쓴다. 메모 수가 다르면
// 노드 수 비교가 의미를 잃으므로, 여기서는 V8 에 V9 와 똑같은 메모를 넣는다.
//
// 사용: node eval/runV8FullMemos.mjs "존중받지 못하는 자들을 위한 정치학"
//        BOOKS="가,나" node eval/runV8FullMemos.mjs
// 결과: runs/hier-v8-full-{N}.json + .md  (시리즈 hier-v8-full)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { runHierIngest, serializeTree } from './lib/hierEngine.mjs';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dir);

// 볼트 파일명은 NFD, 데이터셋 제목은 NFC — 정규화 없이는 매칭이 0건이다
const N = (s) => String(s || '').normalize('NFC');

const MODEL = process.env.EVAL_MODEL || 'gpt-4o-mini';        // 위계(테마·critic)
const INGEST_MODEL = process.env.INGEST_MODEL || 'gpt-4o';    // planIngest
const KEY = process.env.OPENAI_API_KEY;
const llm = openaiNodeTransport({ model: MODEL });

const { planIngest, setLLMTransport } = await import('../lib/llm.js');
setLLMTransport(openaiNodeTransport({ model: INGEST_MODEL }));

async function embedFn(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || 'embed fail');
  return d.data[0].embedding;
}

const titles = (process.argv[2] ? [process.argv[2]] : (process.env.BOOKS || '').split(',').map((s) => s.trim()))
  .filter(Boolean);
if (!titles.length) { console.error('책 제목을 인자로 주세요'); process.exit(1); }

const ds = JSON.parse(await readFile(resolve(__dir, 'golden/books50-memos.json'), 'utf-8'));
const meta = JSON.parse(await readFile(resolve(__dir, 'golden/obsidian-books-meta.json'), 'utf-8'));

console.log(`[V8 공정비교] 위계 ${MODEL} · planIngest ${INGEST_MODEL}`);

let i = 0;
for (const t of titles) {
  const b = ds.books.find((x) => N(x.title) === N(t));
  if (!b) { console.log(`  ⚠ "${t}" — 데이터셋에 없음`); continue; }
  const m = Object.values(meta).find((x) => N(x.title) === N(t)) || {};

  // V9 와 완전히 같은 메모 집합 (자르지 않는다)
  const memos = b.memos.map((mm, k) => ({ id: `ds-${b.id}-${k}`, p: mm.p, text: mm.text, chapter: `p.${mm.p}`, myThought: '' }));
  const book = {
    title: N(b.title), author: m.author || '', category: m.category || '',
    toc: m.toc || [], summary: m.summary || '', aladin: m.aladin || {},
  };

  const t0 = Date.now();
  try {
    console.log(`  ${N(b.title)} — 메모 ${memos.length}개(V9 와 동일) · 리치데이터 ${Object.values(book.aladin).join('').length}자`);
    const r = await runHierIngest({
      book, memos, llm, embedFn, variant: 'v8', planIngestFn: planIngest,
      onProgress: (msg) => process.stdout.write(`      ${msg}\r`),
    });
    const tree = serializeTree(r.nodes, r.rootId);
    const sec = Math.round((Date.now() - t0) / 1000);

    const kids = (id) => tree.nodes.filter((n) => n.parentId === id);
    const L1 = tree.nodes.filter((n) => n.level === 1);
    const themes = L1.filter((n) => kids(n.id).length > 0).length;
    const orphans = L1.filter((n) => kids(n.id).length === 0).length;
    const deep = tree.nodes.filter((n) => n.level >= 2).length;

    const base = resolve(__dir, `runs/hier-v8-full-${++i}`);
    await writeFile(`${base}.json`, JSON.stringify({
      label: N(b.title), runAt: new Date().toISOString(),
      kind: 'hier-v8-full', variant: 'v8',
      note: 'V9 와 같은 메모 전량을 넣은 V8 — MAX_MEMOS 로 자르지 않았다',
      hierModel: MODEL, ingestModel: INGEST_MODEL,
      nMemos: memos.length, counts: { themes, orphans, deep }, sec,
      tree, log: r.log,
    }, null, 2) + '\n', 'utf-8');

    let md = `# ${N(b.title)} — V8 (메모 전량)\n\n`;
    md += `- 메모 ${memos.length}개 · 위계 ${MODEL} · planIngest ${INGEST_MODEL} · ${sec}초\n`;
    md += `- V9 와 같은 메모를 넣어 노드 수를 공정하게 비교하기 위한 런\n\n`;
    md += `## 구조\n\n| 지표 | 값 |\n|---|---|\n`;
    md += `| 테마(자식 있는 상위) | ${themes} |\n| 고아 키워드 | ${orphans} |\n| 하위 키워드 | ${deep} |\n| 전체 노드 | ${tree.nodes.length} |\n\n`;
    md += `## 트리\n\n말단 키워드는 설명이 문장별로 펼쳐진다.\n\n`;
    await writeFile(`${base}.md`, md, 'utf-8');

    console.log(`      → 테마 ${themes} · 고아 ${orphans} · 하위 ${deep} · 노드 ${tree.nodes.length} (${sec}초)`);
  } catch (e) {
    console.log(`      ✗ 실패: ${e.message}`);
  }
}
console.log(`\n✓ ${i}권 완료`);
