import React, { useState, useRef, useEffect, useMemo } from 'react';
import data from '../lib/mindmaps.json';

// 8권 마인드맵(책→테마→키워드)을 force-directed 그래프로 한 페이지에 통합.
// - 최상위=책 제목, 깊이 깊을수록 opacity 감소
// - 직선 엣지, 3종 라인(책↔1뎁스 / 상위↔하위 / 책 간 유사개념) 디자인 구분
// - 화면상 6pt 미만 텍스트는 숨김(노드는 유지)

const W = 1500, H = 1050;
const MIN_TEXT_PX = 16; // 이 픽셀보다 작아지는 라벨은 숨김

// 책마다 H(색상)만 다르게 — 깊이(책/테마/키워드)는 같은 hue 안에서 S/L·opacity로 구분.
const BASE_HUE = 25;          // 시작 색상(기존 주황 계열)
const HUE_STEP = 45;          // 책당 H 간격 (8권 → 360 한 바퀴)
const bookHue = (i) => Math.round((BASE_HUE + i * HUE_STEP) % 360);
const hsl = (h, s, l) => `hsl(${h} ${s}% ${l}%)`;
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  const hx = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + hx(r) + hx(g) + hx(b);
}

const NODE_COLOR = '#A5AFA9';   // 개념(테마/키워드) 통일 색
const BOOK_COLOR = '#FF6600';   // 책 제목 노드 색
const EDGE_COLOR = '#000000';   // 라인 색
const EDGE_OPACITY = 0.1;       // 라인 불투명도
const NODE_R = 6;               // 모든 노드 크기 통일
const KIND = {
  book:   { color: BOOK_COLOR, r: NODE_R, op: 1,   fs: 21, fw: 700 }, // 책 제목 노드
  branch: { color: NODE_COLOR, r: NODE_R, op: 1,   fs: 11, fw: 500 }, // 테마(1뎁스)
  leaf:   { color: NODE_COLOR, r: NODE_R, op: 0.5, fs: 9,  fw: 400 }, // 키워드(2뎁스) — 오퍼시티 절반
};

function hexToHsl(hex) {
  let r = 0, g = 0, b = 0; const m = hex.replace('#', '');
  r = parseInt(m.slice(0, 2), 16) / 255; g = parseInt(m.slice(2, 4), 16) / 255; b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// 노드별 결정적 난수 [0,1) — 불규칙성 부여(매번 같은 값)
const rand = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; };
// 꽃 개화 곡선(번들→벌어짐): 줄기를 밑동에서 "부모 성장방향(g→p)"으로 묶어 출발시킨 뒤 자식으로 벌린다.
// 제어점을 부모 접선 위에만 두면 → 출발은 수직 번들, 끝(tip)은 바깥을 향해 벌어져 분수/꽃 형태가 된다.
// (측면 밀기를 빼서 끝이 안쪽으로 말리지 않게 함.)
function petalCtrl(px, py, bx, by, gx, gy, key) {
  let ux = px - gx, uy = py - gy; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul; // 부모 성장방향(접선)
  const len = Math.hypot(bx - px, by - py) || 1;
  const d = len * (0.38 + 0.12 * rand(key)); // 접선 진행 길이 = 번들 정도(노드마다 미세 차이). 과하면 tip이 말려서 0.5 미만 유지.
  return { cx: px + ux * d, cy: py + uy * d };
}
const quad = (ax, ay, cx, cy, bx, by) => `M ${ax} ${ay} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${bx} ${by}`;
// 베이스 색(책 원색) → 종류별 색 파생: 책=원색 / 테마=어둡게 / 키워드=밝게
function nodeColor(baseHex, kind) {
  const c = hexToHsl(baseHex);
  if (kind === 'branch') return hsl(c.h, c.s, clamp(c.l - 12, 18, 88));
  if (kind === 'leaf') return hsl(c.h, clamp(c.s - 8, 0, 100), clamp(c.l + 14, 0, 90));
  return hsl(c.h, c.s, c.l); // book
}
// 책 간 유사선만 중립색
const CROSS_LINE = { stroke: '#94a3b8', width: 1.1, opacity: 0.55, dash: '5 4' };
function edgeStyle(e, byId, colors) {
  if (e.kind === 'cross') return CROSS_LINE;
  const bi = byId[e.a]?.book ?? 0;
  const c = hexToHsl(colors[bi] || '#888888');
  return e.kind === 'main'
    ? { stroke: hsl(c.h, c.s, clamp(c.l - 14, 16, 80)), width: 1.6, opacity: 0.85, dash: null }  // 책↔테마: 어두운 굵은선
    : { stroke: hsl(c.h, clamp(c.s - 10, 0, 100), clamp(c.l + 10, 0, 85)), width: 0.9, opacity: 0.7, dash: null }; // 테마↔키워드
}
// 사용자가 고른 책별 색 (기본값)
const BOOK_COLORS = {
  '돈으로 살 수 없는 것들': '#f9bf95',
  '그리스인 조르바': '#99b607',
  '디자인의 디자인': '#a0c99c',
  '무의미의 축제': '#9fd6c3',
  '디자인과 인간 심리': '#5299cb',
  '디자인 미학': '#aea4e5',
  '욕망의 사물, 디자인의 사회사': '#d59090',
  '미래세상의 디자인': '#cf819b',
};
const defaultColor = (i, title) => BOOK_COLORS[title] || hslToHex(bookHue(i), KIND.book.s, KIND.book.l);
const LS_KEY = 'bookwiki-0621-colorsV2';

