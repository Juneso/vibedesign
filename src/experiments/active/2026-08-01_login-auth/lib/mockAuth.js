// Firebase Auth 목업. 실서비스에서는 Firebase Anonymous Auth + linkWithCredential 대체.
// 구조 원칙(BKT-277/BKT-312): 익명 UID 최초 1회 발급 후 재발급 금지.
// SIWA/Google은 "같은 UID에" 연결(linkWithCredential)만 할 뿐, 데이터 마이그레이션은 없음.

const KEY = 'login-auth/session/v1';

const empty = () => ({
  uid: null,
  isAnonymous: true,
  providers: [], // 'apple.com' | 'google.com'
  createdAt: null,
  linkedAt: null,
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

function save(next) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

let state = load();
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn(state));

export function onAuthStateChange(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function getAuthState() {
  return state;
}

function genUid() {
  return 'anon_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// 앱 최초 실행 시 자동 호출. uid가 이미 있으면 그대로 재사용한다(재발급 금지 원칙).
export function signInAnonymously() {
  if (!state.uid) {
    state = { ...state, uid: genUid(), isAnonymous: true, createdAt: Date.now() };
    save(state);
  }
  notify();
  return state;
}

// SIWA/Google 연결. uid는 그대로 유지되고 provider만 추가된다 — 데이터 이관 불필요.
export function linkWithCredential(provider, { simulateAlreadyInUse = false } = {}) {
  if (simulateAlreadyInUse) {
    const err = new Error('이미 가입된 계정입니다. 해당 계정으로 로그인하시겠어요?');
    err.code = 'ERROR_CREDENTIAL_ALREADY_IN_USE';
    throw err;
  }
  state = {
    ...state,
    isAnonymous: false,
    providers: state.providers.includes(provider) ? state.providers : [...state.providers, provider],
    linkedAt: Date.now(),
  };
  save(state);
  notify();
  return state;
}

// 로그아웃 후 익명 계정을 즉시 재생성한다 (BKT-312 체크리스트).
export function signOut() {
  state = empty();
  save(state);
  notify();
  return signInAnonymously();
}

export function resetDemo() {
  state = empty();
  save(state);
  notify();
}
