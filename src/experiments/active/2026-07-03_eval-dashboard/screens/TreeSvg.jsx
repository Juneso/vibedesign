import React, { useState } from 'react';

// ── 상수 ─────────────────────────────────────────────────────
const COL_W = 230;
const ROW_H = 46;   // 박스 낮아진 만큼 형제 간격은 넉넉히
const NODE_W = 195;
const NODE_H = 30;  // 제목 1줄 중앙정렬
const PAD_X = 16;
const PAD_Y = 20;

// ── 색상 팔레트 (CSS 변수 폴백 포함) ─────────────────────────
const COLORS = {
  root: {
    fill: 'var(--color-purple-bg, #ede9fe)',
    stroke: 'var(--color-purple-border, #7c3aed)',
    text: 'var(--color-purple-text, #4c1d95)',
  },
  branch: {
    fill: 'var(--color-green-bg, #dcfce7)',
    stroke: 'var(--color-green-border, #16a34a)',
    text: 'var(--color-green-text, #14532d)',
  },
  leaf: {
    fill: 'var(--color-neutral-bg, #f3f4f6)',
    stroke: 'var(--color-neutral-border, #9ca3af)',
    text: 'var(--color-neutral-text, #374151)',
  },
  edge: 'var(--color-neutral-border, #d1d5db)',
};

// ── 텍스트 말줄임 (한글 기준 ~14자) ──────────────────────────
function truncate(text, maxLen = 14) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

// ── 말단 키워드의 설명 → 문장 노드 ───────────────────────────
// 자식이 없는 키워드는 설명이 노드 안에 갇혀 클릭해야만 보인다.
// 렌더 시점에만 문장으로 쪼개 자식 노드로 펼친다(원본 트리 데이터는 건드리지 않는다).
const SENT_MAX = 6;       // 노드 폭발 방지
const SENT_CHARS = 22;    // 한 줄 글자 수
const SENT_LINES = 3;     // 문장당 최대 줄

function splitSentences(gloss) {
  const cleaned = String(gloss || '')
    .replace(/^\s*\([^)]*\)\s*/, '')      // 앞머리 유형 표기 "(concept)"
    .replace(/^\s*핵심개념\s*:.*$/gm, '')  // 메타 줄
    .replace(/^\s*#{1,6}\s*.*$/gm, '')     // "## 개요" 같은 헤더
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .slice(0, SENT_MAX);
}

// 원본 노드 + 합성 문장 노드. 색상 판정이 뒤집히지 않도록 원래 자식 유무도 함께 돌려준다.
function withSentenceNodes(nodes) {
  const hadChild = new Set(nodes.map((n) => n.parentId).filter(Boolean));
  const out = [...nodes];
  for (const n of nodes) {
    if (hadChild.has(n.id)) continue;          // 말단(자식 없음)만 대상
    // 한 문장짜리 설명도 노드로 낸다. V9 의 논지는 대개 한 문장이라
    // "2문장 이상"을 요구하면 말단 키워드의 설명이 통째로 사라진다.
    const sents = splitSentences(n.gloss);
    if (sents.length < 1) continue;
    sents.forEach((s, i) => out.push({
      id: `${n.id}__s${i}`, title: s, parentId: n.id,
      level: (n.level ?? 0) + 1, kind: 'sentence', sources: [],
    }));
  }
  return { nodes: out, hadChild };
}

function wrapText(text, per = SENT_CHARS, maxLines = SENT_LINES) {
  const words = String(text).split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > per) { if (cur) lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur.trim());
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (last.length >= per - 1) lines[maxLines - 1] = last.slice(0, per - 1) + '…';
  }
  return lines;
}

// ── 레이아웃 계산 ─────────────────────────────────────────────
// 1) parentId → children 맵
// 2) 리프에 순서대로 row 인덱스
// 3) 내부 노드 y = 자식 y 평균
function computeLayout(rootId, nodes) {
  const childMap = new Map(nodes.map((n) => [n.id, []]));

  nodes.forEach((n) => {
    if (n.parentId && childMap.has(n.parentId)) {
      childMap.get(n.parentId).push(n.id);
    }
  });

  // row 인덱스 부여 (DFS in-order, 리프만)
  let rowIdx = 0;
  const yMap = new Map(); // id → row index (floating)

  function assignRows(id) {
    const children = childMap.get(id) || [];
    if (children.length === 0) {
      yMap.set(id, rowIdx++);
      return;
    }
    children.forEach((cid) => assignRows(cid));
    // 내부 노드 y = 자식 y 평균
    const ys = children.map((cid) => yMap.get(cid));
    yMap.set(id, (Math.min(...ys) + Math.max(...ys)) / 2);
  }

  assignRows(rootId);

  // 레벨 → x (level * COL_W + PAD_X)
  const layout = new Map();
  nodes.forEach((n) => {
    const row = yMap.get(n.id) ?? 0;
    layout.set(n.id, {
      x: n.level * COL_W + PAD_X,
      y: row * ROW_H + PAD_Y,
    });
  });

  return { layout, childMap };
}

// ── 엣지: 부모 오른쪽 → 자식 왼쪽, 3차 베지어 ────────────────
function Edge({ x1, y1, x2, y2 }) {
  const mx = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  return <path d={d} fill="none" stroke={COLORS.edge} strokeWidth={1.5} />;
}