const STOP = new Set(['디자인','디자이너','미래','세상','관계','문제','중심','방법','개념','사물','사회','역할','의미','이론','특징','대한','위한','통한']);
function tokens(s) {
  return s.replace(/[(),·:\/]/g, ' ').split(/\s+/)
    .map(w => w.replace(/(으로서|으로|에서|에게|와의|과의|와|과|의|을|를|은|는|이|가|들|적|성)$/g, ''))
    .filter(w => w.length >= 2 && !STOP.has(w));
}

function buildGraph() {
  const nodes = [], edges = [];
  const concepts = []; // {id, book, toks}
  (data.books || []).forEach((b, bi) => {
    const bid = `bk${bi}`;
    nodes.push({ id: bid, kind: 'book', label: b.center?.name || b.title, book: bi });
    (b.branches || []).forEach((br, ri) => {
      const rid = `${bid}-r${ri}`;
      nodes.push({ id: rid, kind: 'branch', label: br.name, book: bi });
      edges.push({ a: bid, b: rid, kind: 'main' });
      concepts.push({ id: rid, book: bi, toks: tokens(br.name) });
      (br.leaves || []).forEach((lf, li) => {
        const lid = `${rid}-l${li}`;
        nodes.push({ id: lid, kind: 'leaf', label: lf, book: bi });
        edges.push({ a: rid, b: lid, kind: 'sub' });
        concepts.push({ id: lid, book: bi, toks: tokens(lf) });
      });
    });
  });
  // ③ 책 간 유사개념 (타이트):
  //  - 정확히 두 책만 공유하는 토큰 (3권 이상 공유하는 범용어 hub 제외)
  //  - 전체 개념 중 3회 이하만 등장하는 희소·변별 토큰만
  //  - 노드당 최대 2개로 캡
  const byTok = new Map();
  const tokFreq = new Map();
  for (const c of concepts) for (const t of new Set(c.toks)) {
    if (!byTok.has(t)) byTok.set(t, []); byTok.get(t).push(c);
    tokFreq.set(t, (tokFreq.get(t) || 0) + 1);
  }
  const seen = new Set(), crossDeg = {};
  // 희소 토큰 우선 (변별력 높은 연결부터 채움)
  const toksSorted = [...byTok.keys()].sort((a, b) => (tokFreq.get(a) - tokFreq.get(b)));
  for (const t of toksSorted) {
    if ((tokFreq.get(t) || 0) > 3) continue;          // 너무 흔한 토큰 제외
    const perBook = new Map();
    for (const c of byTok.get(t)) if (!perBook.has(c.book)) perBook.set(c.book, c);
    const reps = [...perBook.values()];
    if (reps.length !== 2) continue;                  // 정확히 두 책만 공유
    const [p, q] = reps;
    if ((crossDeg[p.id] || 0) >= 2 || (crossDeg[q.id] || 0) >= 2) continue; // 노드당 최대 2
    const key = p.id < q.id ? p.id + '|' + q.id : q.id + '|' + p.id;
    if (seen.has(key)) continue; seen.add(key);
    crossDeg[p.id] = (crossDeg[p.id] || 0) + 1; crossDeg[q.id] = (crossDeg[q.id] || 0) + 1;
    edges.push({ a: p.id, b: q.id, kind: 'cross', tok: t });
  }
  return { nodes, edges };
}

