import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Inspectable } from './Inspectable.jsx';
import { useTheme } from '../theme.js';

const Item = ({ tab, label, current, onPress, t }) => {
  const active = current === tab;
  return (
    <Pressable onPress={onPress} dataSet={{ rn: 'BNavItem', tab }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 3 }}>
      <View style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: active ? t.accent : t.fgTertiary, opacity: active ? 1 : 0.5 }} />
      <Text style={{ fontSize: 10.5, fontWeight: active ? '700' : '500', color: active ? t.accent : t.fgTertiary }}>{label}</Text>
    </Pressable>
  );
};

export const BottomNav = ({ visible, current, onTab, onFab }) => {
  const t = useTheme();
  if (!visible) return null;
  return (
    <Inspectable name="BottomNav" style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      height: 64, flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.navBg, borderTopWidth: 1, borderColor: t.hairline,
      zIndex: 10,
    }}>
      <Item tab="home" label="홈" current={current} onPress={() => onTab('home')} t={t} />
      <Item tab="library" label="서재" current={current} onPress={() => onTab('library')} t={t} />
      <View style={{ width: 80, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable onPress={onFab} dataSet={{ rn: 'BNavFab' }}
          style={{
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center',
            transform: [{ translateY: -12 }],
            boxShadow: '0 6px 18px rgba(139,58,31,0.35)',
          }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 22 }}>"</Text>
        </Pressable>
      </View>
      <Item tab="profile" label="내정보" current={current} onPress={() => onTab('profile')} t={t} />
      <View style={{ flex: 1 }} />
    </Inspectable>
  );
};
