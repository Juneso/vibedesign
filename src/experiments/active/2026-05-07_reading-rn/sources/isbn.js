// ISBN-10 ↔ ISBN-13 정규화. 모든 어댑터가 같은 join key를 갖도록 강제.
const onlyDigits = (s) => String(s || '').replace(/[^0-9Xx]/g, '');

const isbn10To13 = (isbn10) => {
  const d = onlyDigits(isbn10).slice(0, 9);
  if (d.length !== 9) return '';
  const base = '978' + d;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (i % 2 === 0 ? 1 : 3) * parseInt(base[i], 10);
  const check = (10 - (sum % 10)) % 10;
  return base + check;
};

export const normalizeIsbn = (raw) => {
  if (!raw) return '';
  // 공백·하이픈으로 여러 ISBN이 섞여 들어올 수 있음 (카카오 "ISBN10 ISBN13")
  const parts = String(raw).split(/\s+/).map(onlyDigits).filter(Boolean);
  const thirteen = parts.find((p) => p.length === 13);
  if (thirteen) return thirteen;
  const ten = parts.find((p) => p.length === 10);
  if (ten) return isbn10To13(ten);
  return '';
};

// 같은 책으로 묶을 fallback 키 — ISBN 없을 때만 사용. dedupe 보조용.
export const titleAuthorKey = (book) => {
  const t = (book.title || '').toLowerCase().replace(/\s+/g, '').replace(/[^\w가-힣]/g, '');
  const a = (book.authors || [])[0]?.toLowerCase().replace(/\s+/g, '') || '';
  return `${t}|${a}`;
};
