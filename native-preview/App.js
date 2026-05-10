// 네이티브 프리뷰 진입점. 실험 폴더(2026-05-07_reading-rn)의 App.jsx를 그대로 가져와 렌더.
// localStorage 폴리필을 import 전에 깔아 storage.js가 그대로 동작하게 함 (영속성은 세션 한정).

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import ExperimentApp from '../src/experiments/active/2026-05-07_reading-rn/App.jsx';

export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      <ExperimentApp />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
});
