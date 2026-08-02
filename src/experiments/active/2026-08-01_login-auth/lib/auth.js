// Firebase Auth 연동 (BKT-277/312 구조): 익명 로그인 → SIWA/Google을 linkWithPopup으로
// "같은 UID에" 연결. Firebase가 UID를 그대로 유지해주므로 데이터 마이그레이션이 없다.
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously as fbSignInAnonymously,
  GoogleAuthProvider,
  OAuthProvider,
  linkWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import { app } from './firebase.js';

const auth = getAuth(app);

const providerFactories = {
  'google.com': () => new GoogleAuthProvider(),
  'apple.com': () => new OAuthProvider('apple.com'),
};

let state = { uid: null, isAnonymous: true, providers: [], createdAt: null, linkedAt: null };
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn(state));

function syncFromUser(user) {
  if (!user) return;
  state = {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    providers: user.providerData.map(p => p.providerId),
    createdAt: state.createdAt ?? Date.now(),
    linkedAt: user.isAnonymous ? null : (state.linkedAt ?? Date.now()),
  };
  notify();
}

// auth.currentUser는 페이지 로드 직후엔 비어있다가 Firebase가 저장된 세션을
// 비동기로 복원한다. 첫 이벤트를 기다리지 않고 signInAnonymously를 호출하면
// 매 새로고침마다 새 익명 유저가 생겨버리므로, 첫 상태 통지를 기다려야 한다.
let resolveReady;
const authReady = new Promise(resolve => { resolveReady = resolve; });
let firstEvent = true;

onAuthStateChanged(auth, user => {
  syncFromUser(user);
  if (firstEvent) { firstEvent = false; resolveReady(); }
});

export function onAuthStateChange(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function getAuthState() {
  return state;
}

// 앱 최초 실행 시 자동 호출. 저장된 세션 복원을 기다린 후, 없을 때만 새로 발급한다.
export async function signInAnonymously() {
  await authReady;
  if (!auth.currentUser) {
    await fbSignInAnonymously(auth);
  }
  return state;
}

export async function linkWithCredential(providerId) {
  const makeProvider = providerFactories[providerId];
  if (!makeProvider) throw new Error(`지원하지 않는 provider: ${providerId}`);
  if (!auth.currentUser) throw new Error('익명 로그인이 먼저 필요합니다.');

  const result = await linkWithPopup(auth.currentUser, makeProvider());
  syncFromUser(result.user);
  return state;
}

// 로그아웃 후 익명 계정을 즉시 재생성한다 (BKT-312 체크리스트).
export async function signOut() {
  await fbSignOut(auth);
  return signInAnonymously();
}
