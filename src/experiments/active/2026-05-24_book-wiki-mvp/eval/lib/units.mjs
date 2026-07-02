// 위키 캐시(golden/ingest-cache.json, more-books-cache.json)에서
// 연결의 단위(unit = 수집 문장 1개: book/concept/quote/thesis)를 추출한다.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const BOOK_NAME = {
  isbn_9788937833663: '돈으로 살 수 없는 것들',
  isbn_9788932909349: '그리스인 조르바',
  isbn_9788952225122: '디자인의 디자인',
  isbn_9788937473562: '무의미의 축제',
};

function memosFromBody(body) {
  const memos = [];
  let curQuote = null;
  for (const line of body.split(/\r?\n/)) {
    const q = line.match(/^>\s*(?:\[[^\]]*\])?\s*(.+?)\s*(?:\[\^memo:[^\]]*\])?\s*$/);
    const t = line.match(/^>\s*—\s*논지:\s*(.+)$/);
    if (t) { memos.push({ quote: (curQuote || '').replace(/^"|"$|\.\.\.$/g, '').trim(), thesis: t[1].trim() }); curQuote = null; }
    else if (q && !line.includes('논지:')) { curQuote = q[1]; }
  }
  return memos.filter(m => m.quote || m.thesis);
}

export async function loadUnits(dir, files = ['golden/ingest-cache.json', 'golden/more-books-cache.json']) {
  const units = [];
  const perBook = {};
  for (const file of files) {
    let cache;
    try { cache = JSON.parse(await readFile(resolve(dir, file), 'utf-8')); } catch { continue; }
    for (const [id, b] of Object.entries(cache.books)) {
      const bookName = b.title || BOOK_NAME[id] || id;
      perBook[bookName] = (perBook[bookName] || 0);
      for (const p of (b.pages || [])) {
        for (const m of memosFromBody(p.body || '')) {
          units.push({ id: units.length, book: bookName, concept: p.title, quote: m.quote, thesis: m.thesis });
          perBook[bookName]++;
        }
      }
    }
  }
  return { units, perBook };
}
