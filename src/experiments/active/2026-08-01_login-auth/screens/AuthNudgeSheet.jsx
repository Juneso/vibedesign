import React, { useState } from 'react';
import { linkWithCredential } from '../lib/auth.js';

// T1 트리거 바텀시트: 첫 기록 저장 직후 노출 (BKT-277). 초기 버전은 T1만 구현.
// Apple 버튼은 Firebase 콘솔에 Apple Services ID까지 등록해야 동작한다 (BKT-312 선결 조건).
export default function AuthNudgeSheet({ onClose }) {
  const [busy, setBusy] = useState(null); // 'apple.com' | 'google.com' | null
  const [error, setError] = useState(null);

  const connect = async (provider) => {
    setBusy(provider);
    setError(null);
    try {
      await linkWithCredential(provider);
      onClose();
    } catch (e) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
        // 사용자가 팝업을 닫은 것뿐 — 에러로 취급하지 않는다.
      } else {
        setError(e);
      }
    } finally {
      setBusy(null);
    }
  };

  const errorMessage = (e) => {
    if (!e) return null;
    if (e.code === 'auth/credential-already-in-use') return '이미 가입된 계정입니다. 해당 계정으로 로그인하시겠어요?';
    if (e.code === 'auth/operation-not-allowed') return '이 로그인 방식이 아직 활성화되지 않았어요. (Firebase 콘솔에서 설정 필요)';
    return '연결에 실패했어요. 다시 시도해주세요.';
  };

  return (
    <div className="t1-overlay">
      <div className="t1-sheet">
        <div className="t1-handle" />
        <p className="t1-emoji">🔒</p>
        <h3 className="t1-title">기록이 쌓이고 있어요</h3>
        <p className="t1-body">다른 기기에서도 볼 수 있게 할까요?<br />지금 저장된 기록은 그대로 유지돼요.</p>

        {error && <div className="t1-error">{errorMessage(error)}</div>}

        <button className="ob-btn-siwa" disabled={busy !== null} onClick={() => connect('apple.com')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          {busy === 'apple.com' ? '연결 중…' : 'Apple로 계속하기'}
        </button>
        <button className="ob-btn-google" disabled={busy !== null} onClick={() => connect('google.com')}>
          {busy === 'google.com' ? '연결 중…' : 'Google로 계속하기'}
        </button>

        <button className="t1-dismiss" onClick={onClose}>지금은 괜찮아요</button>
      </div>
    </div>
  );
}
