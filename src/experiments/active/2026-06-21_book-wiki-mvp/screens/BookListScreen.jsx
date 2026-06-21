import React, { useState } from 'react';
import { useStore } from '../App.jsx';
import { update, log, uid, reset } from '../lib/storage.js';
import { searchBooks, getBookDetail } from '../lib/aladin.js';
import { buildSeedState, buildSeedWikiPages, buildDesignBooksData, buildSuperConceptPages } from '../lib/seedLoader.js';

export default function BookListScreen({ onOpenBook }) {
  const { books } = useStore();
  const list = Object.values(books).sort((a, b) => b.createdAt - a.createdAt);
  const [adding, setAdding] = useState(false);

  const loadSeed = () => {
    const s = buildSeedState();
    const wikiPages = buildSeedWikiPages();
    const design = buildDesignBooksData(); // 옵시디언 디자인 책 4권 (기존에 추가)
    const superPages = buildSuperConceptPages(); // 상위 개념 노드 (책 가로지르는 연결)
    reset(); // 기존 상태 초기화 후 캐논 시드 적재 (중복 방지)
    update(st => {
      Object.assign(st.books, s.books, design.books);
      Object.assign(st.memos, s.memos);
      Object.assign(st.profile, s.profile);
      // 최종 ingest 산출물(시드 4권 + 디자인 4권) + 상위 개념 위키 반영
      Object.assign(st.wikiPages, wikiPages, design.wikiPages, superPages);
      // 박제된 위키가 있으므로 시드 메모는 ingest 완료 처리
      const now = Date.now();
      Object.values(st.memos).forEach(m => { if (m.ingestedAt == null) m.ingestedAt = now; });
    });
  };

  return (
    <div className="p-4 pb-24">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">내 책장</h1>
        <div className="flex gap-2">
          {import.meta.env.DEV && (
            <button onClick={loadSeed} className="px-3 py-1.5 text-sm bg-zinc-200 text-zinc-700 rounded-full">
              🌱 시드
            </button>
          )}
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 text-sm bg-black text-white rounded-full"
          >+ 책 추가</button>
        </div>
      </header>

      {list.length === 0 && (
        <div className="text-center text-zinc-400 py-20 text-sm">
          아직 책이 없습니다.<br/>오른쪽 위 "+ 책 추가"로 시작하세요.
        </div>
      )}

      <ul className="space-y-3">
        {list.map(b => (
          <li key={b.id}>
            <button
              onClick={() => onOpenBook(b.id)}
              className="w-full flex gap-3 p-3 bg-white rounded-2xl border border-zinc-100 text-left"
            >
              {b.cover && <img src={b.cover} alt="" className="w-12 h-16 object-cover rounded-md bg-zinc-100" />}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{b.title}</div>
                <div className="text-xs text-zinc-500 mt-0.5 truncate">{b.author}</div>
                <div className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{b.why || '읽는 이유 없음'}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {adding && <AddBookSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddBookSheet({ onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);
  const [why, setWhy] = useState('');

  const [searching, setSearching] = useState(false);
  const doSearch = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try { setResults(await searchBooks(q)); }
    catch (e) { alert('알라딘 검색 실패: ' + e.message); }
    finally { setSearching(false); }
  };

  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!picked) return;
    setSaving(true);
    // 상세 호출로 목차·풀설명 보강 (검색 응답엔 toc 없음)
    let enriched = picked;
    try {
      if (picked.isbn13) {
        const detail = await getBookDetail(picked.isbn13);
        if (detail) enriched = { ...picked, ...detail };
      }
    } catch (e) { console.warn('detail enrich failed', e); }
    const id = uid('book');
    update(s => {
      s.books[id] = {
        id, title: enriched.title, author: enriched.author, cover: enriched.cover,
        summary: enriched.summary, toc: enriched.toc, why, createdAt: Date.now(),
      };
    });
    log('book-added', { id, title: enriched.title, tocCount: enriched.toc?.length ?? 0 });
    setSaving(false);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-h-[90%] bg-white rounded-t-3xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">책 추가</h2>
          <button onClick={onClose} className="text-zinc-400">닫기</button>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="제목 또는 저자"
            className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg"
          />
          <button onClick={doSearch} disabled={searching} className="px-3 py-2 text-sm bg-zinc-100 rounded-lg disabled:opacity-40">
            {searching ? '…' : '검색'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 mb-3">
          {!searching && results.length === 0 && (
            <div className="text-xs text-zinc-400 text-center py-8">제목·저자로 검색하세요</div>
          )}
          {results.map(r => (
            <button key={r.id}
              onClick={() => setPicked(r)}
              className={`w-full flex gap-3 p-2 rounded-xl text-left border ${picked?.id === r.id ? 'border-black' : 'border-zinc-100'}`}
            >
              <img src={r.cover} alt="" className="w-10 h-14 object-cover rounded bg-zinc-100" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{r.title}</div>
                <div className="text-xs text-zinc-500 truncate">{r.author}</div>
              </div>
            </button>
          ))}
        </div>
        {picked && (
          <div className="border-t border-zinc-100 pt-3 space-y-2">
            <label className="text-xs text-zinc-500">이 책을 왜 읽는지 (1줄)</label>
            <input
              value={why} onChange={e => setWhy(e.target.value)}
              placeholder="예: 부조리 개념을 내 일에 적용하고 싶어서"
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
            />
            <button onClick={save} disabled={saving} className="w-full py-2.5 bg-black text-white rounded-lg text-sm font-semibold disabled:opacity-40">
              {saving ? '목차 불러오는 중…' : '책장에 추가'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
