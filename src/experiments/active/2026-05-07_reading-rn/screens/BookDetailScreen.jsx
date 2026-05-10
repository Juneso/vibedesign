// 책 허브 — 메타데이터, 진도율, 그 책의 인용/메모 집계, 챗봇·위키 진입
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal } from 'react-native';
import { Inspectable } from '../components/Inspectable.jsx';
import { BookCover } from '../components/BookCover.jsx';
import { Books, Quotes, onChange, formatRelative } from '../storage.js';
import { useTheme } from '../theme.js';

const ProgressBar = ({ pct, t }) => (
  <View style={{ height: 6, borderRadius: 3, backgroundColor: t.hairline, overflow: 'hidden' }} dataSet={{ rn: 'ProgressBar' }}>
    <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', backgroundColor: t.accent }} />
  </View>
);

const PageInputModal = ({ open, book, onClose, onSave, t }) => {
  const [total, setTotal] = useState(String(book?.pageCount || ''));
  const [current, setCurrent] = useState(String(book?.currentPage || ''));
  useEffect(() => {
    setTotal(String(book?.pageCount || ''));
    setCurrent(String(book?.currentPage || ''));
  }, [book?.id, open]);
  if (!open) return null;
  const save = () => {
    onSave({
      pageCount: parseInt(total, 10) || 0,
      currentPage: parseInt(current, 10) || 0,
    });
    onClose();
  };
  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 30 }}>
      <Pressable style={{ position: 'absolute', inset: 0 }} onPress={onClose} />
      <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 22 }} dataSet={{ rn: 'PageInputSheet' }}>
        <View style={{ width: 38, height: 4, backgroundColor: t.hairline, borderRadius: 2, alignSelf: 'center', marginBottom: 14 }} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: t.fg, marginBottom: 14 }}>진도 입력</Text>
        <Text style={{ fontSize: 11, color: t.fgSecondary, marginBottom: 6 }}>총 페이지</Text>
        <TextInput value={total} onChangeText={setTotal} keyboardType="numeric"
          style={{ fontSize: 14, padding: 12, color: t.fg, borderWidth: 1, borderColor: t.hairline, borderRadius: 10, marginBottom: 12, outlineStyle: 'none' }} />
        <Text style={{ fontSize: 11, color: t.fgSecondary, marginBottom: 6 }}>현재 페이지</Text>
        <TextInput value={current} onChangeText={setCurrent} keyboardType="numeric"
          style={{ fontSize: 14, padding: 12, color: t.fg, borderWidth: 1, borderColor: t.hairline, borderRadius: 10, marginBottom: 18, outlineStyle: 'none' }} />
        <Pressable onPress={save} style={{ paddingVertical: 12, borderRadius: 999, backgroundColor: t.accent, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>저장</Text>
        </Pressable>
      </View>
    </View>
  );
};

