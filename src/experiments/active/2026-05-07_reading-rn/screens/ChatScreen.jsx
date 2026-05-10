import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Animated } from 'react-native';
import { Inspectable } from '../components/Inspectable.jsx';
import { Books, Quotes } from '../storage.js';
import { config, openingPrompts, quickReplies, aiReplies, quoteReply } from '../data.js';
import { useTheme } from '../theme.js';

// RN-호환 타이핑 텍스트: 전체 문자열을 한 번에 페이드인. 글자 단위 stagger는 네이티브에서 비용↑ → 단순화.
const TypingText = ({ text, t }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: Math.min(600, Math.max(200, text.length * config.chat.typingMsPerChar)),
      useNativeDriver: true,
    }).start();
  }, [text, opacity]);
  return (
    <Animated.Text style={{ fontSize: 16, lineHeight: 22, color: t.fg, opacity, letterSpacing: -0.5 }}>
      {text}
    </Animated.Text>
  );
};

export const ChatScreen = ({ bookId, onClose, onEndToNotes }) => {
  const t = useTheme();
  const book = Books.get(bookId);
  const [messages, setMessages] = useState([]);
  const [phase, setPhase] = useState('greeting');
  const [suggestions, setSuggestions] = useState(null);
  const [input, setInput] = useState('');
  const aiIdxRef = useRef(0);
  const scrollRef = useRef(null);

  const append = (role, text, meta) => setMessages((arr) => [...arr, { role, text, meta, ts: Date.now() + Math.random() }]);

  useEffect(() => {
    let cancelled = false;
    setTimeout(() => {
      if (cancelled) return;
      append('ai', openingPrompts.greeting);
      const dur = openingPrompts.greeting.length * config.chat.typingMsPerChar;
      setTimeout(() => {
        if (cancelled) return;
        append('ai', openingPrompts.askWhy);
        setPhase('askWhy');
        setSuggestions(quickReplies.why);
      }, dur + 250);
    }, config.chat.seedDelayMs);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd?.({ animated: true }));
  }, [messages, suggestions]);

  const send = (text) => {
    if (!text?.trim()) return;
    append('user', text);
    setSuggestions(null);
    handleReply(text);
  };

  const handleReply = (text) => {
    if (phase === 'askWhy') {
      setTimeout(() => {
        const ack = openingPrompts.ackWhy({ why: text });
        append('ai', ack, { savedTo: ['내가 이 책을 읽는 이유'] });
        const dur = ack.length * config.chat.typingMsPerChar;
        setTimeout(() => {
          append('ai', openingPrompts.askGoal);
          setPhase('askGoal');
          setSuggestions(quickReplies.goal);
        }, dur + 250);
      }, config.chat.aiReplyDelayMs);
      return;
    }
    if (phase === 'askGoal') {
      setTimeout(() => {
        const ack = openingPrompts.ackGoal({ goal: text });
        append('ai', ack, { savedTo: ['이 책에서 얻고 싶은 것'] });
        const dur = ack.length * config.chat.typingMsPerChar;
        setTimeout(() => { append('ai', openingPrompts.startMemo); setPhase('free'); }, dur + 250);
      }, config.chat.aiReplyDelayMs);
      return;
    }
    setTimeout(() => {
      if (text.length > 80) {
        const sentences = text.split(/(?<=[.다요죠임함])\s+/).filter((s) => s.trim().length > 12);
        const mid = sentences[Math.floor(sentences.length / 2)] || sentences[0] || text.slice(0, 80);
        const excerpt = mid.length > 120 ? mid.slice(0, 120) + '…' : mid;
        append('ai', quoteReply({ excerpt }), { savedTo: ['인용'] });
        Quotes.add({ bookId, text, page: '', memo: '' });
        return;
      }
      const reply = aiReplies[aiIdxRef.current % aiReplies.length];
      aiIdxRef.current++;
      append('ai', reply.text, reply.saved ? { savedTo: reply.saved } : undefined);
    }, config.chat.aiReplyDelayMs);
  };

  return (
    <Inspectable name="ChatScreen" style={{
      flex: 1,
      // 웜톤 배경 — RN에는 radial-gradient 없음. 단색으로 대체. (필요시 expo-linear-gradient + absolute fill로 흉내)
      backgroundColor: '#FBF8F6',
    }}>
      {/* topbar */}
      <Inspectable name="ChatTopbar" style={{
        height: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Pressable onPress={onClose} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22, color: t.fg }}>×</Text>
        </Pressable>
        <View style={{ flex: 1, paddingLeft: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: t.fg }}>{book?.title || '메모'} 세션</Text>
          <Text style={{ fontSize: 11, color: t.fgSecondary }}>위키에 자동 저장돼요</Text>
        </View>
        <Pressable onPress={onEndToNotes} dataSet={{ rn: 'EndBtn' }}
          style={{
            paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
          }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: t.fg }}>대화 종료</Text>
        </Pressable>
      </Inspectable>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ gap: 22 }}>
          {messages.map((m) => (
            <Inspectable key={m.ts} name={m.role === 'ai' ? 'MsgAI' : 'MsgUser'}
              style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role === 'ai' ? (
                <View style={{ width: '100%' }}>
                  <TypingText text={m.text} t={t} />
                  {m.meta?.savedTo?.length ? (
                    <Text style={{ fontSize: 11, color: t.fgSecondary, marginTop: 6 }}>
                      ✓ 위키 저장됨 · {m.meta.savedTo.join(' · ')}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View style={{
                  maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18,
                  backgroundColor: t.pillBg, borderWidth: 1, borderColor: t.pillBorder,
                }}>
                  <Text style={{ fontSize: 14.5, lineHeight: 22, color: t.pillFg }}>{m.text}</Text>
                </View>
              )}
            </Inspectable>
          ))}
        </View>
      </ScrollView>

      {suggestions ? (
        <Inspectable name="ChatSuggestions" style={{ alignItems: 'flex-end', gap: 8, paddingHorizontal: 22, paddingBottom: 10 }}>
          {suggestions.map((s) => (
            <Pressable key={s} onPress={() => send(s)} dataSet={{ rn: 'SuggestionChip' }} style={{
              paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
              backgroundColor: t.pillBg, borderWidth: 1, borderColor: t.pillBorder, maxWidth: '80%',
            }}>
              <Text style={{ fontSize: 13.5, fontWeight: '500', color: t.pillFg }}>{s}</Text>
            </Pressable>
          ))}
        </Inspectable>
      ) : null}

      <Inspectable name="ChatInputBar" style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 14, paddingTop: 8, paddingBottom: 18,
      }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, color: t.fg }}>+</Text>
        </View>
        <View style={{
          flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingLeft: 18, paddingRight: 6, paddingVertical: 4,
          backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', borderRadius: 999,
        }}>
          <TextInput value={input} onChangeText={setInput}
            onSubmitEditing={() => { send(input); setInput(''); }}
            placeholder="이 책에 대해 적어보세요"
            placeholderTextColor={t.fgTertiary}
            style={{ flex: 1, fontSize: 14.5, paddingVertical: 8, color: t.fg }} />
          <Pressable onPress={() => { send(input); setInput(''); }} dataSet={{ rn: 'ChatSend' }}
            style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, color: t.fgSecondary }}>→</Text>
          </Pressable>
        </View>
      </Inspectable>
    </Inspectable>
  );
};
