import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Inspectable } from '../components/Inspectable.jsx';
import { BookCover } from '../components/BookCover.jsx';
import { SpineShelf } from '../components/SpineShelf.jsx';
import { Books, onChange } from '../storage.js';
import { useTheme } from '../theme.js';

const VIEW_MODES = [
  { id: 'grid',  label: '그리드' },
  { id: 'spine', label: '척추' },
];

const ViewToggle = ({ mode, onChange, t }) => (
  <View dataSet={{ rn: 'ViewToggle' }} style={{
    flexDirection: 'row', backgroundColor: t.inputBg, borderRadius: 999, padding: 3,
  }}>
    {VIEW_MODES.map((m) => {
      const active = mode === m.id;
      return (
        <Pressable key={m.id} onPress={() => onChange(m.id)} style={{
          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
          backgroundColor: active ? t.bg : 'transparent',
          boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
        }}>
          <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? t.fg : t.fgSecondary }}>{m.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const GridView = ({ books, onOpenBook, t }) => (
  <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
    <Inspectable name="BookGrid" style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -7 }}>
      {books.map((b) => (
        <Pressable key={b.id} onPress={() => onOpenBook(b.id)} dataSet={{ rn: 'BookGridItem' }}
          style={{ width: '33.333%', paddingHorizontal: 7, marginBottom: 18 }}>
          <BookCover book={b} style={{ aspectRatio: 2 / 3 }} />
          <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: '600', marginTop: 8, color: t.fg }}>{b.title}</Text>
          <Text style={{ fontSize: 11, color: t.fgTertiary, marginTop: 2 }}>{(b.authors || []).join(', ')}</Text>
        </Pressable>
      ))}
    </Inspectable>
  </ScrollView>
);

export const LibraryScreen = ({ onOpenBook, onOpenSearch, onAppSearch }) => {
  const t = useTheme();
  const [books, setBooks] = useState(Books.all());
  const [mode, setMode] = useState('grid');
  useEffect(() => onChange(() => setBooks(Books.all())), []);

  // 척추 뷰는 진열대(어두운 배경)이 자체 배경을 그리니, 헤더만 같은 색 위에 깔리도록 조건부 렌더
  const isSpine = mode === 'spine';

  return (
    <Inspectable name="LibraryScreen" style={{ flex: 1, backgroundColor: isSpine ? '#0E0E10' : t.bg, paddingBottom: 64 }}>
      <View style={{
        paddingHorizontal: 22, paddingTop: 8, paddingBottom: 14,
        flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
      }}>
        <View>
          <Text style={{ fontSize: 28, fontWeight: '700', color: isSpine ? '#F2EFEA' : t.fg, letterSpacing: -0.5 }}>서재</Text>
          <Text style={{ marginTop: 6, fontSize: 14, color: isSpine ? 'rgba(255,255,255,0.45)' : t.fgSecondary }}>{books.length}권 보관 중</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <ViewToggle mode={mode} onChange={setMode} t={isSpine
            ? { ...t, inputBg: 'rgba(255,255,255,0.08)', bg: 'rgba(255,255,255,0.18)', fg: '#F2EFEA', fgSecondary: 'rgba(255,255,255,0.55)' }
            : t} />
          {onAppSearch ? (
            <Pressable onPress={onAppSearch} dataSet={{ rn: 'IconBtnSearch' }}
              style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 18, color: isSpine ? '#F2EFEA' : t.fg }}>⌕</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onOpenSearch} dataSet={{ rn: 'IconBtnAdd' }}
            style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22, color: isSpine ? '#F2EFEA' : t.fg }}>+</Text>
          </Pressable>
        </View>
      </View>

      {books.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.fgSecondary, marginBottom: 4 }}>서재가 비어 있어요</Text>
          <Text style={{ fontSize: 12.5, color: t.fgTertiary, marginBottom: 12 }}>읽고 있거나 읽고 싶은 책을 추가해보세요.</Text>
          <Pressable onPress={onOpenSearch} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: t.accent }}>
            <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600' }}>+ 책 추가</Text>
          </Pressable>
        </View>
      ) : isSpine ? (
        <SpineShelf books={books} onPickBook={(b) => onOpenBook(b.id)} />
      ) : (
        <GridView books={books} onOpenBook={onOpenBook} t={t} />
      )}
    </Inspectable>
  );
};
