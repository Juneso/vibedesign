// 멀티소스 검색 + 머지. 같은 isbn13(또는 title+author 폴백)으로 dedupe하고, 결손 필드를 우선순위에 따라 채움.
import { kakaoSource } from './kakao.js';
import { aladinSource } from './aladin.js';
import { googleSource } from './google.js';
import { SOURCE_PRIORITY } from './types.js';
import { titleAuthorKey } from './isbn.js';

const SOURCES = [aladinSource, kakaoSource, googleSource]; // priority 순 — 위가 우선

const cache = new Map();
const CACHE_KEY_PREFIX = 'rn-book-search-cache:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

const cacheGet = (q) => {
  const mem = cache.get(q);
  if (mem && Date.now() - mem.ts < CACHE_TTL_MS) return mem.data;
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + q);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    cache.set(q, parsed);
    return parsed.data;
  } catch { return null; }
};
const cacheSet = (q, data) => {
  const entry = { ts: Date.now(), data };
  cache.set(q, entry);
  try { localStorage.setItem(CACHE_KEY_PREFIX + q, JSON.stringify(entry)); } catch {}
};

const dedupeKey = (b) => b.isbn13 || `t:${titleAuthorKey(b)}`;

const sourceRank = (s) => {
  const i = SOURCE_PRIORITY.indexOf(s);
  return i < 0 ? 99 : i;
};

const mergeFields = (target, incoming) => {
  // target이 더 우선이지만 결손 필드는 incoming에서 채움
  const out = { ...target };
  for (const k of ['coverUrl', 'pageCount', 'publisher', 'publishedDate']) {
    if (out[k] == null || out[k] === '' || (k === 'pageCount' && !out[k])) {
      if (incoming[k] != null && incoming[k] !== '') out[k] = incoming[k];
    }
  }
  if ((!out.authors || out.authors.length === 0) && incoming.authors?.length) out.authors = incoming.authors;
  return out;
};

export async function searchBooks(query) {
  const q = (query || '').trim();
  if (!q) return [];
  const cached = cacheGet(q);
  if (cached) return cached;

  // 모든 소스를 병렬로 호출 — 실패한 소스는 무시
  const results = await Promise.allSettled(SOURCES.map((s) => s.search(q)));
  const all = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') all.push(...(r.value || []));
    else console.warn(`[book-search] ${SOURCES[i].name} failed:`, r.reason);
  });

  // dedupe + merge
  const map = new Map();
  for (const hit of all) {
    const key = dedupeKey(hit);
    const prev = map.get(key);
    if (!prev) { map.set(key, hit); continue; }
    // 더 우선 소스가 새로 들어왔는지 비교
    if (sourceRank(hit.source) < sourceRank(prev.source)) {
      map.set(key, mergeFields(hit, prev));
    } else {
      map.set(key, mergeFields(prev, hit));
    }
  }

  // id를 isbn13(또는 title|author)로 — Books.add()가 id 충돌 방지에 사용
  const merged = [...map.values()].map((b) => ({
    ...b,
    id: b.isbn13 || `t:${titleAuthorKey(b)}`,
  }));

  cacheSet(q, merged);
  return merged;
}
