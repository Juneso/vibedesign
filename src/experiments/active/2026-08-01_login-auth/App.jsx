import React, { useEffect, useState } from 'react';
import { signInAnonymously, getAuthState } from './lib/mockAuth.js';
import MainScreen from './screens/MainScreen.jsx';

// 구조: 로그인 화면 없이 진입 즉시 익명 UID 발급 → 메인. 소셜 연결은 T1 트리거로만 유도.
export default function App() {
  const [ready, setReady] = useState(!!getAuthState().uid);

  useEffect(() => {
    signInAnonymously();
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <div className="flex flex-col h-full w-full bg-white">
      <MainScreen />
    </div>
  );
}