// ── 노드 박스 (제목 1줄, 클릭 가능) ──────────────────────────
function NodeBox({ node, x, y, hasChildren, selected, onSelect }) {
  const isRoot = node.kind === 'root';
  const color = isRoot ? COLORS.root : hasChildren ? COLORS.branch : COLORS.leaf;
  const label = truncate(node.title, 14);

  return (
    <g
      className="eval-tree-node"
      onClick={() => onSelect(node.id)}
      style={{ cursor: 'pointer' }}
    >
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={6}
        ry={6}
        fill={color.fill}
        stroke={selected ? 'var(--color-accent, #2563eb)' : color.stroke}
        strokeWidth={selected ? 2.5 : isRoot ? 2 : 1.5}
      />
      <title>{node.title}{node.gloss ? ` — ${node.gloss}` : ''}</title>
      <text
        x={x + NODE_W / 2}
        y={y + NODE_H / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={13}
        fontWeight={isRoot ? 700 : 500}
        fill={color.text}
      >
        {label}
      </text>
    </g>
  );
}

// ── 문장 노드: 박스 대신 점 + 여러 줄 텍스트 ──────────────────
function SentenceNode({ node, x, y, selected, onSelect }) {
  const lines = wrapText(node.title);
  const top = y + NODE_H / 2 - ((lines.length - 1) * 13) / 2;
  return (
    <g className="eval-tree-node" onClick={() => onSelect(node.id)} style={{ cursor: 'pointer' }}>
      <title>{node.title}</title>
      <circle cx={x + 5} cy={y + NODE_H / 2} r={selected ? 4 : 3} fill={COLORS.branch.stroke} />
      <text x={x + 16} y={top} fontSize={11.5} fill={COLORS.leaf.text}>
        {lines.map((ln, i) => (
          <tspan key={i} x={x + 16} dy={i === 0 ? 0 : 13}>{ln}</tspan>
        ))}
      </text>
    </g>
  );
}

// ── 선택 노드 상세 카드 ───────────────────────────────────────
function NodeDetail({ node, onClose }) {
  if (!node) return null;
  const srcText = node.sources?.length ? node.sources.map((p) => `p${p}`).join(', ') : null;
  const desc = node.gloss; // 개념=gloss / 테마=description (동일 필드)

  return (
    <div className="eval-tree-detail">
      <div className="eval-tree-detail-head">
        <strong className="eval-tree-detail-title">{node.title}</strong>
        <button className="eval-tree-detail-close" onClick={onClose} aria-label="닫기">×</button>
      </div>
      {srcText && <div className="eval-tree-detail-src">{srcText}</div>}
      {desc && <div className="eval-tree-detail-gloss">{desc}</div>}
      {node.anchor && (
        <div className="eval-tree-detail-anchor">“{node.anchor}”</div>
      )}
    </div>
  );
}

// ── TreeSvg 메인 컴포넌트 ─────────────────────────────────────
export function TreeSvg({ tree }) {
  const [selectedId, setSelectedId] = useState(null);

  if (!tree || !tree.nodes || tree.nodes.length === 0) return null;

  const { rootId } = tree;
  // 말단 키워드의 설명을 문장 노드로 펼친 뒤 레이아웃한다
  const { nodes, hadChild } = withSentenceNodes(tree.nodes);
  const { layout, childMap } = computeLayout(rootId, nodes);

  // viewBox 크기 계산
  const maxLevel = Math.max(...nodes.map((n) => n.level));
  const leafCount = nodes.filter((n) => (childMap.get(n.id) || []).length === 0).length;
  // 문장 열은 박스가 아니라 텍스트라 NODE_W 보다 넓게 잡아야 잘리지 않는다
  const hasSentence = nodes.some((n) => n.kind === 'sentence');
  // 한글은 11.5px 폰트에서 글자당 약 12px + 점/여백 — 넉넉히 잡아 마지막 열이 잘리지 않게 한다
  const lastColW = hasSentence ? SENT_CHARS * 13 + 48 : NODE_W;
  const svgWidth = maxLevel * COL_W + PAD_X * 2 + lastColW;
  const svgHeight = leafCount * ROW_H + PAD_Y * 2;

  // 엣지 목록
  const edges = [];
  nodes.forEach((n) => {
    if (!n.parentId) return;
    const p = layout.get(n.parentId);
    const c = layout.get(n.id);
    if (!p || !c) return;
    edges.push({
      key: `${n.parentId}-${n.id}`,
      x1: p.x + NODE_W,
      y1: p.y + NODE_H / 2,
      x2: c.x,
      y2: c.y + NODE_H / 2,
    });
  });

  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  const toggle = (id) => setSelectedId((cur) => (cur === id ? null : id));

  return (
    <div className="eval-tree-block">
      <div className="eval-tree-wrap">
        <svg
          className="eval-tree-svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width={svgWidth}
          height={svgHeight}
          role="img"
          aria-label="키워드 위계 트리"
        >
          <title>키워드 위계 트리</title>
          <g className="eval-tree-edges">
            {edges.map((e) => (
              <Edge key={e.key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
            ))}
          </g>
          <g className="eval-tree-nodes">
            {nodes.map((n) => {
              const pos = layout.get(n.id);
              if (!pos) return null;
              if (n.kind === 'sentence') {
                return (
                  <SentenceNode
                    key={n.id}
                    node={n}
                    x={pos.x}
                    y={pos.y}
                    selected={selectedId === n.id}
                    onSelect={toggle}
                  />
                );
              }
              return (
                <NodeBox
                  key={n.id}
                  node={n}
                  x={pos.x}
                  y={pos.y}
                  /* 문장 노드가 붙었다고 말단 키워드가 가지 색으로 바뀌면 안 된다 */
                  hasChildren={hadChild.has(n.id)}
                  selected={selectedId === n.id}
                  onSelect={toggle}
                />
              );
            })}
          </g>
        </svg>
      </div>
      <NodeDetail node={selectedNode} onClose={() => setSelectedId(null)} />
    </div>
  );
}
