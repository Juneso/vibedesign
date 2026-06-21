// 8권 각각을 "책별 마인드맵"(중심 → 테마 갈래 → 키워드 잎)으로 생성.
// 수집 문장(메모) + 책 메타데이터를 LLM(gpt-4o)에 주고 잘 정리된 마인드맵 구조를 받는다.
//
// 사용: node eval/buildMindmaps.mjs
// 결과: lib/mindmaps.json  { books:[ {id,title,author,center,branches:[{name,color,leaves[]}]} ] }

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { setLLMTransport, SYSTEM_RULES } from '../lib/llm.js';
import { openaiNodeTransport, loadDotEnvLocal } from './lib/transport.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const VAULT = '/Users/junseo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Junseo/200 Literature/210 Books';
await loadDotEnvLocal(__dirname);
const MODEL = process.env.EVAL_MODEL || 'gpt-4o';
const transport = openaiNodeTransport({});
setLLMTransport((args) => transport({ ...args, model: args.model || MODEL }));

const PALETTE = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#6366f1','#ec4899','#14b8a6'];

const seed = JSON.parse(await readFile(resolve(ROOT, 'golden/seed-v1.json'), 'utf-8'));

// 옵시디언 자유형 노트 → 메모 텍스트 배열 (페이지 번호 마커 분할)
function parseObs(raw) {
  const lines = raw.split(/\r?\n/);
  const memos = []; let cur = null;
  const pm = /^\s*(\d{1,4})\s*\.\s*(.*)$/;
  for (const line of lines) {
    const m = line.match(pm);
    if (m && (m[2].trim() === '' || m[2].length < 60)) { if (cur && cur.trim()) memos.push(cur); cur = m[2].trim() ? m[2].trim()+'\n' : ''; }
    else if (cur != null) cur += line + '\n';
  }
  if (cur && cur.trim()) memos.push(cur);
  return memos.map(t => t.replace(/\n{3,}/g,'\n\n').trim()).filter(t => t.length >= 30).sort((a,b)=>b.length-a.length).slice(0,16).map(t=>t.slice(0,900));
}

// 8권 정의 (메모 소스)
const seedBooks = seed.books.map(b => ({
  id: b.id, title: b.title, author: b.author, summary: b.summary || '', toc: b.toc || [],
  memos: seed.memos.filter(m => m.bookId === b.id).map(m => (m.myThought ? `${m.quote}  [내 생각: ${m.myThought}]` : m.quote)),
}));
const designFiles = [
  { file: '디자인과 인간 심리_210221_163647.md', title: '디자인과 인간 심리', author: '도널드 노먼' },
  { file: '디자인 미학_201207_200248.md', title: '디자인 미학', author: '글렌 파슨스' },
  { file: '욕망의 사물, 디자인의 사회사_210325_162228.md', title: '욕망의 사물, 디자인의 사회사', author: '에이드리언 포티' },
  { file: '미래세상의 디자인_230422_140830.md', title: '미래세상의 디자인', author: '도널드 노먼' },
];
const designBooks = [];
for (const d of designFiles) {
  const raw = await readFile(resolve(VAULT, d.file), 'utf-8');
  designBooks.push({ id: 'obs-'+d.file.split('_')[0], title: d.title, author: d.author, summary: '', toc: [], memos: parseObs(raw) });
}
const BOOKS = [...seedBooks, ...designBooks];

function prompt(b) {
  return `책 "${b.title}" (저자: ${b.author})의 독서 메모를 바탕으로 잘 정리된 **마인드맵**을 만든다.

[책 소개]
${b.summary || '(없음)'}
[목차]
${(b.toc||[]).join(' / ') || '(없음)'}
[수집한 문장/메모]
${b.memos.map((m,i)=>`${i+1}. ${m}`).join('\n')}

[작업]
이 책의 핵심을 한눈에 보는 마인드맵 구조를 만든다.
- 5~7개의 "테마 갈래(branch)"로 나눈다. 갈래 이름은 짧은 명사구 (목차·메모에서 실제로 도출).
- 각 갈래마다 2~4개의 "키워드 잎(leaf)". 잎은 그 갈래의 구체 개념/주장 (짧은 명사구, 메모 근거).
- 메모에 사용자의 [내 생각]이 있으면 그 관점도 잎에 반영.
- 책 홍보문구 반복 금지. 메모에 없는 내용 지어내기 금지. 모두 한국어.

[출력] JSON만. 설명 금지.
{"branches":[{"name":"테마 갈래명","leaves":["키워드1","키워드2"]}]}`;
}

const out = { books: [] };
for (const b of BOOKS) {
  console.log(`[${b.title}] 마인드맵 생성 중... (메모 ${b.memos.length})`);
  const raw = await transport({ system: SYSTEM_RULES, user: prompt(b), temperature: 0.4, model: MODEL });
  let parsed;
  try { parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}')+1)); }
  catch { console.error('  파싱 실패:', raw.slice(0,200)); continue; }
  const branches = (parsed.branches||[]).slice(0,7).map((br,i)=>({ name:br.name, color:PALETTE[i%PALETTE.length], leaves:(br.leaves||[]).slice(0,4) }));
  out.books.push({ id:b.id, title:b.title, author:b.author, center:{name:b.title, sub:b.author}, branches });
  console.log(`  → ${branches.length}갈래 / ${branches.reduce((s,x)=>s+x.leaves.length,0)}잎`);
}

await writeFile(resolve(ROOT, '../lib/mindmaps.json'), JSON.stringify(out, null, 2), 'utf-8');
console.log(`✓ 저장: lib/mindmaps.json (${out.books.length}권)`);
