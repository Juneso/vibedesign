// 카카오 책 검색 — Vercel function 프록시를 통해 호출 (키 노출 불가).
// 프록시 응답이 null이면 키 미설정 → 어댑터가 빈 결과 반환 (호출자가 다른 소스로 폴백 결정).
import { callProxy } from './proxy.js';
import { normalizeIsbn } from './isbn.js';

export const kakaoSource = {
  name: 'kakao',
  async search(query) {
    const q = (query || '').trim();
    if (!q) return [];
    const sources = await callProxy(q, 'kakao').catch(() => ({}));
    const list = sources.kakao;
    if (!Array.isArray(list)) return [];
    return list.map((b) => ({ ...b, isbn13: normalizeIsbn(b.isbn13) }));
  },
};
