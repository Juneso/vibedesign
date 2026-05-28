import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { subscribe, getState } from './lib/storage.js';
import BookListScreen from './screens/BookListScreen.jsx';
import BookDetailScreen from './screens/BookDetailScreen.jsx';
import NudgeScreen from './screens/NudgeScreen.jsx';
import WikiScreen from './screens/WikiScreen.jsx';
import ContextScreen from './screens/ContextScreen.jsx';

export function useStore() {
  return useSyncExternalStore(subscribe, getState, getState);
}

export default function App() {
  const [tab, setTab] = useState('books'); // books | nudge | wiki
  const [bookId, setBookId] = useState(null);

  // 책 상세는 books 탭 안에서 push 형태
  const onOpenBook = (id) => { setBookId(id); setTab('books'); };
  const onCloseBook = () => setBookId(null);

  return (
    <div className="flex flex-col h-full w-full bg-[#f7f7f8]">
      <div className="flex-1 overflow-y-auto">
        {tab === 'books' && (
          bookId
            ? <BookDetailScreen bookId={bookId} onBack={onCloseBook} />
            : <BookListScreen onOpenBook={onOpenBook} />
        )}
        {tab === 'nudge' && <NudgeScreen />}
        {tab === 'wiki' && <WikiScreen />}
        {tab === 'context' && <ContextScreen />}
      </div>
      <TabBar tab={tab} onChange={(t) => { setBookId(null); setTab(t); }} />
    </div>
  );
}

function TabBar({ tab, onChange }) {
  const items = [
    { id: 'books',   label: '책',   icon: '📚' },
    { id: 'nudge',   label: '넛지', icon: '💡' },
    { id: 'wiki',    label: 'Wiki', icon: '🕸️' },
    { id: 'context', label: '맥락', icon: '🧭' },
  ];
  return (
    <nav className="flex border-t border-zinc-200 bg-white pb-2 pt-1.5">
      {items.map(it => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[11px] ${tab === it.id ? 'text-black font-semibold' : 'text-zinc-400'}`}
        >
          <span className="text-lg leading-none">{it.icon}</span>
          {it.label}
        </button>
      ))}
    </nav>
  );
}
