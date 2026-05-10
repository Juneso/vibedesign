// 알라딘 ItemSearch (검색) + ItemLookUp (상세) — Vercel function 프록시 경유.
import { callProxy } from './proxy.js';
import { normalizeIsbn } from './isbn.js';

export const aladinSource = {
  name: 'aladin',
  async search(query) {
    const q = (query || '').trim();
    if (!q) return [];
    const sources = await callProxy(q, 'aladin').catch(() => ({}));
    const list = sources.aladin;
    if (!Array.isArray(list)) return [];
    return list.map((b) => ({ ...b, isbn13: normalizeIsbn(b.isbn13) }));
  },
};

// 책 추가 직후 1회 호출해 itemPage·subTitle·originalTitle 등 보강.
export async function fetchAladinDetail(itemId) {
  if (!itemId) return null;
  try {
    const r = await fetch(`/api/book-detail?source=aladin&itemId=${encodeURIComponent(itemId)}`);
    if (!r.ok) return null;
    const d = await r.json();
    return { ...d, isbn13: normalizeIsbn(d.isbn13) };
  } catch { return null; }
}
