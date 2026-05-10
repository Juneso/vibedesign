import React from 'react';
import { View, Text } from 'react-native';
import { Inspectable } from './Inspectable.jsx';
import { useTheme } from '../theme.js';

export const StatusBar = () => {
  const t = useTheme();
  return (
    <Inspectable name="StatusBar" style={{
      height: 44, paddingHorizontal: 22,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      zIndex: 5,
    }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: t.fg }}>9:41</Text>
      <View style={{ width: 18, height: 12, opacity: 0.85, backgroundColor: 'transparent', flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
        {[3, 5, 8, 10].map((h, i) => (
          <View key={i} style={{ width: 2, height: h, backgroundColor: t.fg, borderRadius: 1 }} />
        ))}
      </View>
    </Inspectable>
  );
};
