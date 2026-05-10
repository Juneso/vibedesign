import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { Inspectable } from '../components/Inspectable.jsx';
import { BookCover } from '../components/BookCover.jsx';
import { Books, Quotes } from '../storage.js';
import { useTheme } from '../theme.js';

export const QuoteAddScreen = ({ defaultBookId, onClose }) => {
  const t = useTheme();
  const books = Books.all();
  const [bookId, setBookId] = useState(defaultBookId || books[0]?.id || null);
  const [text, setText] = useState('');
  const [page, setPage] = useState('');
  const [memo, setMemo] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const canSave = !!bookId && !!text.trim() && !saved;
  const onSave = () => {
    if (!canSave) return;
    Quotes.add({ bookId, text, page: page.trim(), memo: memo.trim() });
    setSaved(true);
    setTimeout(onClose, 400);
  };

  if (!books.length) {
    return (
      <Inspectable name="QuoteAddScreen" style={{ flex: 1, backgroundColor: t.bg, padding: 22 }}>
        <View style={{ height: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable onPress={onClose}><Text style={{ fontSize: 22, color: t.fg }}>×</Text></Pressable>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>인용 추가</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.fgSecondary, marginBottom: 4 }}>아직 등록된 책이 없어요</Text>
          <Text style={{ fontSize: 12.5, color: t.fgTertiary }}>먼저 라이브러리에 책을 추가한 뒤 인용을 남겨보세요.</Text>
        </View>
      </Inspectable>
    );
  }

  const cur = Books.get(bookId);

  return (
    <Inspectable name="QuoteAddScreen" style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ height: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: t.hairline }}>
        <Pressable onPress={onClose} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22, color: t.fg }}>×</Text>
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>인용 추가</Text>
        <Pressable onPress={onSave} disabled={!canSave} dataSet={{ rn: 'ModalCta' }}
          style={{
            paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
            backgroundColor: canSave ? t.accent : t.hairline,
          }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: canSave ? '#fff' : t.fgTertiary }}>{saved ? '저장됨' : '저장'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 24, gap: 18 }}>
        <View>
          <Text style={{ fontSize: 11, fontWeight: '600', color: t.fgSecondary, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8 }}>책</Text>
          <Pressable onPress={() => setPickerOpen(true)} dataSet={{ rn: 'BookSelector' }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingHorizontal: 14, paddingVertical: 12,
              borderWidth: 1, borderColor: t.hairline, borderRadius: 10,
            }}>
            <BookCover book={cur} w={36} h={52} radius={3} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: t.fg }}>{cur?.title || '책 선택'}</Text>
              <Text style={{ fontSize: 11.5, color: t.fgTertiary }}>{(cur?.authors || []).join(', ')}</Text>
            </View>
            <Text style={{ color: t.fgTertiary }}>›</Text>
          </Pressable>
        </View>

        <View>
          <Text style={{ fontSize: 11, fontWeight: '600', color: t.fgSecondary, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8 }}>인용</Text>
          <TextInput value={text} onChangeText={setText} multiline placeholder="책의 한 문장을 그대로 옮겨 적어보세요"
            placeholderTextColor={t.fgTertiary}
            style={{ minHeight: 110, fontSize: 14, color: t.fg, padding: 14, borderWidth: 1, borderColor: t.hairline, borderRadius: 10, outlineStyle: 'none' }} />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontWeight: '600', color: t.fgSecondary, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8 }}>페이지 (선택)</Text>
          <TextInput value={page} onChangeText={setPage} keyboardType="numeric" placeholder="예: 142"
            placeholderTextColor={t.fgTertiary}
            style={{ fontSize: 14, color: t.fg, padding: 14, borderWidth: 1, borderColor: t.hairline, borderRadius: 10, outlineStyle: 'none' }} />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontWeight: '600', color: t.fgSecondary, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8 }}>내 메모 (선택)</Text>
          <TextInput value={memo} onChangeText={setMemo} multiline placeholder="이 문장이 마음에 걸린 이유를 짧게 적어보세요"
            placeholderTextColor={t.fgTertiary}
            style={{ minHeight: 70, fontSize: 14, color: t.fg, padding: 14, borderWidth: 1, borderColor: t.hairline, borderRadius: 10, outlineStyle: 'none' }} />
        </View>
      </ScrollView>

      {pickerOpen ? (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', zIndex: 20 }}>
          <Pressable style={{ position: 'absolute', inset: 0 }} onPress={() => setPickerOpen(false)} />
          <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 22, maxHeight: '75%' }}>
            <View style={{ width: 38, height: 4, backgroundColor: t.hairline, borderRadius: 2, alignSelf: 'center', marginBottom: 14 }} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.fg, marginBottom: 10 }}>책 선택</Text>
            <ScrollView>
              {books.map((b) => (
                <Pressable key={b.id} onPress={() => { setBookId(b.id); setPickerOpen(false); }}
                  style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, alignItems: 'center' }}>
                  <BookCover book={b} w={36} h={52} radius={3} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '600', color: t.fg }}>{b.title}</Text>
                    <Text style={{ fontSize: 11.5, color: t.fgTertiary }}>{(b.authors || []).join(', ')}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </Inspectable>
  );
};
