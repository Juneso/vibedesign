// 0504 2 — Google Books API 클라이언트
// 키 없이 호출 가능한 공개 엔드포인트 사용.
// 응답 구조: https://developers.google.com/books/docs/v1/reference/volumes

const BASE = 'https://www.googleapis.com/books/v1/volumes';

// 한 번 받아온 검색 결과 캐시 (같은 쿼리 재요청 방지)
const cache = new Map();

export async function searchBooks(query, { langRestrict = 'ko', maxResults = 20 } = {}) {
  const q = (query || '').trim();
  if (!q) return [];
  const cacheKey = `${q}|${langRestrict}|${maxResults}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const url = `${BASE}?q=${encodeURIComponent(q)}&maxResults=${maxResults}&langRestrict=${langRestrict}&printType=books`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Books API ${res.status}`);
  const data = await res.json();
  const items = (data.items || []).map(normalize).filter((b) => b.title);
  cache.set(cacheKey, items);
  return items;
}

function normalize(item) {
  const v = item.volumeInfo || {};
  // imageLinks에서 https 강제 + zoom 1로 더 큰 표지
  let cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || '';
  if (cover) cover = cover.replace(/^http:/, 'https:').replace(/&zoom=\d+/, '&zoom=1');
  return {
    id: item.id,                     // Google Books volume ID — 그대로 사용
    title: v.title || '',
    subtitle: v.subtitle || '',
    authors: v.authors || [],
    cover,
    publisher: v.publisher || '',
    publishedDate: v.publishedDate || '',
    pageCount: v.pageCount || 0,
    description: v.description || '',
    categories: v.categories || [],
    language: v.language || '',
    previewLink: v.previewLink || '',
  };
}
