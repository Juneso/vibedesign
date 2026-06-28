// 알라딘 TTB API 어댑터 — Vite dev: aladinPlugin이 /api/aladin/* 프록시
// 프로덕션: api/book-search.js (Vercel serverless)
const cache = new Map();

export async function searchBooks(query, { limit = 20 } = {}) {
  const q = (query || '').trim();
  if (!q) return [];
  const cacheKey = `${q}|${limit}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const res = await fetch(`/api/aladin/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`aladin search ${res.status}`);
  const data = await res.json();
  const items = (data.item || []).slice(0, limit).map(normalize);
  cache.set(cacheKey, items);
  return items;
}

function normalize(it) {
  const isbn = it.isbn13 || it.isbn || '';
  return {
    id: isbn ? `isbn_${isbn}` : `aladin_${it.itemId}`,
    title: it.title || '',
    authors: it.author ? it.author.split(',').map(s => s.trim()).filter(Boolean) : [],
    cover: it.cover || '',
    publisher: it.publisher || '',
    publishedDate: it.pubDate || '',
    pageCount: 0,
  };
}
