// Vercel Serverless Function — 책 검색 키 프록시
// 클라이언트가 카카오/알라딘 REST 키를 직접 노출하지 않도록 서버에서 호출.
// 환경변수: KAKAO_REST_KEY (필수, 없으면 Google Books로 폴백)
//          ALADIN_TTB_KEY (선택, 승인 후 추가)
//
// GET /api/book-search?q=<query>&source=<kakao|aladin|google|all>

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'public, max-age=86400'); // 1일 edge cache
  res.end(JSON.stringify(body));
};

const fetchKakao = async (q) => {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) return null;
  const url = `https://dapi.kakao.com/v3/search/book?query=${encodeURIComponent(q)}&size=20`;
  const r = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!r.ok) throw new Error(`kakao ${r.status}`);
  const data = await r.json();
  return (data.documents || []).map((d) => ({
    isbn13: pickIsbn13(d.isbn),
    title: d.title,
    authors: d.authors || [],
    coverUrl: d.thumbnail || '',
    pageCount: undefined,            // 카카오는 페이지수 미제공
    publisher: d.publisher || '',
    publishedDate: (d.datetime || '').slice(0, 10),
    source: 'kakao',
    raw: { contents: d.contents, price: d.price, sale_price: d.sale_price, url: d.url },
  })).filter((b) => b.title);
};

// 알라딘 cover URL 사이즈 변환
// 원본: https://image.aladin.co.kr/product/31424/4/cover200/k482832219_1.jpg
//   → cover500 (디테일용 권장)
const upgradeCoverSize = (url) => url ? url.replace(/\/cover200\//, '/cover500/') : '';
//   → letslook _f (실물사진 — 일부 책에만 존재, 클라이언트에서 onError 폴백)
const toLetslookFront = (url) => {
  if (!url) return '';
  const m = url.match(/\/product\/(\d+)\/(\d+)\/cover\d+\/([a-zA-Z0-9]+)_1\.(jpg|png)/);
  if (!m) return '';
  return `https://image.aladin.co.kr/product/${m[1]}/${m[2]}/letslook/${m[3]}_f.${m[4]}`;
};

const fetchAladin = async (q) => {
  const key = process.env.ALADIN_TTB_KEY;
  if (!key) return null;
  // ItemSearch — 페이지수 등 subInfo는 ItemLookUp에서만 옴. 검색 단계는 기본 정보만.
  const url = `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${key}&Query=${encodeURIComponent(q)}&QueryType=Keyword&MaxResults=20&start=1&SearchTarget=Book&output=js&Version=20131101`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`aladin ${r.status}`);
  const data = await r.json();
  return (data.item || []).map((d) => {
    const cover500 = upgradeCoverSize(d.cover);
    return {
      isbn13: d.isbn13 || d.isbn || '',
      title: d.title || '',
      authors: (d.author || '').split(',').map((s) => s.trim()).filter(Boolean),
      coverUrl: cover500 || d.cover || '',
      coverUrlHi: toLetslookFront(d.cover) || '',  // 실물사진. 404 가능 — 클라가 폴백
      pageCount: d.subInfo?.itemPage || undefined,
      publisher: d.publisher || '',
      publishedDate: d.pubDate || '',
      categoryName: d.categoryName || '',
      itemId: d.itemId || null,                    // ItemLookUp 추가 호출용
      source: 'aladin',
    };
  }).filter((b) => b.title);
};

const fetchGoogle = async (q) => {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20&langRestrict=ko&printType=books`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`google ${r.status}`);
  const data = await r.json();
  return (data.items || []).map((it) => {
    const v = it.volumeInfo || {};
    let cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || '';
    if (cover) cover = cover.replace(/^http:/, 'https:').replace(/&zoom=\d+/, '&zoom=1');
    const isbn = (v.industryIdentifiers || []).find((i) => i.type === 'ISBN_13')?.identifier || '';
    return {
      isbn13: isbn,
      title: v.title || '',
      authors: v.authors || [],
      coverUrl: cover,
      pageCount: v.pageCount || undefined,
      publisher: v.publisher || '',
      publishedDate: v.publishedDate || '',
      source: 'google',
    };
  }).filter((b) => b.title);
};

const pickIsbn13 = (raw) => {
  if (!raw) return '';
  // 카카오는 "ISBN10 ISBN13" 형식
  const parts = String(raw).split(/\s+/).filter(Boolean);
  return parts.find((p) => p.length === 13) || parts[0] || '';
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.setHeader('access-control-allow-origin', '*'); res.end(); return; }
  const q = (req.query?.q || '').trim();
  const src = (req.query?.source || 'all').toLowerCase();
  if (!q) return json(res, 400, { error: 'missing q' });

  try {
    const tasks = [];
    if (src === 'kakao' || src === 'all') tasks.push(['kakao', fetchKakao(q)]);
    if (src === 'aladin' || src === 'all') tasks.push(['aladin', fetchAladin(q)]);
    if (src === 'google' || src === 'all') tasks.push(['google', fetchGoogle(q)]);

    const results = await Promise.allSettled(tasks.map(([, p]) => p));
    const out = {};
    tasks.forEach(([name], i) => {
      const r = results[i];
      out[name] = r.status === 'fulfilled' ? (r.value || null) : { error: String(r.reason?.message || r.reason) };
    });
    return json(res, 200, { q, sources: out });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
}
