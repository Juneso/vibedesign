// 기록 저장소 목업. 모든 레코드는 user_id 필드로 auth uid에 귀속된다.
// 익명 → 소셜 전환 후에도 uid가 같으므로 record.user_id는 값 변경 없이 그대로 유지된다.

import { getAuthState } from './mockAuth.js';

const KEY = 'login-auth/records/v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function save(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

let records = load();
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn(records));

export function subscribeRecords(fn) {
  listeners.add(fn);
  fn(records);
  return () => listeners.delete(fn);
}

export function getRecords() {
  return records;
}

export function addRecord(content) {
  const { uid } = getAuthState();
  const record = {
    record_id: 'rec_' + Math.random().toString(36).slice(2, 9),
    user_id: uid,
    content,
    created_at: Date.now(),
  };
  records = [record, ...records];
  save(records);
  notify();
  return record;
}

export function resetRecords() {
  records = [];
  save(records);
  notify();
}
