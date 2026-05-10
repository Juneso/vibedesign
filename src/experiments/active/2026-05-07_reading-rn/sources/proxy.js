// /api/book-search 프록시를 호출하는 fetch 헬퍼.
// dev에서는 Vite 외부에 함수 서버가 없을 수 있으므로, 호출이 실패하면 호출자에게 그대로 throw —
// 카카오/알라딘은 키 노출 불가라 클라이언트 직접 호출하지 않는다(보안).
// Google은 키 없이 동작하므로 fallback으로 클라이언트 직접 호출.

const PROXY_URL = '/api/book-search';

export async function callProxy(q, source = 'all') {
  const url = `${PROXY_URL}?q=${encodeURIComponent(q)}&source=${source}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`proxy ${r.status}`);
  const data = await r.json();
  return data.sources || {};
}
