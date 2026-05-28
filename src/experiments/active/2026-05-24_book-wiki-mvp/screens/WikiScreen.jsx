import React, { useState } from 'react';
import { useStore } from '../App.jsx';

const SOURCE_COLORS = {
  memo: 'bg-amber-100 text-amber-800',
  'book-meta': 'bg-sky-100 text-sky-800',
  'user-answer': 'bg-emerald-100 text-emerald-800',
  'user-context': 'bg-purple-100 text-purple-800',
  'llm-inference': 'bg-zinc-100 text-zinc-600',
};

function memoCount(p) {
  return (p.sources ?? []).filter(s => s.kind === 'memo').length;
}

export default function WikiScreen() {
  const s = useStore();
  const pages = Object.values(s.wikiPages).sort((a,b) => b.updatedAt - a.updatedAt);
  const [openId, setOpenId] = useState(null);
  const open = openId ? s.wikiPages[openId] : null;

  if (open) return <PageView page={open} book={open.bookId ? s.books[open.bookId] : null} onBack={() => setOpenId(null)} />;

  return (
    <div className="p-4 pb-24">
      <header className="mb-4">
        <h1 className="text-xl font-bold">Wiki</h1>
        <div className="text-xs text-zinc-500 mt-1">총 {pages.length}개 페이지 · {Object.keys(s.books).length}권 · 누적 메모 {Object.keys(s.memos).length}개</div>
      </header>

      {pages.length === 0 && (
        <div className="text-center text-zinc-400 py-20 text-sm">
          아직 페이지 없음.<br/>책 상세에서 메모를 쌓고 Ingest를 실행해보세요.
        </div>
      )}

      <ul className="space-y-2">
        {pages.map(p => (
          <li key={p.id}>
            <button onClick={() => setOpenId(p.id)} className="w-full text-left bg-white p-3 rounded-xl border border-zinc-100">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className="text-[10px] uppercase tracking-wide text-zinc-400">{p.type}</span>
                {p.bookId && s.books[p.bookId] && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">{s.books[p.bookId].title}</span>
                )}
                {memoCount(p) > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">메모 {memoCount(p)}</span>
                )}
              </div>
              <div className="text-sm font-semibold">{p.title}</div>
              <div className="text-xs text-zinc-500 mt-1 line-clamp-2 whitespace-pre-wrap">{p.body}</div>
              <div className="flex gap-1 mt-2 flex-wrap">
                {(p.sources ?? []).map((src, i) => (
                  <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${SOURCE_COLORS[src.kind] ?? 'bg-zinc-100'}`}>
                    {src.kind}
                  </span>
                ))}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PageView({ page, book, onBack }) {
  return (
    <div className="pb-24">
      <header className="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 border-b border-zinc-100 flex items-center gap-2 z-10">
        <button onClick={onBack} className="text-sm">← Wiki</button>
      </header>
      <div className="p-4">
        <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1">{page.type}</div>
        <h1 className="text-lg font-bold mb-2">{page.title}</h1>
        {book && <div className="text-xs text-zinc-500 mb-3">📖 {book.title}</div>}
        <div className="text-sm whitespace-pre-wrap leading-relaxed">{page.body}</div>

        <div className="mt-6 pt-4 border-t border-zinc-100">
          <h2 className="text-xs text-zinc-500 mb-2">출처 ({(page.sources ?? []).length})</h2>
          <ul className="space-y-1">
            {(page.sources ?? []).map((src, i) => (
              <li key={i} className="text-xs flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${SOURCE_COLORS[src.kind] ?? 'bg-zinc-100'}`}>{src.kind}</span>
                <span className="text-zinc-500 font-mono text-[10px]">{src.id}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
