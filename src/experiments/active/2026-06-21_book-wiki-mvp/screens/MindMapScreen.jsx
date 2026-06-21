import React, { useState, useRef, useEffect, useMemo } from 'react';
import data from '../lib/mindmaps.json';

// 8권 마인드맵(책→테마→키워드)을 force-directed 그래프로 한 페이지에 통합.
// - 최상위=책 제목, 깊이 깊을수록 opacity 감소
// - 직선 엣지, 3종 라인(책↔1뎁스 / 상위↔하위 / 책 간 유사개념) 디자인 구분
// - 화면상 6pt 미만 텍스트는 숨김(노드는 유지)

const W = 1500, H = 1050;
const MIN_TEXT_PX = 16; // 이 픽셀보다 작아지는 라벨은 숨김

const KIND = {
  book:   { color: '#f97316', r: 9,   fs: 17, op: 1.0,  textOp: 1.0,  fw: 700 },  // 책 — 최상위 주황
  branch: { color: '#16a34a', r: 5.5, fs: 14, op: 0.7,  textOp: 1.0,  fw: 600 },  // 테마 — 1뎁스 녹색, 웨이트 한 단계 낮춤
  leaf:   { color: '#22c55e', r: 3.5, fs: 9,  op: 0.45, textOp: 0.6,  fw: 400 },  // 키워드 — 말단 연녹색
};

