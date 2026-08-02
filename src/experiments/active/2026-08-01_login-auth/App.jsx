import React, { useEffect, useState } from 'react';
import { signInAnonymously } from './lib/auth.js';
import OnboardingScreen from './screens/OnboardingScreen.jsx';
import MainScreen from './screens/MainScreen.jsx';

// 구조: 익명 UID는 온보딩과 무관하게 진입 즉시 백그라운드로 발급(login-design.md §5).
// 온보딩(0628 이식) 완료 후 메인 진입. 소셜 연결은 화면 선택이 아니라 T1 트리거로만 유도.
export default function App() {
  const [ready, setReady] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    signInAnonymously().then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <div className="flex flex-col h-full w-full bg-white">
      {onboardingDone
        ? <MainScreen />
        : <OnboardingScreen onComplete={() => setOnboardingDone(true)} />}
    </div>
  );
}
