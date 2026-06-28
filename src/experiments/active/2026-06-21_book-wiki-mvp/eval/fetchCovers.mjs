// 8권 표지 URL을 알라딘 API로 채워 lib/mindmaps.json 에 cover 필드 추가.
// 사용: node eval/fetchCovers.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadDotEnvLocal } from './lib/transport.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
await loadDotEnvLocal(__dirname);
const KEY = process.env.ALADIN_TTB_KEY;
if (!KEY) { console.error('ALADIN_TTB_KEY 없음'); process.exit(1); }

const seed = JSON.parse(await readFile(resolve(__dirname, 'golden/seed-v1.json'), 'utf-8'));
const seedCover = {}; for (const b of seed.books) seedCover[b.title] = b.cover || '';
const mmPath = resolve(__dirname, '../lib/mindmaps.json');
const mm = JSON.parse(await readFile(mmPath, 'utf-8'));

async function aladinJSON(url) {
  const r = await fetch(url);
  let t = await r.text();
  t = t.replace(/;?\s*$/, '').trim();
  try { return JSON.parse(t); } catch { return null; }
}
async function byIsbn(isbn) {
  const u = `https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${KEY}&itemIdType=ISBN13&ItemId=${isbn}&output=js&Version=20131101&Cover=Big`;
  const j = await aladinJSON(u); return j?.item?.[0]?.cover || '';
}
async function byTitle(title) {
  const u = `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${KEY}&Query=${encodeURIComponent(title)}&QueryType=Title&MaxResults=1&SearchTarget=Book&output=js&Version=20131101&Cover=Big`;
  const j = await aladinJSON(u); return j?.item?.[0]?.cover || '';
}

for (const b of mm.books) {
  let cover = seedCover[b.title] || '';
  const isbn = (b.id.match(/isbn_(\d+)/) || [])[1];
  if (!cover && isbn) cover = await byIsbn(isbn);
  if (!cover) cover = await byTitle(b.title);
  b.cover = cover;
  console.log(`${b.title} → ${cover || '(못 찾음)'}`);
}
await writeFile(mmPath, JSON.stringify(mm, null, 2), 'utf-8');
console.log('✓ lib/mindmaps.json 표지 갱신');