// 3종 라인 디자인
const LINE = {
  main:  { stroke: '#475569', width: 1.6, opacity: 0.8,  dash: null },     // ① 책↔1뎁스: 진한 실선 굵게
  sub:   { stroke: '#cbd5e1', width: 0.8, opacity: 0.75, dash: null },     // ② 상위↔하위: 옅은 실선 가늘게
  cross: { stroke: '#16a34a', width: 1.1, opacity: 0.6,  dash: '5 4' },    // ③ 책 간 유사개념: 녹색 점선
};

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
  const [, force] = useState(0);
  const rr = () => force(n => n + 1);

  const deg = useMemo(() => { const d = {}; simEdges.forEach(e => { d[e.a] = (d[e.a] || 0) + 1; d[e.b] = (d[e.b] || 0) + 1; }); return d; }, [simEdges]);

  useEffect(() => {
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42, N = rawNodes.length;
    nodesRef.current = rawNodes.map((n, i) => {
      const a = (i / N) * Math.PI * 2, k = KIND[n.kind];
      return { ...n, x: cx + Math.cos(a) * R + (i % 5 - 2) * 8, y: cy + Math.sin(a) * R + (i % 3 - 1) * 8, vx: 0, vy: 0, r: k.r + Math.min(8, (deg[n.id] || 0) * 0.7) };
    });
    rr();
  }, [rawNodes, deg]);

  useEffect(() => {
    if (!rawNodes.length) return;
    let alpha = 1, raf; const byId = {};
    const tick = () => {
      const ns = nodesRef.current; ns.forEach(n => byId[n.id] = n);
      const cx = W / 2, cy = H / 2;
      for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
        const a = ns[i], b = ns[j]; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy || 0.01;
        const f = 3200 / d2 * alpha, d = Math.sqrt(d2), fx = dx / d * f, fy = dy / d * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
      for (const e of simEdges) {
        const a = byId[e.a], b = byId[e.b]; if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        const target = e.kind === 'main' ? 130 : 64;
        const f = (d - target) * 0.03 * alpha, fx = dx / d * f, fy = dy / d * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
      for (const n of ns) {
        n.vx += (cx - n.x) * 0.003 * alpha; n.vy += (cy - n.y) * 0.003 * alpha;
        if (dragRef.current && dragRef.current.id === n.id) { n.vx = 0; n.vy = 0; continue; }
        n.vx *= 0.85; n.vy *= 0.85; n.x += n.vx; n.y += n.vy;
        n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x)); n.y = Math.max(n.r + 4, Math.min(H - n.r - 4, n.y));
      }
      if (dragRef.current) alpha = Math.max(alpha, 0.3);
      alpha *= 0.99; if (alpha < 0.05) alpha = 0.05;
      rr(); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rawNodes, simEdges]);

  const toSvg = (e) => { const p = svgRef.current.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svgRef.current.getScreenCTM().inverse()); };
  const toGraph = (e) => { const p = toSvg(e), v = viewRef.current; return { x: (p.x - v.tx) / v.k, y: (p.y - v.ty) / v.k }; };
  const onNodeDown = (id) => (e) => { e.preventDefault(); e.stopPropagation(); dragRef.current = { id }; try { svgRef.current.setPointerCapture(e.pointerId); } catch {} };
  const onBgDown = (e) => { const p = toSvg(e), v = viewRef.current; panRef.current = { sx: p.x, sy: p.y, otx: v.tx, oty: v.ty }; try { svgRef.current.setPointerCapture(e.pointerId); } catch {} };
  const onMove = (e) => {
    if (panRef.current) { const p = toSvg(e), v = viewRef.current; v.tx = panRef.current.otx + (p.x - panRef.current.sx); v.ty = panRef.current.oty + (p.y - panRef.current.sy); return; }
    if (!dragRef.current) return; const g = toGraph(e); const n = nodesRef.current.find(n => n.id === dragRef.current.id); if (n) { n.x = g.x; n.y = g.y; n.vx = 0; n.vy = 0; }
  };
  const onUp = (e) => { dragRef.current = null; panRef.current = null; try { svgRef.current.releasePointerCapture(e.pointerId); } catch {} };
  const onWheel = (e) => { e.preventDefault(); const p = toSvg(e), v = viewRef.current; const f = e.deltaY < 0 ? 1.12 : 1 / 1.12; const nk = Math.max(0.3, Math.min(6, v.k * f)); v.tx = p.x - (p.x - v.tx) / v.k * nk; v.ty = p.y - (p.y - v.ty) / v.k * nk; v.k = nk; rr(); };
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
            {/* cross 라인 먼저(맨 뒤) → main/sub 순으로 위에 */}
            {['cross', 'sub', 'main'].map(kind => edges.filter(e => e.kind === kind).map((e, i) => {
              const a = byId[e.a], b = byId[e.b]; if (!a || !b) return null; const s = LINE[kind];
              return <line key={kind + i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={s.stroke} strokeWidth={s.width} strokeOpacity={s.opacity} strokeLinecap="round" strokeDasharray={s.dash || undefined} />;
            }))}
            {nodes.map(n => {
              const k = KIND[n.kind];
              const label = n.label?.length > 12 ? n.label.slice(0, 11) + '…' : (n.label || '');
              const showText = k.fs * v.k >= MIN_TEXT_PX; // 화면상 6px 미만이면 텍스트 숨김(노드 유지)
              return (
                <g key={n.id} transform={`translate(${n.x},${n.y})`} onPointerDown={onNodeDown(n.id)} style={{ cursor: 'pointer' }}>
                  <circle r={n.r} fill={k.color} fillOpacity={k.op} stroke="#fff" strokeWidth={1.2} />
                  {showText && (
                    <text y={n.r + k.fs} textAnchor="middle" fontSize={k.fs} fontWeight={k.fw}
                      fill="#27272a" fillOpacity={k.textOp} filter="url(#txtHalo)" style={{ pointerEvents: 'none' }}>{label}</text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        <div className="absolute bottom-2 left-2 flex flex-col gap-0.5 bg-white/85 backdrop-blur rounded-lg px-2 py-1.5 text-[9px]">
          <div className="flex gap-x-2">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: KIND.book.color }} />책</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: KIND.branch.color }} />테마</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: KIND.leaf.color }} />키워드</span>
          </div>
          <div className="flex gap-x-2 text-zinc-500">
            <span className="flex items-center gap-1"><span className="inline-block w-3" style={{ borderTop: '2px solid #475569' }} />책-테마</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3" style={{ borderTop: '1px solid #cbd5e1' }} />테마-키워드</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3" style={{ borderTop: '1px dashed #16a34a' }} />책 간 유사</span>
          </div>
        </div>
        <button onClick={fit} className="absolute bottom-2 right-3 text-[10px] px-2 py-1 rounded bg-white/80 border border-zinc-200">맞춤</button>
        <div className="absolute top-1 right-3 text-[9px] text-zinc-400">스크롤=확대 · 드래그=이동</div>
      </div>
    </div>
  );
}
