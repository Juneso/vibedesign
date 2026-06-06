// 0606 — Open Library API 클라이언트 (키 없음, 무료)
// https://openlibrary.org/dev/docs/api
const BASE = 'https://openlibrary.org/search.json';
const COVER = 'https://covers.openlibrary.org/b/id';

const cache = new Map();

export async function searchBooks(query, { limit = 20 } = {}) {
  const q = (query || '').trim();
  if (!q) return [];
  const cacheKey = `${q}|${limit}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const fields = 'key,title,author_name,cover_i,publisher,first_publish_year,number_of_pages_median';
  const url = `${BASE}?q=${encodeURIComponent(q)}&limit=${limit}&fields=${fields}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Library ${res.status}`);
  const data = await res.json();
  const items = (data.docs || []).map(normalize).filter(b => b.title);
  cache.set(cacheKey, items);
  return items;
}

function normalize(doc) {
  const cover = doc.cover_i ? `${COVER}/${doc.cover_i}-M.jpg` : '';
  return {
    id: (doc.key || '').replace('/works/', '') || ('ol_' + Math.random().toString(36).slice(2, 8)),
    title: doc.title || '',
    authors: doc.author_name || [],
    cover,
    publisher: (doc.publisher || [])[0] || '',
    publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : '',
    pageCount: doc.number_of_pages_median || 0,
  };
}
