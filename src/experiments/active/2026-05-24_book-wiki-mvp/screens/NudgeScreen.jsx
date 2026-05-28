import React, { useState } from 'react';
import { useStore } from '../App.jsx';
import { update, log, uid } from '../lib/storage.js';
import { generateNudge, ingestAnswer } from '../lib/llm.js';

export default function NudgeScreen() {
  const s = useStore();
  const pages = Object.values(s.wikiPages);
  const memos = Object.values(s.memos);
  const open = Object.values(s.nudges).filter(n => !n.answeredAt).sort((a,b) => b.createdAt - a.createdAt);
  const answered = Object.values(s.nudges).filter(n => n.answeredAt).sort((a,b) => b.answeredAt - a.answeredAt);
  const [gen, setGen] = useState(false);

  const newNudge = async () => {
    setGen(true);
    const n = await generateNudge({ memos, pages, profile: s.profile });
    setGen(false);
    if (!n) { alert('근거 페이지 부족. wiki를 먼저 채워주세요.'); return; }
    const id = uid('nudge');
    update(st => { st.nudges[id] = { id, ...n, createdAt: Date.now() }; });
    log('nudge-generated', { id, type: n.type });
  };

  return (
    <div className="p-4 pb-24">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">넛지</h1>
        <button onClick={newNudge} disabled={gen} className="px-3 py-1.5 text-sm bg-black text-white rounded-full disabled:opacity-40">
          {gen ? '생성 중…' : '+ 새 질문'}
        </button>
      </header>

      <section className="mb-6">
        <h2 className="text-xs text-zinc-500 mb-2">오늘 답해보기</h2>
        {open.length === 0 && <div className="text-xs text-zinc-400 py-6 text-center">대기 중인 질문이 없습니다</div>}
        <ul className="space-y-2">
          {open.map(n => <NudgeCard key={n.id} nudge={n} pages={pages} />)}
        </ul>
      </section>

      {answered.length > 0 && (
        <section>
          <h2 className="text-xs text-zinc-500 mb-2">답한 질문 ({answered.length})</h2>
          <ul className="space-y-2">
            {answered.map(n => (
              <li key={n.id} className="bg-white p-3 rounded-xl border border-zinc-100">
                <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1">{n.type}</div>
                <div className="text-sm">{n.question}</div>
                <div className="text-xs text-zinc-600 mt-2 border-t border-zinc-100 pt-2">{n.answer}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function NudgeCard({ nudge, pages }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!answer.trim()) return;
    setBusy(true);
    const result = await ingestAnswer({ nudge, answer: answer.trim(), pages });
    update(st => {
      st.nudges[nudge.id].answer = answer.trim();
      st.nudges[nudge.id].answeredAt = Date.now();
      result.patches.forEach(p => {
        if (p.action === 'update' && st.wikiPages[p.pageId]) {
          st.wikiPages[p.pageId].body += p.append ?? '';
          st.wikiPages[p.pageId].sources = [...(st.wikiPages[p.pageId].sources ?? []), ...(p.addSources ?? [])];
          st.wikiPages[p.pageId].updatedAt = Date.now();
        }
      });
    });
    log('nudge-answered', { id: nudge.id });
    setBusy(false);
  };

  return (
    <li className="bg-white p-3 rounded-xl border border-zinc-200">
      <div className="text-[10px] uppercase tracking-wide text-indigo-600 mb-1">{nudge.type}</div>
      <div className="text-sm">{nudge.question}</div>
      <div className="text-[10px] text-zinc-400 mt-1">근거: {nudge.sourcePageIds.length}개 페이지</div>
      <textarea
        value={answer} onChange={e => setAnswer(e.target.value)}
        rows={3} placeholder="자유롭게 답하세요"
        className="w-full mt-2 px-3 py-2 text-sm border border-zinc-200 rounded-lg resize-none"
      />
      <button onClick={submit} disabled={busy} className="mt-2 w-full py-2 text-sm bg-black text-white rounded-lg disabled:opacity-40">
        {busy ? '반영 중…' : '답변 저장 · Wiki 갱신'}
      </button>
    </li>
  );
}
