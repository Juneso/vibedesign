// localStorage 어댑터. 프로토 한정.
// 본 구현(SwiftUI)에선 마크다운 파일 + git 컨셉. 스키마는 PLAN.md 참조.

const KEY = 'book-wiki-mvp/v1';

const empty = () => ({
  books: {},          // bookId -> {id, title, author, cover, summary, toc[], why, createdAt}
  memos: {},          // memoId -> {id, bookId, text, chapter, myThought, source, createdAt}
  wikiPages: {},      // pageId -> {id, title, body, type, sources[], linkedBooks[], bookId?, updatedAt}
  nudges: {},         // nudgeId -> {id, type, question, sourcePageIds[], answer?, answeredAt?, createdAt}
  log: [],            // [{ts, kind, payload}]
  profile: { background: '', currentWork: [], interests: [], openQuestions: [] },
  contexts: {},       // contextId -> {id, title, body, tags?, createdAt, updatedAt}
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

let state = load();
const listeners = new Set();
const notify = () => listeners.forEach(l => l());

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() { return state; }

export function update(mutator) {
  mutator(state);
  save(state);
  notify();
}

export function log(kind, payload) {
  update(s => { s.log.push({ ts: Date.now(), kind, payload }); });
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

export function reset() {
  state = empty();
  save(state);
  notify();
}
