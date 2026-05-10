import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Inspectable } from './components/Inspectable.jsx';
import { StatusBar } from './components/StatusBar.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { LibraryScreen } from './screens/LibraryScreen.jsx';
import { ProfileScreen } from './screens/ProfileScreen.jsx';
import { ChatScreen } from './screens/ChatScreen.jsx';
import { NotesScreen, PageDetailScreen } from './screens/NotesScreen.jsx';
import { BookSearchScreen } from './screens/BookSearchScreen.jsx';
import { QuoteAddScreen } from './screens/QuoteAddScreen.jsx';
import { BookDetailScreen } from './screens/BookDetailScreen.jsx';
import { SearchScreen } from './screens/SearchScreen.jsx';
import { Books, Quotes } from './storage.js';
import { seedBooks, seedQuotes } from './data.js';
import { useTheme } from './theme.js';

const MAIN_TABS = ['home', 'library', 'profile'];

const App = () => {
  const t = useTheme();
  const [view, setView] = useState('home');
  const [tab, setTab] = useState('home');
  const [activeBookId, setActiveBookId] = useState(null);
  const [pageId, setPageId] = useState(null);

  useEffect(() => {
    Books.seedIfEmpty(seedBooks);
    Quotes.seedIfEmpty(seedQuotes);
    const cur = (Books.all().find((b) => b.isCurrent) || Books.all()[0]);
    if (cur) setActiveBookId(cur.id);
  }, []);

  const switchTab = (name) => { setTab(name); setView(name); };
  const openBookDetail = (bookId) => { if (bookId) setActiveBookId(bookId); setView('book-detail'); };
  const openChat = (bookId) => { if (bookId) setActiveBookId(bookId); setView('chat'); };
  const openNotes = (bookId) => { if (bookId) setActiveBookId(bookId); setView('notes'); };
  const openPageDetail = (id) => { setPageId(id); setView('page-detail'); };
  const openBookSearch = () => setView('book-search');
  const openQuoteAdd = (bookId) => { if (bookId) setActiveBookId(bookId); setView('quote-add'); };
  const openSearch = () => setView('search');
  const closeModal = () => setView(tab);

  const isMainTab = MAIN_TABS.includes(view);

  return (
    <Inspectable name="App" style={{
      width: '100%', height: '100%', backgroundColor: t.bg, position: 'relative', overflow: 'hidden',
    }}>
      <StatusBar />
      <View style={{ flex: 1, position: 'relative' }} dataSet={{ rn: 'CanvasContent' }}>
        {view === 'home' && (
          <HomeScreen onChat={openChat} onNotes={openNotes} onQuoteAdd={() => openQuoteAdd()}
            onSwitchTab={switchTab} onOpenBook={openBookDetail} onOpenSearch={openSearch} />
        )}
        {view === 'library' && (
          <LibraryScreen onOpenBook={openBookDetail} onOpenSearch={openBookSearch} onAppSearch={openSearch} />
        )}
        {view === 'profile' && <ProfileScreen onAppSearch={openSearch} />}
        {view === 'book-detail' && (
          <BookDetailScreen bookId={activeBookId} onBack={() => switchTab(tab)}
            onChat={openChat} onNotes={openNotes} onQuoteAdd={openQuoteAdd} />
        )}
        {view === 'chat' && (
          <ChatScreen bookId={activeBookId} onClose={() => openBookDetail(activeBookId)} onEndToNotes={() => openNotes()} />
        )}
        {view === 'notes' && (
          <NotesScreen bookId={activeBookId} onBack={() => openBookDetail(activeBookId)} onPickPage={openPageDetail} />
        )}
        {view === 'page-detail' && (
          <PageDetailScreen pageId={pageId} onBack={() => setView('notes')} onPickPage={openPageDetail} />
        )}
        {view === 'book-search' && <BookSearchScreen onClose={closeModal} />}
        {view === 'quote-add' && <QuoteAddScreen defaultBookId={activeBookId} onClose={closeModal} />}
        {view === 'search' && <SearchScreen onClose={closeModal} onPickBook={openBookDetail} onPickPage={openPageDetail} />}
      </View>
      <BottomNav visible={isMainTab} current={tab} onTab={switchTab} onFab={() => openQuoteAdd()} />
    </Inspectable>
  );
};

export default App;
