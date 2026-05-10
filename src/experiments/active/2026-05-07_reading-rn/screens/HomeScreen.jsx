import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable } from 'react-native';
import { Inspectable } from '../components/Inspectable.jsx';
import { Books, Quotes, onChange, formatRelative } from '../storage.js';
import { useTheme } from '../theme.js';

import { BookCover as Cover } from '../components/BookCover.jsx';

export const HomeScreen = ({ onChat, onNotes, onQuoteAdd, onSwitchTab, onOpenBook, onOpenSearch }) => {
  const t = useTheme();
  const [books, setBooks] = useState(Books.all());
  const [quotes, setQuotes] = useState(Quotes.all());
  useEffect(() => onChange(() => { setBooks(Books.all()); setQuotes(Quotes.all()); }), []);

  const cur = books.find((b) => b.isCurrent) || books[0];
  const recent = quotes.slice(0, 5);

  return (
    <Inspectable name="HomeScreen" style={{ flex: 1, backgroundColor: t.bg, paddingBottom: 64 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <Inspectable name="TabHeader" style={{ paddingTop: 8, paddingBottom: 22, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: t.fg, letterSpacing: -0.5 }}>오늘의 독서</Text>
            <Text style={{ marginTop: 6, fontSize: 14, color: t.fgSecondary }}>반가워요. 어떤 페이지를 펼쳐볼까요?</Text>
          </View>
          {onOpenSearch ? (
            <Pressable onPress={onOpenSearch} dataSet={{ rn: 'IconBtnSearch' }}
              style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 18, color: t.fg }}>⌕</Text>
            </Pressable>
          ) : null}
        </Inspectable>

        <SectionHead title="지금 읽는 책" />
        {cur ? (
          <Inspectable name="CurrentBook" style={{ flexDirection: 'row', gap: 16 }}>
            <Pressable onPress={() => onOpenBook?.(cur.id)} dataSet={{ rn: 'CurrentBookCover' }}>
              <Cover book={cur} w={96} h={138} />
            </Pressable>
            <View style={{ flex: 1, justifyContent: 'center', gap: 6 }}>
              <Pressable onPress={() => onOpenBook?.(cur.id)}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: t.fg, letterSpacing: -0.4 }}>{cur.title}</Text>
                <Text style={{ fontSize: 13, color: t.fgSecondary, marginTop: 4 }}>{(cur.authors || []).join(', ')}</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Pill label="메모 시작" onPress={() => onChat(cur.id)} solid />
                <Pill label="위키 보기" onPress={() => onNotes(cur.id)} />
              </View>
            </View>
          </Inspectable>
        ) : (
          <EmptyHint title="아직 등록된 책이 없어요" text="서재 탭에서 책을 추가해보세요." />
        )}

        <SectionHead title="최근 인용" linkLabel="+ 추가" onLink={() => onQuoteAdd()} />
        {recent.length === 0 ? (
          <EmptyHint title="아직 저장된 인용이 없어요" text="아래 + 버튼으로 마음에 드는 문장을 저장해보세요." />
        ) : (
          <Inspectable name="RecentQuotes" style={{ borderTopWidth: 1, borderColor: t.hairline }}>
            {recent.map((q) => {
              const book = books.find((b) => b.id === q.bookId);
              return (
                <Pressable key={q.id} onPress={() => q.bookId && onOpenBook?.(q.bookId)}
                  style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: t.hairline }} dataSet={{ rn: 'RecentQuoteItem' }}>
                  <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 21, color: t.fg, marginBottom: 6 }}>{q.text}</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '600', color: t.accent }}>{book?.title || '책 미지정'}</Text>
                    {q.page ? <Text style={{ fontSize: 11.5, color: t.fgTertiary }}>p.{q.page}</Text> : null}
                    <Text style={{ fontSize: 11.5, color: t.fgTertiary }}>{formatRelative(q.createdAt)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </Inspectable>
        )}

        <SectionHead title="서재" linkLabel="전체 보기" onLink={() => onSwitchTab('library')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -22 }}
          contentContainerStyle={{ paddingHorizontal: 22, paddingVertical: 4, gap: 14 }}>
          {books.length <= 1 ? (
            <Pressable onPress={() => onSwitchTab('library')} style={{
              width: 120, height: 124, borderRadius: 6, borderWidth: 1, borderColor: t.hairline, borderStyle: 'dashed',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 12, color: t.fgTertiary }}>+ 책 추가</Text>
            </Pressable>
          ) : (
            books.map((b) => (
              <Pressable key={b.id} onPress={() => onOpenBook?.(b.id)} dataSet={{ rn: 'ShelfItem' }} style={{ width: 84 }}>
                <Cover book={b} w={84} h={124} />
                <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: '600', marginTop: 8, color: t.fg }}>{b.title}</Text>
                <Text style={{ fontSize: 11, color: t.fgTertiary, marginTop: 2 }}>{(b.authors || []).join(', ')}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </ScrollView>
    </Inspectable>
  );
};

const SectionHead = ({ title, linkLabel, onLink }) => {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 22, marginBottom: 12 }}
      dataSet={{ rn: 'SectionHead' }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: t.fgSecondary, letterSpacing: 0.7, textTransform: 'uppercase' }}>{title}</Text>
      {linkLabel ? <Pressable onPress={onLink}><Text style={{ fontSize: 12, fontWeight: '600', color: t.accent }}>{linkLabel}</Text></Pressable> : null}
    </View>
  );
};

const Pill = ({ label, onPress, solid }) => {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} dataSet={{ rn: 'Pill' }} style={{
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
      backgroundColor: solid ? t.accent : 'transparent',
      borderWidth: solid ? 0 : 1, borderColor: t.hairline,
    }}>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: solid ? '#fff' : t.fg }}>{label}</Text>
    </Pressable>
  );
};

const EmptyHint = ({ title, text }) => {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: 12 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: t.fgSecondary, marginBottom: 4 }}>{title}</Text>
      <Text style={{ fontSize: 12.5, lineHeight: 19, color: t.fgTertiary }}>{text}</Text>
    </View>
  );
};
