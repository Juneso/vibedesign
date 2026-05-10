import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Inspectable } from '../components/Inspectable.jsx';
import { Books, Quotes, onChange } from '../storage.js';
import { currentUser } from '../data.js';
import { useTheme } from '../theme.js';

const Row = ({ label, value, accent }) => {
  const t = useTheme();
  return (
    <Pressable dataSet={{ rn: 'ProfileRow' }} style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 14, borderBottomWidth: 1, borderColor: t.hairline,
    }}>
      <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: t.fgTertiary, opacity: 0.3 }} />
      <Text style={{ flex: 1, fontSize: 14, color: accent ? t.accent : t.fg }}>{label}</Text>
      {value ? <Text style={{ fontSize: 12.5, color: t.fgTertiary }}>{value}</Text> : null}
    </Pressable>
  );
};

export const ProfileScreen = () => {
  const t = useTheme();
  const [books, setBooks] = useState(Books.all());
  const [quotes, setQuotes] = useState(Quotes.all());
  useEffect(() => onChange(() => { setBooks(Books.all()); setQuotes(Quotes.all()); }), []);

  const joined = currentUser.joinedAt.replace('-', '.');

  return (
    <Inspectable name="ProfileScreen" style={{ flex: 1, backgroundColor: t.bg, paddingBottom: 64 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 24 }}>
        <View style={{ paddingTop: 8, paddingBottom: 22 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: t.fg, letterSpacing: -0.5 }}>내정보</Text>
        </View>

        <Inspectable name="ProfileHead" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: t.accent }}>{currentUser.initial}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: t.fg }}>{currentUser.name}</Text>
            <Text style={{ fontSize: 12.5, color: t.fgSecondary, marginTop: 2 }}>{currentUser.handle} · {joined} 가입</Text>
          </View>
        </Inspectable>

        <Inspectable name="StatsRow" style={{
          flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.hairline, paddingVertical: 16,
        }}>
          {[
            { num: books.length, label: '책' },
            { num: quotes.length, label: '인용' },
            { num: 3, label: '위키 세션' },
          ].map((s, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i ? 1 : 0, borderColor: t.hairline }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: t.fg }}>{s.num}</Text>
              <Text style={{ fontSize: 11, color: t.fgSecondary, marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </Inspectable>

        <View style={{ marginTop: 18, borderTopWidth: 1, borderColor: t.hairline }}>
          <Row label="독서 목표" value="월 4권" />
          <Row label="알림" value="켜짐" />
          <Row label="테마" value="자동" />
          <Row label="데이터 백업" value="iCloud" />
          <Row label="도움말" />
          <Row label="로그아웃" accent />
        </View>
      </ScrollView>
    </Inspectable>
  );
};
