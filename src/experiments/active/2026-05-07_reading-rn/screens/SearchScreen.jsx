// 앱 내 글로벌 검색 — 책/인용/위키 페이지를 한 화면에서.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { Inspectable } from '../components/Inspectable.jsx';
import { Books, Quotes, onChange } from '../storage.js';
import { wikiPages } from '../data.js';
import { useTheme } from '../theme.js';

const norm = (s) => String(s || '').toLowerCase();

const Hit = ({ label, primary, secondary, onPress, t, accent }) => (
  <Pressable onPress={onPress} dataSet={{ rn: 'SearchHit' }}
    style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: t.hairline }}>
    <Text style={{ fontSize: 10, fontWeight: '700', color: accent || t.accent, letterSpacing: 0.7, marginBottom: 2 }}>{label}</Text>
    <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }} numberOfLines={2}>{primary}</Text>
    {secondary ? <Text style={{ fontSize: 12, color: t.fgSecondary, marginTop: 3 }} numberOfLines={2}>{secondary}</Text> : null}
  </Pressable>
);

export const SearchScreen = ({ onClose, onPickBook, onPickPage }) => {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => onChange(() => setTick((n) => n + 1)), []);

  const { books, quotes, pages } = useMemo(() => {
    const term = norm(q.trim());
    if (!term) return { books: [], quotes: [], pages: [] };
    const books = Books.all().filter((b) =>
      norm(b.title).includes(term) || norm((b.authors || []).join(' ')).includes(term),
    );
    const quotes = Quotes.all().filter((qq) =>
      norm(qq.text).includes(term) || norm(qq.memo).includes(term),
    );
    const pages = wikiPages.filter((p) =>
      norm(p.title).includes(term) || norm(p.summary).includes(term) || norm(p.body).includes(term),
    );
    return { books, quotes, pages };
  }, [q, tick]);

  const totalHits = books.length + quotes.length + pages.length;

  return (
    <Inspectable name="SearchScreen" style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ height: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: t.hairline }}>
        <Pressable onPress={onClose} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22, color: t.fg }}>×</Text>
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>검색</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Inspectable name="SearchBar" style={{
          flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10,
          backgroundColor: t.inputBg, borderRadius: 12, marginBottom: 14,
        }}>
          <Text style={{ fontSize: 14, color: t.fgTertiary }}>⌕</Text>
          <TextInput value={q} onChangeText={setQ}
            placeholder="책, 인용, 위키 페이지 검색"
            placeholderTextColor={t.fgTertiary} autoFocus
            style={{ flex: 1, fontSize: 14, color: t.fg, outlineStyle: 'none' }} />
        </Inspectable>

        {!q.trim() ? (
          <Text style={{ textAlign: 'center', color: t.fgTertiary, paddingVertical: 32, fontSize: 12.5 }}>
            제목·저자·인용·위키 페이지를 한 번에 찾아요.
          </Text>
        ) : totalHits === 0 ? (
          <Text style={{ textAlign: 'center', color: t.fgTertiary, paddingVertical: 32, fontSize: 12.5 }}>
            "{q}" 결과 없음
          </Text>
        ) : (
          <>
            {books.length > 0 ? (
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: t.fgSecondary, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 6 }}>책 · {books.length}</Text>
                {books.map((b) => (
                  <Hit key={b.id} label="BOOK" primary={b.title} secondary={(b.authors || []).join(', ')}
                    onPress={() => onPickBook(b.id)} t={t} />
                ))}
              </View>
            ) : null}

            {quotes.length > 0 ? (
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: t.fgSecondary, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 6 }}>인용 · {quotes.length}</Text>
                {quotes.map((qq) => {
                  const book = Books.get(qq.bookId);
                  return (
                    <Hit key={qq.id} label="QUOTE" primary={qq.text}
                      secondary={`${book?.title || '책 미지정'}${qq.page ? ` · p.${qq.page}` : ''}`}
                      onPress={() => qq.bookId && onPickBook(qq.bookId)} t={t} accent={t.accent} />
                  );
                })}
              </View>
            ) : null}

            {pages.length > 0 ? (
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: t.fgSecondary, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 6 }}>위키 페이지 · {pages.length}</Text>
                {pages.map((p) => (
                  <Hit key={p.id} label="WIKI" primary={p.title} secondary={p.summary}
                    onPress={() => onPickPage(p.id)} t={t} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Inspectable>
  );
};
