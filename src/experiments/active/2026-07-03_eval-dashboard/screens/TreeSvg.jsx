import React from 'react';

// ── 상수 ─────────────────────────────────────────────────────
const COL_W = 220;
const ROW_H = 54;
const NODE_W = 195;
const NODE_H = 40;
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

// ── 텍스트 말줄임 (한글 기준 ~13자) ──────────────────────────
function truncate(text, maxLen = 13) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

// ── 레이아웃 계산 ─────────────────────────────────────────────
// 1) parentId → children 맵
// 2) 리프에 순서대로 row 인덱스
// 3) 내부 노드 y = 자식 y 평균
function computeLayout(rootId, nodes) {
  const map = new Map(nodes.map((n) => [n.id, n]));
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

// ── 노드 박스 ─────────────────────────────────────────────────
function NodeBox({ node, x, y, hasChildren }) {
  const isRoot = node.kind === 'root';
  const color = isRoot ? COLORS.root : hasChildren ? COLORS.branch : COLORS.leaf;
  const label = truncate(node.title, 13);
  const srcText = node.sources?.length ? node.sources.map((p) => `p${p}`).join(',') : null;

  const nodeH = srcText ? NODE_H + 14 : NODE_H;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={nodeH}
        rx={6}
        ry={6}
        fill={color.fill}
        stroke={color.stroke}
        strokeWidth={isRoot ? 2 : 1.5}
      />
      {/* 전체 제목 툴팁 */}
      <title>{node.title}{node.gloss ? ` — ${node.gloss}` : ''}</title>
      {/* 제목 텍스트 */}
      <text
        x={x + NODE_W / 2}
        y={y + (srcText ? NODE_H / 2 - 1 : NODE_H / 2 + 1)}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={13}
        fontWeight={isRoot ? 700 : 500}
        fill={color.text}
      >
        {label}
      </text>
      {/* sources 페이지 표기 */}
      {srcText && (
        <text
          x={x + NODE_W / 2}
          y={y + NODE_H - 3}
          textAnchor="middle"
          dominantBaseline="hanging"
          fontSize={10}
          fill="var(--color-text-tertiary, #9ca3af)"
        >
          {srcText}
        </text>
      )}
    </g>
  );
}

// ── TreeSvg 메인 컴포넌트 ─────────────────────────────────────
export function TreeSvg({ tree }) {
  if (!tree || !tree.nodes || tree.nodes.length === 0) return null;

  const { rootId, nodes } = tree;
  const { layout, childMap } = computeLayout(rootId, nodes);

  // viewBox 크기 계산
  const maxLevel = Math.max(...nodes.map((n) => n.level));
  const leafCount = nodes.filter((n) => (childMap.get(n.id) || []).length === 0).length;
  const svgWidth = (maxLevel + 1) * COL_W + PAD_X * 2 + NODE_W;
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

  return (
    <div className="eval-tree-wrap">
      <svg
        className="eval-tree-svg"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width={svgWidth}
        height={svgHeight}
        role="img"
        aria-label="개념 위계 트리"
      >
        <title>개념 위계 트리</title>
        {/* 엣지 먼저 (노드 아래) */}
        <g className="eval-tree-edges">
          {edges.map((e) => (
            <Edge key={e.key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
          ))}
        </g>
        {/* 노드 박스 */}
        <g className="eval-tree-nodes">
          {nodes.map((n) => {
            const pos = layout.get(n.id);
            if (!pos) return null;
            const hasChildren = (childMap.get(n.id) || []).length > 0;
            return (
              <NodeBox
                key={n.id}
                node={n}
                x={pos.x}
                y={pos.y}
                hasChildren={hasChildren}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
