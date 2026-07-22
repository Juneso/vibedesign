// 인제스트 캐시(golden/obsidian-50-cache.json) → eval 대시보드 run 한 쌍으로 내보내기.
// 대시보드는 runs/*.json 을 목록에 띄우고, 동반 *.md 가 있으면 GenericDetail 로 렌더한다.
// 사용: node eval/exportIngestRun.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const CACHE = resolve(ROOT, 'golden/obsidian-50-cache.json');
const OUT_BASE = resolve(ROOT, 'runs/obsidian-ingest-10'); // 시리즈 obsidian-ingest, 이터레이션 10

const cache = JSON.parse(await readFile(CACHE, 'utf-8'));
const books = Object.values(cache.books);
const totalPages = books.reduce((n, b) => n + (b.pages?.length || 0), 0);

// run json — 요약 지표(대시보드 목록/후속 처리용)
const runJson = {
  kind: 'ingest',
  source: '옵시디언 200 Literature/210 Books',
  genModel: 'gpt-4o',
  nBooks: books.length,
  nPages: totalPages,
  books: books.map((b) => ({ title: b.title, pages: b.pages.length })),
};
await writeFile(`${OUT_BASE}.json`, JSON.stringify(runJson, null, 2) + '\n', 'utf-8');

// 읽기용 md — RunBrowser 의 경량 렌더러가 지원하는 패턴만 사용
const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
let md = `# 옵시디언 10권 인제스트\n\n`;
md += `- 소스: 옵시디언 \`200 Literature/210 Books\` (메모≥3 자동선정 상위 50 중 10권)\n`;
md += `- 모델: gpt-4o · planIngest\n`;
md += `- 결과: **${books.length}권 / ${totalPages}페이지**\n\n`;

md += `## 권별 요약\n\n`;
md += `| 책 | 페이지 |\n|---|---|\n`;
for (const b of books) md += `| ${esc(b.title)} | ${b.pages.length} |\n`;
md += `\n`;

for (const b of books) {
  md += `## ${b.title} — ${b.pages.length}p\n\n`;
  for (const p of b.pages) {
    const kc = (p.keyConcepts || []).length ? ` — \`${p.keyConcepts.join('` `')}\`` : '';
    md += `### ${esc(p.title)} (${esc(p.type)})${kc}\n\n`;
    if (p.body) md += `> ${esc(p.body).slice(0, 500)}\n\n`;
  }
}

await writeFile(`${OUT_BASE}.md`, md, 'utf-8');
console.log(`✓ runs/obsidian-ingest-10.json + .md 생성 (${books.length}권 / ${totalPages}p)`);
