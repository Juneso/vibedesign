// 인제스트 캐시(golden/obsidian-50-cache.json) → eval 대시보드 run 으로 내보내기.
// 책 1권 = run 1개 (기존 'ingest V8 · 욕망의사물' 처럼 책별로 따로 열람).
// 파일명 obsidian-ingest-N.json → 시리즈는 obsidian-ingest 하나로 묶이고,
// 목록 행 이름은 run json 의 label(책 제목)이 쓰인다.
// 대시보드 GenericDetail 은 json.tree 가 있으면 자동으로 SVG 그래프를 렌더한다.
// 사용: node eval/exportIngestRun.mjs
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const CACHE = resolve(ROOT, 'golden/obsidian-50-cache.json');
const RUNS = resolve(ROOT, 'runs');
const PREFIX = 'obsidian-ingest-';

const cache = JSON.parse(await readFile(CACHE, 'utf-8'));
const books = Object.values(cache.books);

// 이전 실행분 정리 (권수가 줄어들 때 유령 run 이 남지 않도록)
for (const f of await readdir(RUNS)) {
  if (f.startsWith(PREFIX) && (f.endsWith('.json') || f.endsWith('.md'))) await unlink(resolve(RUNS, f));
}

const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();

let totalPages = 0;
for (const [i, b] of books.entries()) {
  const pages = b.pages || [];
  totalPages += pages.length;
  const base = resolve(RUNS, `${PREFIX}${i + 1}`);

  // 트리 — 이 책만: root(책) → 페이지. 본문은 gloss 로 실어 노드 클릭 상세에 나온다.
  const nodes = [{ id: 'root', title: b.title, parentId: null, level: 0, kind: 'root', sources: [] }];
  pages.forEach((p, pi) => {
    nodes.push({
      id: `p${pi}`, title: p.title, parentId: 'root', level: 1, kind: 'page', sources: [],
      gloss: [p.type ? `(${p.type})` : '', (p.keyConcepts || []).length ? `핵심개념: ${p.keyConcepts.join(', ')}` : '', p.body || '']
        .filter(Boolean).join('\n\n'),
    });
  });

  // label 을 첫 키로 — 목록 API 가 선두 1KB만 읽어 라벨을 뽑는다
  const runJson = {
    label: b.title,
    runAt: new Date().toISOString(),
    kind: 'ingest',
    source: '옵시디언 200 Literature/210 Books',
    genModel: 'gpt-4o',
    book: { title: b.title, author: b.author },
    nPages: pages.length,
    tree: { rootId: 'root', nodes },
  };
  await writeFile(`${base}.json`, JSON.stringify(runJson, null, 2) + '\n', 'utf-8');

  let md = `# ${b.title}\n\n`;
  md += `- 소스: 옵시디언 \`200 Literature/210 Books\` 실 발췌\n`;
  md += `- 모델: gpt-4o · planIngest (V8 Phase 1만 실행)\n`;
  md += `- 결과: **위키 페이지 ${pages.length}개**\n\n`;
  md += `## 페이지 목록\n\n| 페이지 | 유형 | 핵심개념 |\n|---|---|---|\n`;
  for (const p of pages) md += `| ${esc(p.title)} | ${esc(p.type)} | ${esc((p.keyConcepts || []).join(', '))} |\n`;
  md += `\n## 트리\n\n노드를 클릭하면 페이지 본문이 열린다.\n\n`;
  await writeFile(`${base}.md`, md, 'utf-8');
}

console.log(`✓ 책별 run ${books.length}개 생성 (${PREFIX}1 ~ ${PREFIX}${books.length}) · 총 ${totalPages}페이지`);
