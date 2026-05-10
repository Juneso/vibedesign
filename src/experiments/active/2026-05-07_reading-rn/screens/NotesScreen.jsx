import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, PanResponder } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Inspectable } from '../components/Inspectable.jsx';
import { wikiPages, wikiLog, wikiGraph, config } from '../data.js';
import { Books } from '../storage.js';
import { useTheme } from '../theme.js';

const KIND_LABEL = { concept: '개념', compare: '비교', meta: '메타', collection: '모음' };

const GraphCanvas = ({ onPickPage }) => {
  const t = useTheme();
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 320, h: 360 });
  const [positions, setPositions] = useState(() => {
    const m = {};
    wikiGraph.nodes.forEach((n) => { m[n.id] = { x: n.x * 320, y: n.y * 360 }; });
    return m;
  });

  // 캔버스 크기 측정 후 노드 좌표 재계산
  const onLayout = (e) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width || 320, h: height || 360 });
    setPositions(() => {
      const m = {};
      wikiGraph.nodes.forEach((n) => { m[n.id] = { x: n.x * (width || 320), y: n.y * (height || 360) }; });
      return m;
    });
  };

  // adjacency for pull-along effect (depth ≤ 2)
  const adj = {};
  wikiGraph.edges.forEach(([a, b]) => {
    (adj[a] ??= new Set()).add(b);
    (adj[b] ??= new Set()).add(a);
  });

  const centerId = (wikiGraph.nodes.find((n) => n.center) || {}).id;

  return (
    <Inspectable name="WikiCanvas" style={{ position: 'relative', width: '100%', height: 360, overflow: 'hidden' }}>
      <View ref={canvasRef} onLayout={onLayout} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {/* edges via SVG (react-native-svg) */}
        <Svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
          {wikiGraph.edges.map(([a, b], i) => {
            const pa = positions[a], pb = positions[b];
            if (!pa || !pb) return null;
            const isCenter = a === centerId || b === centerId;
            return <Line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
              stroke={isCenter ? t.accent : t.hairline}
              strokeOpacity={isCenter ? 0.35 : 1} strokeWidth={1} />;
          })}
        </Svg>
        {wikiGraph.nodes.map((n) => (
          <DraggableNode key={n.id} node={n} positions={positions} setPositions={setPositions}
            adj={adj} size={size} onPick={onPickPage} t={t} />
        ))}
      </View>
    </Inspectable>
  );
};

const DraggableNode = ({ node, positions, setPositions, adj, size, onPick, t }) => {
  const startRef = useRef({ x: 0, y: 0, ox: 0, oy: 0, moved: false });
  // depth map (BFS up to 2)
  const depth = new Map([[node.id, 0]]);
  const queue = [node.id];
  while (queue.length) {
    const cur = queue.shift();
    if (depth.get(cur) >= 2) continue;
    (adj[cur] || []).forEach((nid) => { if (!depth.has(nid)) { depth.set(nid, depth.get(cur) + 1); queue.push(nid); } });
  }

  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      const cur = positions[node.id];
      startRef.current = { ox: cur.x, oy: cur.y, moved: false };
    },
    onPanResponderMove: (_, g) => {
      const dx = g.dx, dy = g.dy;
      if (Math.abs(dx) + Math.abs(dy) > 4) startRef.current.moved = true;
      let nx = startRef.current.ox + dx;
      let ny = startRef.current.oy + dy;
      nx = Math.max(12, Math.min(size.w - 12, nx));
      ny = Math.max(12, Math.min(size.h - 28, ny));
      setPositions((prev) => {
        const next = { ...prev, [node.id]: { x: nx, y: ny } };
        // pull-along neighbors
        depth.forEach((d, nid) => {
          if (d === 0) return;
          const ratio = d === 1 ? 0.06 : 0.025;
          const orig = prev[nid];
          if (!orig) return;
          // 인접 노드 자체 위치는 흔들림으로만 표현 — 누적 방지를 위해 startRef 기준
          // 현재 단순화: 인접 노드 위치는 그대로 두고 시각 반응만 transform으로 못함 → 위치 가볍게 보정
          next[nid] = { x: orig.x + dx * ratio, y: orig.y + dy * ratio };
        });
        return next;
      });
    },
    onPanResponderRelease: () => {
      if (!startRef.current.moved) onPick(node.id);
    },
  })).current;

  const pos = positions[node.id] || { x: 0, y: 0 };
  const isCenter = !!node.center;
  return (
    <View {...responder.panHandlers}
      dataSet={{ rn: 'WikiNode', center: isCenter ? '1' : '0' }}
      style={{
        position: 'absolute',
        left: pos.x - (isCenter ? 7 : 4),
        top: pos.y - (isCenter ? 7 : 4),
        width: isCenter ? 14 : 8, height: isCenter ? 14 : 8, borderRadius: 50,
        backgroundColor: isCenter ? t.accent : t.fg,
        opacity: isCenter ? 1 : 0.85,
      }}>
      <Text style={{
        position: 'absolute', top: '100%', left: '50%',
        transform: [{ translateX: -50 }, { translateY: 7 }],
        fontSize: isCenter ? 12.5 : 11.5,
        fontWeight: isCenter ? '600' : '500',
        color: isCenter ? t.accent : t.fg,
        width: 100, textAlign: 'center',
      }}>{node.label}</Text>
    </View>
  );
};