export default function MindMapScreen() {
  const { nodes: rawNodes, edges } = useMemo(buildGraph, []);
  const simEdges = useMemo(() => edges.filter(e => e.kind !== 'cross'), [edges]); // cross는 표시만, 시뮬 제외
  const nodesRef = useRef([]);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const viewRef = useRef({ tx: 0, ty: 0, k: 1 });
  const interactRef = useRef(0); // 이 시각 전까지는 상호작용 중 → 텍스트 숨김
  const bump = () => { interactRef.current = performance.now() + 350; };
  const [, force] = useState(0);
  const rr = () => force(n => n + 1);

  const books = data.books || [];
  // 책별 베이스 색 (컬러 피커로 조정, localStorage 저장)
  const [colors, setColors] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(LS_KEY)); if (Array.isArray(s) && s.length === books.length) return s; } catch {}
    return books.map((b, i) => defaultColor(i, b.title));
  });
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(colors)); } catch {} }, [colors]);
  const setColor = (i, hex) => setColors(prev => prev.map((v, j) => j === i ? hex : v));
  const resetColors = () => setColors(books.map((b, i) => defaultColor(i, b.title)));
  const [panel, setPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyColors = async () => {
    const map = {};
    books.forEach((b, i) => { map[b.title] = colors[i]; });
    const text = JSON.stringify(map, null, 2);
    try { await navigator.clipboard.writeText(text); } catch { window.prompt('복사', text); }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  // Tidy 방사형 트리: 책마다 부채꼴을 갖고, 그 안을 가지별 잎 수에 비례해 겹치지 않는 구획으로 분할.
  // 가지·잎을 책 중심에서 같은 방향으로 뻗어 → 다른 부모의 자식끼리 영역 분리, 라인 교차 없음.
  useEffect(() => {
    const cx = W / 2, cy = H / 2;
    const Rb = 200, Rbr = 145, Rleaf = 285; // 중심→책, 책→테마, 책→키워드 반지름
    const NB = books.length || 1;
    const wedge = (2 * Math.PI / NB) * 0.92;  // 책 1권 부채꼴 (이웃과 간격)
    const cap = Math.min(wedge, Math.PI / 2); // ≤90° 제한
    const pos = {}, cf = {}; // cf: 노드별 누적 곡률
    books.forEach((b, bi) => {
      const bid = `bk${bi}`;
      const bookAngle = (bi / NB) * 2 * Math.PI - Math.PI / 2 + (rand(bid + 'a') - 0.5) * 0.12;
      const rb = Rb * (0.9 + 0.2 * rand(bid + 'r'));
      const bp = { x: cx + Math.cos(bookAngle) * rb, y: cy + Math.sin(bookAngle) * rb };
      pos[bid] = bp;
      const branches = b.branches || [];
      const weights = branches.map(br => Math.max(1, (br.leaves || []).length));
      const total = weights.reduce((s, w) => s + w, 0) || 1;
      let a = bookAngle - cap / 2; // 부채꼴 시작각
      branches.forEach((br, ri) => {
        const rid = `${bid}-r${ri}`;
        const arc = cap * (weights[ri] / total);   // 이 가지의 각도 구획
        const brAngle = a + arc / 2 + (rand(rid + 'a') - 0.5) * arc * 0.22;     // 구획 내 소폭 흔들기
        const rbr = Rbr * (0.82 + 0.34 * rand(rid + 'r'));
        pos[rid] = { x: bp.x + Math.cos(brAngle) * rbr, y: bp.y + Math.sin(brAngle) * rbr };
        const brCurve = 0.03 + 0.05 * rand(rid + 'c');  // 가지(부모) 곡률
        cf[rid] = brCurve;
        const leaves = br.leaves || [];
        const L = leaves.length;
        const pad = arc * 0.12; // 구획 양끝 여백
        const cell = (arc - 2 * pad) / Math.max(1, L);
        leaves.forEach((lf, li) => {
          const lid = `${rid}-l${li}`;
          const baseA = L === 1 ? brAngle : (a + pad) + cell * (li + 0.5);
          const la = baseA + (rand(lid + 'a') - 0.5) * cell * 0.5; // 자기 셀 안에서만 → 교차 없음
          const rl = Rleaf * (0.84 + 0.32 * rand(lid + 'r'));
          pos[lid] = { x: bp.x + Math.cos(la) * rl, y: bp.y + Math.sin(la) * rl };
          cf[lid] = brCurve + 0.04 + 0.05 * rand(lid + 'c'); // 자식 곡률 = 부모 + 추가
        });
        a += arc; // 다음 가지 구획으로
      });
    });
    nodesRef.current = rawNodes.map(n => {
      const p = pos[n.id] || { x: cx, y: cy };
      return { ...n, x: p.x, y: p.y, hx: p.x, hy: p.y, vx: 0, vy: 0, r: KIND[n.kind].r,
        cf: cf[n.id] || 0,
        sf: 0.7 + 0.6 * rand(n.id + 's'), df: 1 + (rand(n.id + 'd') - 0.5) * 0.06 };
    });
    rr();
  }, [rawNodes]);

  // 스프링 애니메이션: home(hx,hy)으로 돌아오며 흔들림
  const rafRef = useRef(0), runningRef = useRef(false);
  const startAnim = () => {
    if (runningRef.current) return; runningRef.current = true;
    const STIFF = 0.018, DAMP = 0.94; // 살랑살랑: 느린 복귀 + 오래 흔들림
    const step = () => {
      const ns = nodesRef.current; let energy = 0;
      for (const n of ns) {
        if (dragRef.current && dragRef.current.id === n.id) continue;
        const st = STIFF * (n.sf || 1), dp = DAMP * (n.df || 1);
        const ax = (n.hx - n.x) * st, ay = (n.hy - n.y) * st;
        n.vx = (n.vx + ax) * dp; n.vy = (n.vy + ay) * dp;
        n.x += n.vx; n.y += n.vy;
        energy += n.vx * n.vx + n.vy * n.vy + (n.hx - n.x) ** 2 + (n.hy - n.y) ** 2;
      }
      rr();
      if (energy > 0.12 || dragRef.current) rafRef.current = requestAnimationFrame(step);
      else runningRef.current = false;
    };
    rafRef.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  // 스와이프 충격: 깊이가 깊을수록 더 크게 흔듦(잎>테마>책), 노드별 미세 편차
  const shake = (gvx, gvy) => {
    const F = 10, MAX = 50;
    for (const n of nodesRef.current) {
      const kf = n.kind === 'book' ? 0.6 : n.kind === 'branch' ? 0.85 : 1.15;
      const jitter = 0.75 + 0.5 * (((n.id.length * 37 + n.id.charCodeAt(0)) % 100) / 100);
      let ix = gvx * F * kf * jitter, iy = gvy * F * kf * jitter;
      const m = Math.hypot(ix, iy); if (m > MAX) { ix *= MAX / m; iy *= MAX / m; }
      n.vx += ix; n.vy += iy;
    }
    startAnim();
  };

  const toSvg = (e) => { const p = svgRef.current.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svgRef.current.getScreenCTM().inverse()); };
  const toGraph = (e) => { const p = toSvg(e), v = viewRef.current; return { x: (p.x - v.tx) / v.k, y: (p.y - v.ty) / v.k }; };
  const velRef = useRef({ x: 0, y: 0, t: 0, vx: 0, vy: 0 });
  const onNodeDown = (id) => (e) => { e.preventDefault(); e.stopPropagation(); dragRef.current = { id }; try { svgRef.current.setPointerCapture(e.pointerId); } catch {} };
  const onBgDown = (e) => { const p = toSvg(e), v = viewRef.current; panRef.current = { sx: p.x, sy: p.y, otx: v.tx, oty: v.ty }; velRef.current = { x: p.x, y: p.y, t: performance.now(), vx: 0, vy: 0 }; try { svgRef.current.setPointerCapture(e.pointerId); } catch {} };
  const onMove = (e) => {
    if (panRef.current) {
      const p = toSvg(e), v = viewRef.current;
      v.tx = panRef.current.otx + (p.x - panRef.current.sx); v.ty = panRef.current.oty + (p.y - panRef.current.sy);
      const vr = velRef.current, now = performance.now(), dt = Math.max(8, now - vr.t);
      vr.vx = (p.x - vr.x) / dt; vr.vy = (p.y - vr.y) / dt; vr.x = p.x; vr.y = p.y; vr.t = now;
      rr(); return;
    }
    if (!dragRef.current) return; const g = toGraph(e); const n = nodesRef.current.find(n => n.id === dragRef.current.id); if (n) { n.x = g.x; n.y = g.y; } rr();
  };
  const onUp = (e) => {
    const wasDrag = dragRef.current;
    if (panRef.current) {  // 스와이프 플릭 → 흔들기 (속도 → 그래프 좌표 충격)
      const vr = velRef.current, v = viewRef.current;
      if (performance.now() - vr.t < 90 && Math.hypot(vr.vx, vr.vy) > 0.15) shake(vr.vx / v.k, vr.vy / v.k);
    }
    dragRef.current = null; panRef.current = null;
    if (wasDrag) startAnim(); // 노드 드래그 후 제자리로 스프링
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch {}
  };
  const onWheel = (e) => { e.preventDefault(); const p = toSvg(e), v = viewRef.current; const f = e.deltaY < 0 ? 1.12 : 1 / 1.12; const nk = Math.max(0.3, Math.min(6, v.k * f)); v.tx = p.x - (p.x - v.tx) / v.k * nk; v.ty = p.y - (p.y - v.ty) / v.k * nk; v.k = nk; bump(); rr(); };
  const fit = () => { viewRef.current = { tx: 0, ty: 0, k: 1 }; rr(); };

  const nodes = nodesRef.current, byId = {}; nodes.forEach(n => byId[n.id] = n);
  const v = viewRef.current;

  return (
    <div className="flex flex-col h-full w-full bg-[#fafafb]">
      <header className="px-4 pt-4 pb-2 shrink-0">
        <h1 className="text-lg font-bold">책 개념 지도</h1>
        <div className="text-xs text-zinc-500 mt-0.5">수집한 {(data.books || []).length}권 · 책→테마→키워드 한 화면</div>
      </header>
      <div className="flex-1 min-h-0 relative">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-full touch-none select-none"
          onPointerDown={onBgDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onWheel={onWheel}>
          <defs>
            {/* 모든 텍스트 흰색 글로우 섀도우 (opacity 100%, blur 10px) */}
            <filter id="txtHalo" x="-120%" y="-120%" width="340%" height="340%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b" />
              <feFlood floodColor="#ffffff" floodOpacity="1" result="w" />
              <feComposite in="w" in2="b" operator="in" result="halo" />
              <feMerge>
                <feMergeNode in="halo" />
                <feMergeNode in="halo" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g transform={`translate(${v.tx.toFixed(2)},${v.ty.toFixed(2)}) scale(${v.k.toFixed(3)})`}>
            {/* 라인: 전부 검정 10% 통일 */}
            {edges.map((e, i) => {
              const a = byId[e.a], b = byId[e.b]; if (!a || !b) return null;
              if (e.kind === 'cross') // 책 간 유사선: 배경처럼 흐리게(거의 안 보이게)
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={EDGE_COLOR} strokeOpacity={0.03} strokeWidth={1} strokeLinecap="round" />;
              // 책→가지·가지→잎: 부모가 자라온 방향을 이어 바깥으로 피는 곡선
              // 조부모 = main(책→가지)이면 중심, sub(가지→잎)이면 책
              const g = e.kind === 'main' ? { x: W / 2, y: H / 2 } : (byId[`bk${a.book}`] || { x: W / 2, y: H / 2 });
              const c = petalCtrl(a.x, a.y, b.x, b.y, g.x, g.y, e.a + '|' + e.b);
              return <path key={i} d={quad(a.x, a.y, c.cx, c.cy, b.x, b.y)} fill="none" stroke={EDGE_COLOR} strokeOpacity={EDGE_OPACITY} strokeWidth={1} strokeLinecap="round" />;
            })}
            {nodes.map(n => {
              const k = KIND[n.kind];
              return (
                <g key={n.id} transform={`translate(${n.x},${n.y})`} onPointerDown={onNodeDown(n.id)} style={{ cursor: 'pointer' }}>
                  <circle r={n.r} fill={k.color} fillOpacity={k.op} stroke="#fff" strokeWidth={1.2} />
                  {n.kind === 'book' && (
                    <text y={n.r + k.fs + 2} textAnchor="middle" fontSize={k.fs} fontWeight={k.fw}
                      fill="#27272a" filter="url(#txtHalo)" style={{ pointerEvents: 'none' }}>{n.label}</text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        <button onClick={fit} className="absolute bottom-2 right-3 text-[10px] px-2 py-1 rounded bg-white/80 border border-zinc-200">맞춤</button>
        <div className="absolute top-1 right-3 text-[9px] text-zinc-400">스크롤=확대 · 드래그=이동</div>
      </div>
    </div>
  );
}
