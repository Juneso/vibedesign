// 알라딘 OpenAPI 어댑터. Vite dev 플러그인(aladinPlugin)이 /api/aladin/* 를 프록시.
// 빌드 환경(프로덕션)에서는 별도 서버 함수 필요 — MVP-0 범위 외.

function parseToc(htmlStr) {
  if (!htmlStr) return [];
  return htmlStr
    .split(/<br\s*\/?>/i)
    .map(s => s.replace(/<[^>]*>/g, '').trim())
    .filter(Boolean)
    .slice(0, 30);
}

function mapItem(it) {
  const isbn = it.isbn13 || it.isbn || '';
  const tocRaw = it.subInfo?.toc || it.bookinfo?.toc || '';
  const story = it.subInfo?.story || it.bookinfo?.story || '';
  return {
    id: isbn ? `isbn_${isbn}` : `aladin_${it.itemId}`,
    isbn13: isbn,
    title: it.title,
    author: it.author,
    cover: it.cover,
    summary: it.fullDescription || story || it.description || '',
    toc: parseToc(tocRaw),
  };
}

export async function searchBooks(query) {
  const q = (query ?? '').trim();
  if (!q) return [];
  const r = await fetch(`/api/aladin/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error(`aladin search ${r.status}`);
  const data = await r.json();
  return (data.item || []).map(mapItem);
}

export async function getBookDetail(isbn13) {
  if (!isbn13) return null;
  const r = await fetch(`/api/aladin/lookup?id=${encodeURIComponent(isbn13)}`);
  if (!r.ok) throw new Error(`aladin lookup ${r.status}`);
  const data = await r.json();
  const it = data.item?.[0];
  return it ? mapItem(it) : null;
}