// 인라인 토큰화 — `[[link]]` 와 `**bold**` 를 분리해 nested Text 자식 배열 반환.
// onLinkPress(title)이 주어지면 [[link]]를 클릭 가능한 Text로 렌더.
const renderInline = (text, t, onLinkPress) => {
  if (!text) return [text];
  const tokens = [];
  const re = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*/g;
  let last = 0; let m; let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push(<Text key={`s-${i++}`}>{text.slice(last, m.index)}</Text>);
    if (m[1] != null) {
      const title = m[1];
      tokens.push(
        <Text key={`l-${i++}`}
          onPress={onLinkPress ? () => onLinkPress(title) : undefined}
          style={{ color: t.accent, fontWeight: '500', textDecorationLine: onLinkPress ? 'underline' : 'none' }}
          dataSet={{ rn: 'WikiLink' }}>
          {title}
        </Text>,
      );
    } else if (m[2] != null) {
      tokens.push(<Text key={`b-${i++}`} style={{ fontWeight: '700' }}>{m[2]}</Text>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push(<Text key={`s-${i++}`}>{text.slice(last)}</Text>);
  return tokens.length ? tokens : [text];
};

const renderMarkdown = (md, t, onLinkPress) => {
  // 간단한 마크다운: 헤더/blockquote/list/wikilink/bold
  const lines = md.split('\n');
  const out = [];
  let inList = false;
  let listItems = [];
  const flushList = () => {
    if (inList) {
      out.push(<View key={`ul-${out.length}`} style={{ marginVertical: 8, paddingLeft: 20 }}>
        {listItems.map((li, i) => (
          <Text key={i} style={{ fontSize: 14.5, lineHeight: 24, color: t.fg }}>• {renderInline(li, t, onLinkPress)}</Text>
        ))}
      </View>);
      inList = false; listItems = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.startsWith('# ')) { flushList(); out.push(<Text key={i} style={{ fontSize: 24, fontWeight: '700', color: t.fg, marginVertical: 6 }}>{renderInline(ln.slice(2), t, onLinkPress)}</Text>); }
    else if (ln.startsWith('## ')) { flushList(); out.push(<Text key={i} style={{ fontSize: 11.5, fontWeight: '600', color: t.fgSecondary, letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 14, marginBottom: 4 }}>{ln.slice(3)}</Text>); }
    else if (ln.startsWith('> ')) { flushList(); out.push(<Text key={i} style={{ marginVertical: 8, paddingLeft: 14, borderLeftWidth: 2, borderColor: t.accent, fontSize: 14, color: t.fg, opacity: 0.92 }}>{renderInline(ln.slice(2), t, onLinkPress)}</Text>); }
    else if (ln.startsWith('- ')) { if (!inList) inList = true; listItems.push(ln.slice(2)); }
    else if (ln.startsWith('|')) { /* 테이블 단순 무시 */ }
    else if (ln.trim()) { flushList(); out.push(<Text key={i} style={{ fontSize: 14.5, lineHeight: 24, color: t.fg, marginBottom: 8 }}>{renderInline(ln, t, onLinkPress)}</Text>); }
    else flushList();
  }
  flushList();
  return out;
};

// title → wiki page id 매핑 (위키 페이지 간 [[link]] 클릭 시 navigate 용)
const findPageByTitle = (title) => wikiPages.find((p) => p.title === title || p.title.replace(/\s+/g, '') === title.replace(/\s+/g, ''));

export const NotesScreen = ({ bookId, onBack, onPickPage }) => {
  const t = useTheme();
  const book = Books.get(bookId);
  const sorted = [...wikiPages].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));

  return (
    <Inspectable name="NotesScreen" style={{ flex: 1, backgroundColor: t.bg }}>
      <Inspectable name="NotesTopbar" style={{
        height: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Pressable onPress={onBack} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22, color: t.fg }}>‹</Text>
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>{book?.title || ''} 위키</Text>
          <Text style={{ fontSize: 10.5, color: t.fgSecondary }}>방금 세션 반영 · 페이지 갱신됨</Text>
        </View>
        <View style={{ width: 36 }} />
      </Inspectable>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 40 }}>
        <Inspectable name="WikiCard" style={{ paddingTop: 14, paddingBottom: 18, borderBottomWidth: 1, borderColor: t.hairline }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: t.accent, letterSpacing: 0.7 }}>● GRAPH VIEW</Text>
            <Text style={{ fontSize: 11, color: t.fgTertiary }}>노드를 끌어 옮겨보세요</Text>
          </View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.fgSecondary, marginBottom: 14 }}>페이지 연결</Text>
          <GraphCanvas onPickPage={onPickPage} />
        </Inspectable>

        <Inspectable name="SessionCard" style={{ paddingVertical: 16, borderBottomWidth: 1, borderColor: t.hairline }}>
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: t.accent, letterSpacing: 0.7, marginBottom: 8 }}>● 이번 세션 정리</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.fgSecondary, marginBottom: 10 }}>방금 대화에서 위키가 이렇게 바뀌었어요</Text>
          {[
            ['+ 새 페이지', '알고리즘 권력'],
            ['~ 갱신', '정보 네트워크 — 신경계 비유 추가'],
            ['~ 갱신', '관료제 vs 신화 — AI 시대 항목 보강'],
            ['↔ 연결', '알고리즘 권력 ↔ 자기수정'],
          ].map(([k, v], i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, marginVertical: 4 }}>
              <Text style={{ fontSize: 10.5, fontWeight: '600', color: t.fgTertiary, letterSpacing: 0.5, width: 64 }}>{k}</Text>
              <Text style={{ fontSize: 13, color: t.fg, flex: 1 }}>{v}</Text>
            </View>
          ))}
        </Inspectable>

        <View style={{ marginTop: 22, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: t.fgSecondary, letterSpacing: 0.7, textTransform: 'uppercase' }}>내 페이지</Text>
          <Text style={{ fontSize: 11, color: t.fgTertiary }}>{wikiPages.length}개</Text>
        </View>
        <Inspectable name="WikiPages" style={{ borderTopWidth: 1, borderColor: t.hairline }}>
          {sorted.map((p) => (
            <Pressable key={p.id} onPress={() => onPickPage(p.id)} dataSet={{ rn: 'WikiPageItem' }}
              style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: t.hairline }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: t.fgTertiary, letterSpacing: 0.6, textTransform: 'uppercase' }}>{KIND_LABEL[p.kind] || p.kind}</Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: t.fg }}>{p.title}</Text>
                {p.isNew ? <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#fff', backgroundColor: t.accent, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 }}>NEW</Text> : null}
                {p.pinned ? <Text style={{ fontSize: 11, opacity: 0.7 }}>📌</Text> : null}
              </View>
              <Text style={{ fontSize: 12.5, lineHeight: 18, color: t.fgSecondary, marginBottom: 6 }}>{p.summary}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {p.links.map((l) => {
                  const target = findPageByTitle(l);
                  return (
                    <Pressable key={l} dataSet={{ rn: 'WikiLink' }}
                      onPress={(e) => { e.stopPropagation?.(); if (target) onPickPage(target.id); }}
                      style={{ }}>
                      <Text style={{ fontSize: 11, color: t.accent, textDecorationLine: target ? 'underline' : 'none' }}>[[{l}]]</Text>
                    </Pressable>
                  );
                })}
                <Text style={{ fontSize: 11, color: t.fgTertiary, marginLeft: 'auto' }}>{p.updated}</Text>
              </View>
            </Pressable>
          ))}
        </Inspectable>

        <View style={{ marginTop: 22, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: t.fgSecondary, letterSpacing: 0.7, textTransform: 'uppercase' }}>로그</Text>
          <Text style={{ fontSize: 11, color: t.fgTertiary }}>log.md</Text>
        </View>
        <View style={{ borderTopWidth: 1, borderColor: t.hairline }}>
          {wikiLog.map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: t.hairline }}
              dataSet={{ rn: 'WikiLogItem' }}>
              <Text style={{ fontSize: 12.5, color: t.fgTertiary }}>{l.ts}</Text>
              <Text style={{ fontSize: 10, fontWeight: '600', color: t.fgTertiary, letterSpacing: 0.6, width: 56, textTransform: 'uppercase' }}>{l.kind}</Text>
              <Text style={{ fontSize: 12.5, color: t.fg, flex: 1 }}>{l.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </Inspectable>
  );
};

export const PageDetailScreen = ({ pageId, onBack, onPickPage }) => {
  const t = useTheme();
  const page = wikiPages.find((p) => p.id === pageId);
  const onLinkPress = (title) => {
    const target = findPageByTitle(title);
    if (target && onPickPage) onPickPage(target.id);
  };
  return (
    <Inspectable name="PageDetailScreen" style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{
        height: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Pressable onPress={onBack} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22, color: t.fg }}>‹</Text>
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>페이지</Text>
          <Text style={{ fontSize: 10.5, color: t.fgSecondary }}>위키</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 40 }}>
        {page ? renderMarkdown(page.body, t, onLinkPress) : <Text style={{ color: t.fg }}>페이지 없음</Text>}
      </ScrollView>
    </Inspectable>
  );
};
