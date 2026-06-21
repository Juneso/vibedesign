import React, { useState, useRef, useMemo } from 'react';
import data from '../lib/mindmaps.json';

// ── 레이아웃: 책 1권 → 방사형 마인드맵 좌표 ──
const R1 = 250;   // 중심→갈래 거리
const R2 = 145;   // 갈래→잎 거리
const CHARW = 1.02; // 한글 글자폭 ≈ fontSize 비율

function pillW(text, fs, padX) { return text.length * fs * CHARW + padX * 2; }

function layout(book) {
  const C = { x: 0, y: 0 };
  const N = book.branches.length || 1;
  const nodes = [];
  const links = [];
  // center
  nodes.push({ kind: 'center', x: C.x, y: C.y, name: book.center.name, sub: book.center.sub });
  book.branches.forEach((br, i) => {
    const ang = (-90 + i * (360 / N)) * Math.PI / 180;
    const bx = C.x + R1 * Math.cos(ang), by = C.y + R1 * Math.sin(ang);
    nodes.push({ kind: 'branch', x: bx, y: by, name: br.name, color: br.color });
    links.push({ a: C, b: { x: bx, y: by }, color: br.color, main: true });
    const m = br.leaves.length;
    const spread = Math.min(70, 26 * m) * Math.PI / 180;
    br.leaves.forEach((lf, j) => {
      const t = m === 1 ? 0 : (j / (m - 1) - 0.5);
      const la = ang + t * spread;
      const lx = bx + R2 * Math.cos(la), ly = by + R2 * Math.sin(la);
      nodes.push({ kind: 'leaf', x: lx, y: ly, name: lf, color: br.color });
      links.push({ a: { x: bx, y: by }, b: { x: lx, y: ly }, color: br.color, main: false });
    });
  });
  // bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const fs = n.kind === 'center' ? 17 : n.kind === 'branch' ? 13 : 11;
    const w = pillW(n.name, fs, 12), h = (n.kind === 'center' ? 52 : 30);
    minX = Math.min(minX, n.x - w / 2); maxX = Math.max(maxX, n.x + w / 2);
    minY = Math.min(minY, n.y - h / 2); maxY = Math.max(maxY, n.y + h / 2);
  }
  const pad = 30;
  return { nodes, links, vb: { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 } };
}

function curve(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, bow = len * 0.12;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const cx = mx - dy / len * bow, cy = my + dx / len * bow;
  return `M ${a.x} ${a.y} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x} ${b.y}`;
}

function Pill({ n }) {
  if (n.kind === 'center') {
    const w = pillW(n.name, 17, 16);
    return (
      <g>
        <rect x={n.x - w / 2} y={n.y - 26} width={w} height={52} rx={12} fill="#1e293b" />
        <text x={n.x} y={n.y - 4} textAnchor="middle" fontSize={17} fontWeight="700" fill="#fff">{n.name}</text>
        <text x={n.x} y={n.y + 15} textAnchor="middle" fontSize={11} fill="#cbd5e1">{n.sub}</text>
      </g>
    );
  }
  if (n.kind === 'branch') {
    const w = pillW(n.name, 13, 14);
    return (
      <g>
        <rect x={n.x - w / 2} y={n.y - 15} width={w} height={30} rx={15} fill={n.color} />
        <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={13} fontWeight="700" fill="#fff">{n.name}</text>
      </g>
    );
  }
  const w = pillW(n.name, 11, 11);
  return (
    <g>
      <rect x={n.x - w / 2} y={n.y - 13} width={w} height={26} rx={13} fill="#fff" stroke={n.color} strokeWidth={1.5} />
      <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={11} fill="#1f2430">{n.name}</text>
    </g>
  );
}

export default function MindMapScreen() {
  const books = data.books || [];
  const [sel, setSel] = useState(0);
  const book = books[sel];
  const { nodes, links, vb } = useMemo(() => layout(book), [sel]);

  // pan/zoom
  const svgRef = useRef(null);
  const viewRef = useRef({ tx: 0, ty: 0, k: 1 });
  const panRef = useRef(null);
  const [, force] = useState(0);
  const rr = () => force(n => n + 1);
  const toSvg = (e) => { const p = svgRef.current.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svgRef.current.getScreenCTM().inverse()); };
  const onDown = (e) => { const p = toSvg(e); const v = viewRef.current; panRef.current = { sx: p.x, sy: p.y, otx: v.tx, oty: v.ty }; try { svgRef.current.setPointerCapture(e.pointerId); } catch {} };
  const onMove = (e) => { if (!panRef.current) return; const p = toSvg(e); const v = viewRef.current; v.tx = panRef.current.otx + (p.x - panRef.current.sx); v.ty = panRef.current.oty + (p.y - panRef.current.sy); rr(); };
  const onUp = (e) => { panRef.current = null; try { svgRef.current.releasePointerCapture(e.pointerId); } catch {} };
  const onWheel = (e) => { e.preventDefault(); const p = toSvg(e); const v = viewRef.current; const f = e.deltaY < 0 ? 1.12 : 1 / 1.12; const nk = Math.max(0.4, Math.min(6, v.k * f)); v.tx = p.x - (p.x - v.tx) / v.k * nk; v.ty = p.y - (p.y - v.ty) / v.k * nk; v.k = nk; rr(); };
  const reset = () => { viewRef.current = { tx: 0, ty: 0, k: 1 }; rr(); };

  const v = viewRef.current;

  return (
    <div className="flex flex-col h-full w-full bg-[#fafafb]">
      <header className="px-4 pt-4 pb-2">
        <h1 className="text-lg font-bold">책 마인드맵</h1>
        <div className="text-xs text-zinc-500 mt-0.5">수집한 {books.length}권 · 메모를 테마·키워드로 정리</div>
      </header>
      {/* 책 선택 */}
      <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 shrink-0">
        {books.map((b, i) => (
          <button key={b.id} onClick={() => { setSel(i); reset(); }}
            className={`whitespace-nowrap text-xs px-2.5 py-1 rounded-full border ${i === sel ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200'}`}>
            {b.title}
          </button>
        ))}
      </div>
      {/* 마인드맵 */}
      <div className="flex-1 min-h-0 relative">
        <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="w-full h-full touch-none select-none"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onWheel={onWheel}>
          <g transform={`translate(${v.tx.toFixed(2)},${v.ty.toFixed(2)}) scale(${v.k.toFixed(3)})`}>
            {links.map((l, i) => (
              <path key={i} d={curve(l.a, l.b)} fill="none" stroke={l.color} strokeWidth={l.main ? 3 : 1.5} strokeOpacity={l.main ? 1 : 0.5} strokeLinecap="round" />
            ))}
            {nodes.map((n, i) => <Pill key={i} n={n} />)}
          </g>
        </svg>
        <div className="absolute bottom-2 right-3 text-[10px] text-zinc-400">스크롤=확대 · 드래그=이동</div>
        <button onClick={reset} className="absolute bottom-2 left-3 text-[10px] px-2 py-1 rounded bg-white/80 border border-zinc-200">맞춤</button>
      </div>
    </div>
  );
}
