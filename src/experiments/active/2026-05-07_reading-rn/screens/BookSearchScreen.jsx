import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { Inspectable } from '../components/Inspectable.jsx';
import { BookCover } from '../components/BookCover.jsx';
import { Books, searchBooks, onChange } from '../storage.js';
import { fetchAladinDetail } from '../sources/aladin.js';
import { useTheme } from '../theme.js';

export const BookSearchScreen = ({ onClose }) => {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => onChange(() => setTick((n) => n + 1)), []);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setError(null); setLoading(false); return; }
    setLoading(true); setError(null);
    const tm = setTimeout(async () => {
      try {
        const r = await searchBooks(q);
        if (query.trim() !== q) return;
        setResults(r); setLoading(false);
      } catch (err) {
        if (query.trim() !== q) return;
        setError(err.message || '검색 실패'); setLoading(false);
      }
    }, 300);
    return () => clearTimeout(tm);
  }, [query]);

  return (
    <Inspectable name="BookSearchScreen" style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ height: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: t.hairline }}>
        <Pressable onPress={onClose} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22, color: t.fg }}>×</Text>
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>책 추가</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 24 }}>
        <Inspectable name="SearchBar" style={{
          flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10,
          backgroundColor: t.inputBg, borderRadius: 12, marginBottom: 14,
        }}>
          <Text style={{ fontSize: 14, color: t.fgTertiary }}>⌕</Text>
          <TextInput value={query} onChangeText={setQuery}
            placeholder="제목, 저자로 검색"
            placeholderTextColor={t.fgTertiary}
            autoFocus
            style={{ flex: 1, fontSize: 14, color: t.fg, outlineStyle: 'none' }} />
        </Inspectable>

        {loading && <Text style={{ textAlign: 'center', color: t.fgTertiary, paddingVertical: 20 }}>검색 중…</Text>}
        {error && <Text style={{ textAlign: 'center', color: t.fgTertiary, paddingVertical: 20 }}>{error}</Text>}
        {!loading && !error && !query.trim() && (
          <Text style={{ textAlign: 'center', color: t.fgTertiary, paddingVertical: 20 }}>제목이나 저자를 입력해보세요.</Text>
        )}
        {!loading && !error && query.trim() && results.length === 0 && (
          <Text style={{ textAlign: 'center', color: t.fgTertiary, paddingVertical: 20 }}>"{query}" 결과 없음</Text>
        )}

        {results.map((b) => {
          const exists = !!Books.get(b.id);
          const year = (b.publishedDate || '').slice(0, 4);
          const pageStr = b.pageCount ? `${b.pageCount}쪽` : '쪽수 직접 입력';
          const extra = [b.publisher, year, pageStr, b.source].filter(Boolean).join(' · ');
          return (
            <Pressable key={b.id} dataSet={{ rn: 'ResultItem' }}
              onPress={() => {
                if (exists) return;
                const id = Books.add(b);
                // 알라딘 책이면 백그라운드로 ItemLookUp → itemPage 등 보강
                if (b.source === 'aladin' && b.itemId) {
                  fetchAladinDetail(b.itemId).then((d) => {
                    if (!d) return;
                    Books.update(id, {
                      pageCount: d.pageCount || b.pageCount || 0,
                      subtitle: d.subTitle || '',
                      originalTitle: d.originalTitle || '',
                      translators: d.translators || [],
                      categoryName: d.categoryName || '',
                      story: d.story || '',
                      ratingScore: d.ratingScore ?? null,
                    });
                  });
                }
              }}
              style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: t.hairline, opacity: exists ? 0.6 : 1 }}>
              <BookCover book={b} w={50} h={72} radius={3} />
              <View style={{ flex: 1, paddingTop: 2 }}>
                <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: '600', color: t.fg, marginBottom: 2 }}>{b.title}</Text>
                <Text style={{ fontSize: 12, color: t.fgSecondary, marginBottom: 4 }}>{(b.authors || []).join(', ')}</Text>
                {extra ? <Text style={{ fontSize: 11, color: t.fgTertiary }}>{extra}</Text> : null}
              </View>
              <View style={{
                paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                backgroundColor: exists ? t.hairline : t.accent, alignSelf: 'center',
              }}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: exists ? t.fgSecondary : '#fff' }}>{exists ? '추가됨' : '추가'}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </Inspectable>
  );
};
