import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../App.jsx';
import { update } from '../lib/storage.js';
import { buildSeedState, buildSeedWikiPages } from '../lib/seedLoader.js';

const SOURCE_COLORS = {
  memo: 'bg-amber-100 text-amber-800',
  'book-meta': 'bg-sky-100 text-sky-800',
  'user-answer': 'bg-emerald-100 text-emerald-800',
  'user-context': 'bg-purple-100 text-purple-800',
  'llm-inference': 'bg-zinc-100 text-zinc-600',
};

// 그래프 노드 색상 (페이지 type별)
const TYPE_COLORS = {
  concept:    '#6366f1', // indigo
  entity:     '#0ea5e9', // sky
  reflection: '#f59e0b', // amber
  connection: '#10b981', // emerald
};
const TYPE_FALLBACK = '#a1a1aa'; // zinc

function memoCount(p) {
  return (p.sources ?? []).filter(s => s.kind === 'memo').length;
}

export default function WikiScreen() {
  const s = useStore();
  const pages = Object.values(s.wikiPages).sort((a,b) => b.updatedAt - a.updatedAt);
  const [openId, setOpenId] = useState(null);
  const [view, setView] = useState('graph'); // 기본값: 그래프
  const open = openId ? s.wikiPages[openId] : null;

  // 위키가 비어 있으면 시드(4권) 자동 적재 — 시드 버튼 없이도 그래프가 보이도록.
  useEffect(() => {
    if (Object.keys(s.wikiPages).length > 0) return;
    const seedState = buildSeedState();
    const wikiPages = buildSeedWikiPages();
    const now = Date.now();
    update(st => {
      Object.assign(st.books, seedState.books);
      Object.assign(st.memos, seedState.memos);
      Object.assign(st.profile, seedState.profile);
      Object.assign(st.wikiPages, wikiPages);
      Object.values(st.memos).forEach(m => { if (m.ingestedAt == null) m.ingestedAt = now; });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (open) return <PageView page={open} book={open.bookId ? s.books[open.bookId] : null} onBack={() => setOpenId(null)} />;

  return (
    <div className={view === 'graph' ? 'flex flex-col h-full pt-24' : 'px-4 pt-24 pb-24'}>
      <header className={view === 'graph' ? 'px-4 pb-2' : 'mb-4'}>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Wiki</h1>
          <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs">
            <button
              onClick={() => setView('list')}
              className={`px-2.5 py-1 rounded-md ${view === 'list' ? 'bg-white shadow-sm font-semibold' : 'text-zinc-500'}`}
            >목록</button>
            <button
              onClick={() => setView('graph')}
              className={`px-2.5 py-1 rounded-md ${view === 'graph' ? 'bg-white shadow-sm font-semibold' : 'text-zinc-500'}`}
            >그래프</button>
          </div>
        </div>
        <div className="text-xs text-zinc-500 mt-1">총 {pages.length}개 페이지 · {Object.keys(s.books).length}권 · 누적 메모 {Object.keys(s.memos).length}개</div>
      </header>

      {view === 'graph' ? (
        <GraphView pages={pages} books={s.books} onOpen={setOpenId} />
      ) : (
        <ListView pages={pages} books={s.books} onOpen={setOpenId} />
      )}
    </div>
  );
}

function ListView({ pages, books, onOpen }) {
  return (
    <>
      {pages.length === 0 && (
        <div className="text-center text-zinc-400 py-20 text-sm">
          아직 페이지 없음.<br/>책 상세에서 메모를 쌓고 Ingest를 실행해보세요.
        </div>
      )}

      <ul className="space-y-2">
        {pages.map(p => (
          <li key={p.id}>
            <button onClick={() => onOpen(p.id)} className="w-full text-left bg-white p-3 rounded-xl border border-zinc-100">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className="text-[10px] uppercase tracking-wide text-zinc-400">{p.type}</span>
                {p.bookId && books[p.bookId] && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">{books[p.bookId].title}</span>
                )}
                {memoCount(p) > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">메모 {memoCount(p)}</span>
                )}
              </div>
              <div className="text-sm font-semibold">{p.title}</div>
              <div className="text-xs text-zinc-500 mt-1 line-clamp-2 whitespace-pre-wrap">{p.body}</div>
              <div className="flex gap-1 mt-2 flex-wrap">
                {(p.sources ?? []).map((src, i) => (
                  <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${SOURCE_COLORS[src.kind] ?? 'bg-zinc-100'}`}>
                    {src.kind}
                  </span>
                ))}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function PageView({ page, book, onBack }) {
  return (
    <div className="pb-24">
      <header className="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 border-b border-zinc-100 flex items-center gap-2 z-10">
        <button onClick={onBack} className="text-sm">← Wiki</button>
      </header>
      <div className="p-4">
        <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1">{page.type}</div>
        <h1 className="text-lg font-bold mb-2">{page.title}</h1>
        {book && <div className="text-xs text-zinc-500 mb-3">📖 {book.title}</div>}
        <div className="text-sm whitespace-pre-wrap leading-relaxed">{page.body}</div>

        <div className="mt-6 pt-4 border-t border-zinc-100">
          <h2 className="text-xs text-zinc-500 mb-2">출처 ({(page.sources ?? []).length})</h2>
          <ul className="space-y-1">
            {(page.sources ?? []).map((src, i) => (
              <li key={i} className="text-xs flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${SOURCE_COLORS[src.kind] ?? 'bg-zinc-100'}`}>{src.kind}</span>
                <span className="text-zinc-500 font-mono text-[10px]">{src.id}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---- 그래프 뷰 ----------------------------------------------------------

const VB_W = 360;
const VB_H = 560;

function norm(c) {
  return String(c ?? '').trim().toLowerCase();
}

// 페이지 간 엣지 계산: 공유 키개념(강) + 같은 책(약)
function buildEdges(pages) {
  const edges = new Map(); // "a|b" -> {source, target, weight, reasons:Set}
  const add = (a, b, w, reason) => {
    if (a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    const k = `${x}|${y}`;
    const e = edges.get(k) ?? { source: x, target: y, weight: 0, reasons: new Set() };
    e.weight += w;
    e.reasons.add(reason);
    edges.set(k, e);
  };

  // 키개념 → 페이지 역색인
  const byConcept = new Map();
  for (const p of pages) {
    for (const c of (p.keyConcepts ?? [])) {
      const key = norm(c);
      if (!key) continue;
      if (!byConcept.has(key)) byConcept.set(key, []);
      byConcept.get(key).push(p.id);
    }
  }
  for (const ids of byConcept.values()) {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        add(ids[i], ids[j], 2, 'concept');
  }

  // 같은 책
  const byBook = new Map();
  for (const p of pages) {
    if (!p.bookId) continue;
    if (!byBook.has(p.bookId)) byBook.set(p.bookId, []);
    byBook.get(p.bookId).push(p.id);
  }
  for (const ids of byBook.values()) {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        add(ids[i], ids[j], 1, 'book');
  }

  return [...edges.values()];
}

function GraphView({ pages, books, onOpen }) {
  const svgRef = useRef(null);
  const nodesRef = useRef([]);
  const dragRef = useRef(null); // {id, moved}
  const [, force] = useState(0);
  const rerender = () => force(n => n + 1);

  // 노드 초기화 (페이지 집합이 바뀔 때만)
  const sig = pages.map(p => p.id).join(',');
  const edges = useMemo(() => buildEdges(pages), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const cx = VB_W / 2, cy = VB_H / 2;
    const R = Math.min(VB_W, VB_H) * 0.34;
    const deg = {};
    edges.forEach(e => { deg[e.source] = (deg[e.source] ?? 0) + 1; deg[e.target] = (deg[e.target] ?? 0) + 1; });
    nodesRef.current = pages.map((p, i) => {
      const a = (i / Math.max(1, pages.length)) * Math.PI * 2;
      return {
        id: p.id,
        page: p,
        x: cx + Math.cos(a) * R + (i % 3 - 1) * 6,
        y: cy + Math.sin(a) * R + (i % 2 ? 6 : -6),
        vx: 0, vy: 0,
        r: 7 + Math.min(8, (deg[p.id] ?? 0) * 1.6),
      };
    });
    rerender();
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  // 포스 시뮬레이션 — 계속 유지(멈추지 않음). 드래그 시 재가열, 평소엔 낮은 floor로 잔잔하게 유지.
  const ALPHA_FLOOR = 0.06;
  useEffect(() => {
    if (pages.length === 0) return;
    let alpha = 1;
    let raf;
    const edgeList = edges.map(e => ({ ...e }));
    const tick = () => {
      const nodes = nodesRef.current;
      const byId = {};
      nodes.forEach(n => { byId[n.id] = n; });
      const cx = VB_W / 2, cy = VB_H / 2;

      // 반발력
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 0.01;
          const f = (1600 / d2) * alpha;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
      // 스프링 (엣지)
      for (const e of edgeList) {
        const a = byId[e.source], b = byId[e.target];
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const target = 60 / Math.sqrt(e.weight);
        const f = (d - target) * 0.02 * alpha;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
      // 중심 인력 + 적분
      for (const n of nodes) {
        n.vx += (cx - n.x) * 0.004 * alpha;
        n.vy += (cy - n.y) * 0.004 * alpha;
        if (dragRef.current && dragRef.current.id === n.id) { n.vx = 0; n.vy = 0; continue; }
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(n.r + 2, Math.min(VB_W - n.r - 2, n.x));
        n.y = Math.max(n.r + 2, Math.min(VB_H - n.r - 2, n.y));
      }
      // 드래그 중엔 재가열, 그 외엔 천천히 식되 floor 아래로는 안 내려감 → 항상 살아있음.
      if (dragRef.current) alpha = Math.max(alpha, 0.3);
      alpha *= 0.985;
      if (alpha < ALPHA_FLOOR) alpha = ALPHA_FLOOR;
      rerender();
      raf = requestAnimationFrame(tick); // 항상 계속 — 멈추지 않음
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const toSvg = (evt) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return p;
  };

  const onPointerDown = (id) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const p = toSvg(e);
    dragRef.current = { id, moved: false, startX: p.x, startY: p.y };
    // 캡처는 SVG에 — 손가락이 노드를 벗어나도 드래그 유지, move/up 이벤트 누락 방지
    try { svgRef.current?.setPointerCapture?.(e.pointerId); } catch {}
  };
  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toSvg(e);
    if (Math.hypot(p.x - drag.startX, p.y - drag.startY) > 4) drag.moved = true;
    const n = nodesRef.current.find(n => n.id === drag.id);
    if (n) { n.x = p.x; n.y = p.y; n.vx = 0; n.vy = 0; }
    // 위치 반영은 상시 도는 시뮬레이션 루프가 처리 → 별도 rerender 불필요
  };
  const onPointerUp = (e) => {
    const drag = dragRef.current;
    dragRef.current = null;
    try { svgRef.current?.releasePointerCapture?.(e.pointerId); } catch {}
    if (drag && !drag.moved) onOpen(drag.id); // 움직임 없는 탭 = 열기
  };

  if (pages.length === 0) {
    return (
      <div className="text-center text-zinc-400 py-20 text-sm px-4">
        아직 페이지 없음.<br/>책 상세에서 메모를 쌓고 Ingest를 실행해보세요.
      </div>
    );
  }

  const nodes = nodesRef.current;
  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });

  return (
    <div className="flex-1 min-h-0 relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full h-full touch-none select-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {edges.map((e, i) => {
          const a = byId[e.source], b = byId[e.target];
          if (!a || !b) return null;
          const concept = e.reasons.has('concept');
          return (
            <line
              key={i}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={concept ? '#c7d2fe' : '#e4e4e7'}
              strokeWidth={concept ? 1.4 : 0.8}
            />
          );
        })}
        {nodes.map(n => {
          const color = TYPE_COLORS[n.page.type] ?? TYPE_FALLBACK;
          const label = n.page.title?.length > 10 ? n.page.title.slice(0, 9) + '…' : (n.page.title ?? '');
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              onPointerDown={onPointerDown(n.id)}
              style={{ cursor: 'pointer' }}
            >
              <circle r={n.r} fill={color} fillOpacity={0.9} stroke="#fff" strokeWidth={1.5} />
              <text
                y={n.r + 9}
                textAnchor="middle"
                fontSize={8}
                fill="#52525b"
                style={{ pointerEvents: 'none' }}
              >{label}</text>
            </g>
          );
        })}
      </svg>

      {/* 범례 */}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-x-2 gap-y-0.5 bg-white/80 backdrop-blur rounded-lg px-2 py-1 text-[9px]">
        {Object.entries(TYPE_COLORS).map(([t, c]) => (
          <span key={t} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: c }} />
            {t}
          </span>
        ))}
      </div>
      <div className="absolute top-1 right-3 text-[9px] text-zinc-400">탭=열기 · 드래그=이동</div>
    </div>
  );
}
