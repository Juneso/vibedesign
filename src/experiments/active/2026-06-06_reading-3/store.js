// 밑줄 — 로컬 데이터 스토어 (localStorage 기반, 테스트용)
const KEY = 'milgul_store';

export function getStore() {
  const raw = localStorage.getItem(KEY);
  if (raw) return JSON.parse(raw);
  return _create();
}

export function addRecord(record) {
  const store = getStore();
  store.records.unshift({ ...record, id: 'rec_' + Date.now() });
  _save(store);
  return store;
}

export function addBook(book) {
  const store = getStore();
  if (!store.books) store.books = [];
  if (store.books.find(b => b.id === book.id)) return store; // 중복 방지
  store.books.unshift({ ...book, addedAt: new Date().toISOString() });
  _save(store);
  return store;
}

export function allBooks() {
  return getStore().books || [];
}

// R 키 → 콜드스타터 초기화 (테스트 전용)
export function resetStore() {
  localStorage.removeItem(KEY);
}

function _create() {
  const store = {
    uid: 'anon_' + Math.random().toString(36).slice(2, 10),
    books: [],
    records: [],
    createdAt: new Date().toISOString(),
  };
  _save(store);
  return store;
}

function _save(store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}
