import React, { useState } from 'react';
import { linkWithCredential } from '../lib/mockAuth.js';

// T1 트리거 바텀시트: 첫 기록 저장 직후 노출 (BKT-277). 초기 버전은 T1만 구현.
export default function AuthNudgeSheet({ onClose }) {
  const [busy, setBusy] = useState(null); // 'apple.com' | 'google.com' | null
  const [error, setError] = useState(null);

  const connect = async (provider, opts) => {
    setBusy(provider);
    setError(null);
    try {
      await new Promise(r => setTimeout(r, 400)); // SDK 왕복 흉내
      linkWithCredential(provider, opts);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-2xl p-5 pb-8">
        <div className="w-9 h-1 bg-zinc-200 rounded-full mx-auto mb-4" />
        <h2 className="text-base font-bold mb-1">기록이 쌓이고 있어요</h2>
        <p className="text-sm text-zinc-500 mb-5">다른 기기에서도 볼 수 있게 할까요? 지금 저장된 기록은 그대로 유지돼요.</p>

        {error && (
          <div className="mb-3 text-xs text-red-600 bg-red-50 rounded-lg p-2">
            {error.code === 'ERROR_CREDENTIAL_ALREADY_IN_USE'
              ? error.message
              : '연결에 실패했어요. 다시 시도해주세요.'}
          </div>
        )}

        <button
          onClick={() => connect('apple.com')}
          disabled={busy !== null}
          className="w-full py-3 mb-2 text-sm font-medium bg-black text-white rounded-xl disabled:opacity-40"
        >
          {busy === 'apple.com' ? '연결 중…' : 'Apple로 계속하기'}
        </button>
        <button
          onClick={() => connect('google.com')}
          disabled={busy !== null}
          className="w-full py-3 mb-2 text-sm font-medium border border-zinc-200 rounded-xl disabled:opacity-40"
        >
          {busy === 'google.com' ? '연결 중…' : 'Google로 계속하기'}
        </button>

        <button onClick={onClose} className="w-full py-2 text-sm text-zinc-400">
          나중에
        </button>

        <button
          onClick={() => connect('apple.com', { simulateAlreadyInUse: true })}
          className="w-full mt-3 text-[10px] text-zinc-300 underline"
        >
          (dev) 이미 가입된 계정으로 테스트
        </button>
      </div>
    </div>
  );
}
