import React, { useState, useEffect } from 'react';
import { getAuthState, onAuthStateChange, signOut } from '../lib/auth.js';
import { getRecords, subscribeRecords, addRecord, resetRecords } from '../lib/records.js';
import AuthNudgeSheet from './AuthNudgeSheet.jsx';

export default function MainScreen() {
  const [auth, setAuth] = useState(getAuthState());
  const [records, setRecords] = useState(getRecords());
  const [text, setText] = useState('');
  const [showNudge, setShowNudge] = useState(false);

  useEffect(() => onAuthStateChange(setAuth), []);
  useEffect(() => subscribeRecords(setRecords), []);

  const save = () => {
    if (!text.trim()) return;
    const wasEmpty = records.length === 0;
    addRecord(text.trim());
    setText('');
    // T1: 첫 저장 직후에만 노출 (아직 소셜 연결 안 된 경우)
    if (wasEmpty && auth.isAnonymous) setShowNudge(true);
  };

  return (
    <div className="flex flex-col h-full w-full">
      <header className="p-4 border-b border-zinc-100">
        <h1 className="text-lg font-bold">기록</h1>
      </header>

      <div className="p-4 border-b border-zinc-100 bg-zinc-50 text-[11px] font-mono text-zinc-500 space-y-0.5">
        <div>uid: <span className="text-zinc-700">{auth.uid}</span></div>
        <div>isAnonymous: <span className="text-zinc-700">{String(auth.isAnonymous)}</span></div>
        <div>providers: <span className="text-zinc-700">{auth.providers.length ? auth.providers.join(', ') : '(none)'}</span></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {records.length === 0 && (
          <div className="text-xs text-zinc-400 text-center py-10">
            읽고 있는 책의 문장을 기록해보세요.
          </div>
        )}
        {records.map(r => (
          <div key={r.record_id} className="bg-white border border-zinc-100 rounded-xl p-3">
            <div className="text-sm">{r.content}</div>
            <div className="text-[10px] text-zinc-400 mt-1 font-mono">user_id: {r.user_id}</div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-zinc-100 flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
          placeholder="기억하고 싶은 문장을 남겨보세요"
          className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg"
        />
        <button onClick={save} className="px-4 py-2 text-sm bg-black text-white rounded-lg">저장</button>
      </div>

      <div className="px-4 pb-4 flex gap-3 text-[10px] text-zinc-300">
        <button onClick={() => { signOut(); resetRecords(); }} className="underline">로그아웃(데모 초기화)</button>
        {!auth.isAnonymous && <span>연결됨 · uid 유지됨</span>}
      </div>

      {showNudge && <AuthNudgeSheet onClose={() => setShowNudge(false)} />}
    </div>
  );
}
