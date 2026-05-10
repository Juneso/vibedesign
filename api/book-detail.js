// Aladin ItemLookUp 프록시 — 검색 결과의 itemId로 풀 메타(itemPage, subTitle, originalTitle, authors 역할 등) 보강.
// GET /api/book-detail?source=aladin&itemId=<id>

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'public, max-age=2592000'); // 30일 — 책 메타는 거의 안 바뀜
  res.end(JSON.stringify(body));
};

const upgradeCoverSize = (url) => url ? url.replace(/\/cover200\//, '/cover500/') : '';

const toLetslookFront = (url) => {
  if (!url) return '';
  const m = url.match(/\/product\/(\d+)\/(\d+)\/cover\d+\/([a-zA-Z0-9]+)_1\.(jpg|png)/);
  if (!m) return '';
  return `https://image.aladin.co.kr/product/${m[1]}/${m[2]}/letslook/${m[3]}_f.${m[4]}`;
};

// 알라딘 author 문자열 파싱 — "유발 하라리 (지은이), 조현욱 (옮긴이)" → roles 분리
const parseAuthors = (raw) => {
  if (!raw) return { authors: [], translators: [], editors: [] };
  const parts = String(raw).split(/,\s*/);
  const authors = [], translators = [], editors = [];
  for (const p of parts) {
    const m = p.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (!m) { authors.push(p.trim()); continue; }
    const name = m[1].trim();
    const role = m[2].trim();
    if (/옮긴이|역자/.test(role)) translators.push(name);
    else if (/엮은이|편저|편역/.test(role)) editors.push(name);
    else authors.push(name);
  }
  return { authors, translators, editors };
};

const fetchAladinDetail = async (itemId) => {
  const key = process.env.ALADIN_TTB_KEY;
  if (!key) throw new Error('ALADIN_TTB_KEY not set');
  const opts = ['authors', 'subInfo', 'Toc', 'Story', 'categoryIdList', 'ratingInfo'].join(',');
  const url = `https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${key}&itemIdType=ItemId&ItemId=${encodeURIComponent(itemId)}&output=js&Version=20131101&OptResult=${opts}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`aladin lookup ${r.status}`);
  const data = await r.json();
  const d = (data.item || [])[0];
  if (!d) return null;

  const sub = d.subInfo || {};
  const authorParsed = parseAuthors(d.author);
  const cover500 = upgradeCoverSize(d.cover);

  return {
    itemId: d.itemId,
    isbn13: d.isbn13 || d.isbn || '',
    title: d.title || '',
    subTitle: sub.subTitle || '',
    originalTitle: sub.originalTitle || '',
    authors: authorParsed.authors,
    translators: authorParsed.translators,
    editors: authorParsed.editors,
    coverUrl: cover500 || d.cover || '',
    coverUrlHi: toLetslookFront(d.cover) || '',
    pageCount: sub.itemPage || undefined,
    publisher: d.publisher || '',
    publishedDate: d.pubDate || '',
    description: d.description || '',
    story: sub.story || '',                  // 저자 소개·출판사 책 소개 (긴 본문)
    toc: sub.toc || '',                      // 목차
    categoryName: d.categoryName || '',
    categoryIdList: d.categoryIdList || [],
    ratingScore: sub.ratingInfo?.ratingScore ?? null,
    ratingCount: sub.ratingInfo?.ratingCount ?? null,
    seriesName: d.seriesInfo?.seriesName || '',
    priceStandard: d.priceStandard || null,
    priceSales: d.priceSales || null,
    link: d.link || '',
    source: 'aladin',
  };
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.setHeader('access-control-allow-origin', '*'); res.end(); return; }
  const source = (req.query?.source || 'aladin').toLowerCase();
  const itemId = (req.query?.itemId || '').trim();
  if (!itemId) return json(res, 400, { error: 'missing itemId' });

  try {
    if (source === 'aladin') {
      const detail = await fetchAladinDetail(itemId);
      if (!detail) return json(res, 404, { error: 'not found' });
      return json(res, 200, detail);
    }
    return json(res, 400, { error: `unsupported source: ${source}` });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
}