export const BookDetailScreen = ({ bookId, onBack, onChat, onNotes, onQuoteAdd }) => {
  const t = useTheme();
  const [tick, setTick] = useState(0);
  const [pageModal, setPageModal] = useState(false);
  useEffect(() => onChange(() => setTick((n) => n + 1)), []);

  const book = Books.get(bookId);
  const quotes = useMemo(() => Quotes.byBook(bookId), [bookId, tick]);

  if (!book) {
    return (
      <Inspectable name="BookDetailScreen" style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.fgSecondary }}>책을 찾을 수 없어요</Text>
      </Inspectable>
    );
  }

  const totalPages = book.pageCount || 0;
  const curPage = book.currentPage || 0;
  const pct = totalPages > 0 ? (curPage / totalPages) * 100 : 0;
  const status = totalPages === 0 ? '쪽수 미설정'
    : curPage === 0 ? '읽기 전'
    : curPage >= totalPages ? '완독'
    : `${curPage}/${totalPages}p`;

  const onSavePages = (patch) => Books.update(bookId, patch);

  return (
    <Inspectable name="BookDetailScreen" style={{ flex: 1, backgroundColor: t.bg }}>
      {/* topbar */}
      <View style={{ height: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={onBack} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22, color: t.fg }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 13, fontWeight: '600', color: t.fg }} numberOfLines={1}>{book.title}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 80 }}>
        {/* hero */}
        <Inspectable name="BookHero" style={{ flexDirection: 'row', gap: 18, paddingTop: 6, paddingBottom: 18 }}>
          <BookCover book={book} w={110} h={158} />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: t.fg, letterSpacing: -0.4 }} numberOfLines={3}>{book.title}</Text>
            <Text style={{ fontSize: 13, color: t.fgSecondary, marginTop: 6 }}>{(book.authors || []).join(', ')}</Text>
            {book.publisher ? <Text style={{ fontSize: 11.5, color: t.fgTertiary, marginTop: 4 }}>{book.publisher}{book.publishedDate ? ` · ${String(book.publishedDate).slice(0, 4)}` : ''}</Text> : null}
          </View>
        </Inspectable>

        {/* progress */}
        <Inspectable name="ProgressCard" style={{ paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.hairline, marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: t.fgSecondary, letterSpacing: 0.7, textTransform: 'uppercase' }}>진도</Text>
            <Pressable onPress={() => setPageModal(true)}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: t.accent }}>{totalPages === 0 ? '+ 쪽수 입력' : '수정'}</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: t.fg, letterSpacing: -0.4 }}>{totalPages > 0 ? `${pct.toFixed(0)}%` : '—'}</Text>
            <Text style={{ fontSize: 12, color: t.fgSecondary }}>{status}</Text>
          </View>
          {totalPages > 0 ? <ProgressBar pct={pct} t={t} /> : null}
        </Inspectable>

        {/* actions */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 22 }}>
          <Pressable onPress={() => onChat(bookId)} dataSet={{ rn: 'BookActionChat' }}
            style={{ flex: 1, paddingVertical: 12, borderRadius: 999, backgroundColor: t.accent, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>메모 시작</Text>
          </Pressable>
          <Pressable onPress={() => onNotes(bookId)} dataSet={{ rn: 'BookActionWiki' }}
            style={{ flex: 1, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: t.hairline, alignItems: 'center' }}>
            <Text style={{ color: t.fg, fontSize: 13, fontWeight: '600' }}>위키 보기</Text>
          </Pressable>
        </View>

        {/* quotes for this book */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: t.fgSecondary, letterSpacing: 0.7, textTransform: 'uppercase' }}>이 책의 인용</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 11, color: t.fgTertiary }}>{quotes.length}개</Text>
            <Pressable onPress={() => onQuoteAdd(bookId)}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: t.accent }}>+ 추가</Text>
            </Pressable>
          </View>
        </View>

        {quotes.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: t.fgTertiary, paddingVertical: 14 }}>아직 저장된 인용이 없어요. 마음에 걸린 문장을 옮겨놓아보세요.</Text>
        ) : (
          <Inspectable name="BookQuoteList" style={{ borderTopWidth: 1, borderColor: t.hairline }}>
            {quotes.map((q) => (
              <View key={q.id} dataSet={{ rn: 'BookQuoteItem' }}
                style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: t.hairline }}>
                <Text style={{ fontSize: 14, lineHeight: 22, color: t.fg, marginBottom: 6 }}>{q.text}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {q.page ? <Text style={{ fontSize: 11.5, fontWeight: '600', color: t.accent }}>p.{q.page}</Text> : null}
                  <Text style={{ fontSize: 11.5, color: t.fgTertiary }}>{formatRelative(q.createdAt)}</Text>
                </View>
                {q.memo ? <Text style={{ fontSize: 12.5, lineHeight: 18, color: t.fgSecondary, marginTop: 6, fontStyle: 'italic' }}>{q.memo}</Text> : null}
              </View>
            ))}
          </Inspectable>
        )}
      </ScrollView>

      <PageInputModal open={pageModal} book={book} onClose={() => setPageModal(false)} onSave={onSavePages} t={t} />
    </Inspectable>
  );
};
