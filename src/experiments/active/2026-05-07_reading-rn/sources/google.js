// Google Books — 키 없이 클라이언트에서 직접 호출 가능. 카카오/알라딘이 미설정일 때 폴백 + 영어 ISBN 라우팅용.
import { normalizeIsbn } from './isbn.js';

const BASE = 'https://www.googleapis.com/books/v1/volumes';

export const googleSource = {
  name: 'google',
  async search(query) {
    const q = (query || '').trim();
    if (!q) return [];
    const url = `${BASE}?q=${encodeURIComponent(q)}&maxResults=20&langRestrict=ko&printType=books`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`google ${res.status}`);
    const data = await res.json();
    return (data.items || []).map((it) => {
      const v = it.volumeInfo || {};
      let cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || '';
      if (cover) cover = cover.replace(/^http:/, 'https:').replace(/&zoom=\d+/, '&zoom=1');
      const id = (v.industryIdentifiers || []).find((i) => i.type === 'ISBN_13')?.identifier || '';
      return {
        isbn13: normalizeIsbn(id),
        title: v.title || '',
        authors: v.authors || [],
        coverUrl: cover,
        pageCount: v.pageCount || undefined,
        publisher: v.publisher || '',
        publishedDate: v.publishedDate || '',
        source: 'google',
      };
    }).filter((b) => b.title);
  },
};
