// DES-187 · interpretProfile 결과 캐시.
// 프로필은 거의 안 바뀌므로 매번 LLM 호출 비용을 들이지 않는다.
// 프로필 직렬화 해시가 같으면 캐시 hit.

import { interpretProfile } from './llm.js';

const KEY = 'book-wiki-mvp/v1/profile-derived';

function hash(obj) {
  const s = JSON.stringify(obj || {});
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function readCache() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
  catch { return null; }
}

export function clearCache() {
  localStorage.removeItem(KEY);
}

export async function getDerivedKeywords(profile) {
  const sig = hash(profile);
  const cached = readCache();
  if (cached && cached.sig === sig) return cached.result;
  const result = await interpretProfile({ profile });
  localStorage.setItem(KEY, JSON.stringify({ sig, result, savedAt: Date.now() }));
  return result;
}
