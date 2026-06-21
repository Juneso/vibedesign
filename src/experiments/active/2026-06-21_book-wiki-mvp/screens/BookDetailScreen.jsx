import React, { useState } from 'react';
import { useStore } from '../App.jsx';
import { update, log, uid, getState } from '../lib/storage.js';
import { planIngest, generateFollowUps } from '../lib/llm.js';

export default function BookDetailScreen({ bookId, onBack }) {
  const s = useStore();
  const book = s.books[bookId];
  const memos = Object.values(s.memos).filter(m => m.bookId === bookId).sort((a,b) => b.createdAt - a.createdAt);
  const pages = Object.values(s.wikiPages).filter(p => p.bookId === bookId);
  const [composing, setComposing] = useState(false);
  const [followUpMemoId, setFollowUpMemoId] = useState(null);
  const [ingesting, setIngesting] = useState(false);
  const [diff, setDiff] = useState(null);

  if (!book) return <div className="p-4">책을 찾을 수 없음</div>;

  const startIngest = async () => {
    const pending = memos.filter(m => !m.ingestedAt);
    if (!pending.length) { alert('새로 ingest할 메모가 없습니다.'); return; }
    setIngesting(true);
    const contexts = Object.values(s.contexts);
    const plan = await planIngest({ memos: pending, book, existingPages: pages, contexts, profile: s.profile });
    setIngesting(false);
    setDiff({ plan, pendingMemoIds: pending.map(m => m.id) });
  };

  const approveIngest = () => {
    update(st => {
      diff.plan.patches.forEach(p => {
        if (p.action === 'create') {
          const id = uid('page');
          st.wikiPages[id] = { id, ...p.pageDraft, updatedAt: Date.now() };
        }
      });
      diff.pendingMemoIds.forEach(mid => { if (st.memos[mid]) st.memos[mid].ingestedAt = Date.now(); });
    });
    log('ingest-approved', { bookId, patches: diff.plan.patches.length });
    setDiff(null);
  };

  return (
    <div className="pb-24">
      <header className="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 border-b border-zinc-100 flex items-center gap-2 z-10">
        <button onClick={onBack} className="text-sm">← 책장</button>
      </header>
      <div className="p-4 flex gap-3">
        {book.cover && <img src={book.cover} className="w-16 h-22 rounded bg-zinc-100 object-cover" />}
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base">{book.title}</h1>
          <div className="text-xs text-zinc-500">{book.author}</div>
          <div className="text-[11px] text-zinc-400 mt-1.5 line-clamp-3">{book.summary}</div>
        </div>
      </div>

      <details className="mx-4 mb-3 bg-white rounded-xl border border-zinc-100 text-sm">
        <summary className="px-3 py-2 cursor-pointer">목차 ({book.toc?.length ?? 0})</summary>
        <ul className="px-3 pb-3 space-y-1 text-xs text-zinc-600">
          {book.toc?.map((c, i) => <li key={i}>· {c}</li>)}
        </ul>
      </details>

      <section className="px-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">메모 ({memos.length})</h2>
          <button onClick={() => setComposing(true)} className="text-xs px-2.5 py-1 bg-black text-white rounded-full">+ 메모</button>
        </div>
        {memos.length === 0 && <div className="text-xs text-zinc-400 py-4 text-center">메모가 없습니다</div>}
        <ul className="space-y-2">
          {memos.map(m => (
            <li key={m.id} className="bg-white p-3 rounded-xl border border-zinc-100">
              <div className="text-[11px] text-zinc-400 mb-1 flex items-center gap-1.5">
                <span>{m.chapter ?? '미지정'}</span>
                {m.ingestedAt && <span>· ingested</span>}
                {m.followUps?.length > 0 && <span className="text-amber-600">· 💡{m.followUps.length}</span>}
              </div>
              <div className="text-sm">{m.text}</div>
              {m.myThought && <div className="text-xs text-zinc-500 mt-1.5">💭 {m.myThought}</div>}
              {m.followUps?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-zinc-100 space-y-1.5">
                  {m.followUps.map((f, i) => (
                    <div key={i} className="text-[11px] leading-snug">
                      <div className="text-amber-700">💡 {f.question}</div>
                      <div className="text-zinc-600 mt-0.5">{f.answer}</div>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="px-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Sub-Wiki ({pages.length})</h2>
          <button
            onClick={startIngest} disabled={ingesting}
            className="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded-full disabled:opacity-40"
          >{ingesting ? 'Ingest 중…' : 'Ingest'}</button>
        </div>
        {pages.length === 0 && <div className="text-xs text-zinc-400 py-4 text-center">아직 생성된 페이지 없음</div>}
        <ul className="space-y-2">
          {pages.map(p => (
            <li key={p.id} className="bg-white p-3 rounded-xl border border-zinc-100">
              <div className="text-[11px] text-zinc-400 mb-0.5">{p.type}</div>
              <div className="text-sm font-semibold">{p.title}</div>
              <div className="text-xs text-zinc-500 mt-1 line-clamp-3 whitespace-pre-wrap">{p.body}</div>
            </li>
          ))}
        </ul>
      </section>

      {composing && (
        <MemoComposer
          bookId={bookId}
          onClose={() => setComposing(false)}
          onSaved={(memoId) => { setComposing(false); setFollowUpMemoId(memoId); }}
        />
      )}
      {followUpMemoId && (
        <FollowUpSheet
          memoId={followUpMemoId}
          bookId={bookId}
          onClose={() => setFollowUpMemoId(null)}
        />
      )}
      {diff && <IngestDiffSheet diff={diff} onCancel={() => setDiff(null)} onApprove={approveIngest} />}
    </div>
  );
}

function MemoComposer({ bookId, onClose, onSaved }) {
  const book = getState().books[bookId];
  const [text, setText] = useState('');
  const [chapter, setChapter] = useState(book.toc?.[0] ?? '');
  const [myThought, setMyThought] = useState('');

  const save = () => {
    if (!text.trim()) return;
    const id = uid('memo');
    update(s => {
      s.memos[id] = { id, bookId, text: text.trim(), chapter, myThought: myThought.trim(), source: 'user', followUps: [], createdAt: Date.now() };
    });
    log('memo-added', { id, bookId });
    onSaved ? onSaved(id) : onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">메모</h3>
          <button onClick={onClose} className="text-zinc-400 text-sm">취소</button>
        </div>
        <select value={chapter} onChange={e => setChapter(e.target.value)} className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg">
          {(book.toc ?? []).map(c => <option key={c} value={c}>{c}</option>)}
          <option value="">(챕터 미지정)</option>
        </select>
        <textarea
          value={text} onChange={e => setText(e.target.value)}
          placeholder="책에서 수집한 문장 / 메모"
          rows={4}
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg resize-none"
        />
        <input
          value={myThought} onChange={e => setMyThought(e.target.value)}
          placeholder="(선택) 내 생각 한 줄"
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
        />
        <button onClick={save} className="w-full py-2.5 bg-black text-white rounded-lg text-sm font-semibold">저장</button>
      </div>
    </div>
  );
}

function IngestDiffSheet({ diff, onCancel, onApprove }) {
  const confColor = { high: 'text-emerald-700', med: 'text-amber-700', low: 'text-rose-700' };
  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-end">
      <div className="w-full max-h-[88%] bg-white rounded-t-3xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Ingest 미리보기</h3>
          <button onClick={onCancel} className="text-zinc-400 text-sm">취소</button>
        </div>
        <div className="text-[11px] text-zinc-400 mb-2">{diff.plan.notes}</div>

        <div className="flex-1 overflow-y-auto space-y-3 mb-3">
          {/* STEP 1: 메모 분석 — 맥락 anchor + 키워드 */}
          {!!diff.plan.analyses?.length && (
            <section>
              <h4 className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1.5">메모 분석</h4>
              <ul className="space-y-1.5">
                {diff.plan.analyses.map((a, i) => (
                  <li key={i} className="border border-zinc-200 p-2.5 rounded-lg bg-zinc-50 space-y-1.5">
                    <div className="text-sm font-medium leading-snug">💬 {a.thesis}</div>
                    <div className="flex items-center gap-2 text-[11px] flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-white border border-zinc-200 text-zinc-600">{a.stance}</span>
                      <span className="text-zinc-500">📖 {a.tocAnchor}</span>
                      <span className={`font-mono ${confColor[a.anchorConfidence] || ''}`}>{a.anchorConfidence}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(a.keyConcepts || []).map((c, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{c}</span>
                      ))}
                    </div>
                    <div className="text-[11px] text-zinc-600 leading-snug">📚 {a.bookContextLink}</div>
                    {a.userContextLinks?.length > 0 && (
                      <div className="text-[11px] text-purple-700 leading-snug border-l-2 border-purple-300 pl-2 space-y-0.5">
                        {a.userContextLinks.map((u, k) => (
                          <div key={k}>🧭 {u.note} <span className="text-[10px] text-zinc-400 font-mono">{u.contextId.slice(0, 8)}</span></div>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* STEP 2: 페이지 패치 */}
          <section>
            <h4 className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1.5">Wiki 변경</h4>
            <ul className="space-y-2">
              {diff.plan.patches.map((p, i) => (
                <li key={i} className="border border-emerald-200 bg-emerald-50/50 p-3 rounded-xl">
                  <div className="text-[10px] uppercase tracking-wide text-emerald-700 mb-1">{p.action}</div>
                  <div className="text-sm font-semibold">{p.pageDraft?.title ?? p.pageId}</div>
                  <div className="text-xs text-zinc-700 mt-1 whitespace-pre-wrap leading-snug">{p.pageDraft?.body ?? p.append}</div>
                  {p.pageDraft?.keyConcepts?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.pageDraft.keyConcepts.map((c, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-emerald-200 text-emerald-700">{c}</span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <button onClick={onApprove} className="w-full py-2.5 bg-black text-white rounded-lg text-sm font-semibold">
          승인 · Wiki에 반영
        </button>
      </div>
    </div>
  );
}

function FollowUpSheet({ memoId, bookId, onClose }) {
  const s = useStore();
  const memo = s.memos[memoId];
  const book = s.books[bookId];
  const [questions, setQuestions] = useState(null); // null=loading, []=none, [...]=ready
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = await generateFollowUps({
          memo, book,
          profile: s.profile,
          contexts: Object.values(s.contexts),
        });
        if (!cancelled) setQuestions(qs);
      } catch (e) {
        if (!cancelled) { setError(e.message); setQuestions([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [memoId]);

  const skip = () => { log('followup-skipped', { memoId }); onClose(); };
  const save = () => {
    const followUps = questions
      .map(q => ({ question: q, answer: (answers[q] || '').trim(), askedAt: Date.now() }))
      .filter(f => f.answer);
    if (followUps.length) {
      update(st => { st.memos[memoId].followUps = followUps; });
      log('followup-answered', { memoId, count: followUps.length });
    }
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-end">
      <div className="w-full max-h-[88%] bg-white rounded-t-3xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold">한 발 더 들어가기</h3>
          <button onClick={skip} className="text-zinc-400 text-sm">건너뛰기</button>
        </div>
        <div className="text-[11px] text-zinc-500 mb-3">메모를 더 깊게 만드는 짧은 질문이에요</div>

        <div className="flex-1 overflow-y-auto space-y-3 mb-3">
          {questions === null && (
            <div className="text-center text-zinc-400 text-sm py-8">질문 생성 중…</div>
          )}
          {error && (
            <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded">{error}</div>
          )}
          {questions?.length === 0 && !error && (
            <div className="text-center text-zinc-400 text-sm py-8">후속 질문 없음</div>
          )}
          {questions?.map((q, i) => (
            <div key={i} className="space-y-2">
              <div className="text-sm leading-snug">💡 {q}</div>
              <textarea
                value={answers[q] || ''}
                onChange={e => setAnswers(a => ({ ...a, [q]: e.target.value }))}
                rows={2}
                placeholder="1~2 문장으로 답해보세요"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg resize-none"
              />
            </div>
          ))}
        </div>

        <button
          onClick={save}
          disabled={questions === null}
          className="w-full py-2.5 bg-black text-white rounded-lg text-sm font-semibold disabled:opacity-40"
        >
          저장
        </button>
      </div>
    </div>
  );
}
