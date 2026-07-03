import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/Stack';
import { Text, Heading } from '@astryxdesign/core/Text';

// ── 파라미터: 처리 노드에 붙은 작은 노드. 클릭하면 의미·effect 펼침 ──
function ParamChips({ params }) {
  const [openIdx, setOpenIdx] = useState(null);
  if (!Array.isArray(params) || params.length === 0) return null;
  const open = openIdx != null ? params[openIdx] : null;
  return (
    <div>
      <div className="pl-params">
        {params.map((p, i) => (
          <button
            key={i}
            type="button"
            className={`pl-param-chip${openIdx === i ? ' is-open' : ''}`}
            onClick={() => setOpenIdx((cur) => (cur === i ? null : i))}
          >
            <code>{p.name}</code>
            <span>= {String(p.value)}</span>
          </button>
        ))}
      </div>
      {open && (
        <div className="pl-param-detail">
          <span><span className="k">의미</span>{open.meaning}</span>
          <span><span className="k">바꾸면</span>{open.effect}</span>
        </div>
      )}
    </div>
  );
}

// 입력/출력 포트: 수치가 있으면 큰 숫자, 없으면 짧은 텍스트
function Port({ cap, num, text }) {
  return (
    <div className="pl-port">
      <span className="pl-port-cap">{cap}</span>
      {num != null
        ? <span className="pl-port-num">{num}</span>
        : <span className="pl-port-text">{text}</span>}
    </div>
  );
}

// ── 한 단계 = 내부(입력→처리→출력)를 펼친 패널 ──
function StagePanel({ stage, index, isFirst }) {
  const f = stage.funnel || {};
  const inNum = f.in != null ? f.in : null;
  const outNum = f.out != null ? f.out : null;
  const dropped = (inNum != null && outNum != null && inNum > outNum) ? inNum - outNum : null;

  return (
    <div className="pl-stage">
      <div className="pl-stage-top">
        <span className="pl-stage-num">{index + 1}</span>
        <span className="pl-stage-title">{stage.name}</span>
        {outNum != null && <span className="pl-stage-badge">{outNum}개 통과</span>}
      </div>

      {stage.why && (
        <p className="pl-stage-why"><b>왜 </b>{stage.why}</p>
      )}

      <div className="pl-flow">
        <Port cap="입력" num={inNum} text={isFirst ? '원천 메모' : '이전 출력'} />
        <span className="pl-flow-arrow">▶</span>
        <div className="pl-op">
          {stage.how && <div className="pl-op-how">{stage.how}</div>}
          <ParamChips params={stage.params} />
          {dropped != null && (
            <div className="pl-op-drop">→ {inNum}개 중 {dropped}개 탈락, {outNum}개 통과</div>
          )}
          {stage.prompt && (
            <details className="pl-prompt">
              <summary>이 단계의 프롬프트 전문 보기</summary>
              <pre className="pl-prompt-pre">{stage.prompt}</pre>
            </details>
          )}
        </div>
        <span className="pl-flow-arrow">▶</span>
        <Port cap="출력" num={outNum} text="산출물" />
      </div>

      {stage.output && (
        <p className="pl-stage-out"><b>출력물 </b>{stage.output}</p>
      )}
    </div>
  );
}

// 단계 사이 연결선: 흘러가는 수량(이전 단계 출력) 표시
function Connector({ flow }) {
  return (
    <div className="pl-connector">
      <span className="pl-connector-line" />
      <span className="pl-connector-arrow">▼</span>
      {flow != null && <span className="pl-connector-label">{flow}개 전달</span>}
    </div>
  );
}

// ── 엣지: 두 노드의 가장 가까운 변 중점끼리 ㄴ자(직교) 경로 ──
function edgePath(a, b) {
  // 각 노드의 4변 중점
  const pts = (n) => ({
    top: { x: n.x + n.w / 2, y: n.y },
    bottom: { x: n.x + n.w / 2, y: n.y + n.h },
    left: { x: n.x, y: n.y + n.h / 2 },
    right: { x: n.x + n.w, y: n.y + n.h / 2 },
  });
  const pa = pts(a), pb = pts(b);
  let best = null;
  for (const ka of Object.keys(pa)) {
    for (const kb of Object.keys(pb)) {
      const dx = pa[ka].x - pb[kb].x, dy = pa[ka].y - pb[kb].y;
      const d = dx * dx + dy * dy;
      if (!best || d < best.d) best = { d, s: pa[ka], sk: ka, e: pb[kb], ek: kb };
    }
  }
  return best;
}

// ── 2D 구조도 렌더러 ──
function DiagramSVG({ diagram, selectedNodeId, onSelectNode }) {
  const { canvas, nodes, edges } = diagram;
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));

  // 엣지 기하 선계산: 라벨은 ㄴ자 경로의 "긴 세그먼트" 중점에 — 항상 선 위에 놓인다
  const edgeGeo = edges.map((e) => {
    const a = nodeById[e.from], b = nodeById[e.to];
    if (!a || !b) return null;
    const seg = edgePath(a, b);
    if (!seg) return null;
    const { s, sk, e: ep } = seg;
    const vertOut = sk === 'top' || sk === 'bottom';
    const mid = vertOut ? { x: s.x, y: ep.y } : { x: ep.x, y: s.y };
    const len1 = Math.abs(mid.x - s.x) + Math.abs(mid.y - s.y);
    const len2 = Math.abs(ep.x - mid.x) + Math.abs(ep.y - mid.y);
    const [p1, p2] = len1 >= len2 ? [s, mid] : [mid, ep];
    return {
      e,
      d: `M ${s.x} ${s.y} L ${mid.x} ${mid.y} L ${ep.x} ${ep.y}`,
      lx: (p1.x + p2.x) / 2,
      ly: (p1.y + p2.y) / 2,
    };
  }).filter(Boolean);

  return (
    <svg
      className="pl-diagram"
      viewBox={`0 0 ${canvas.w} ${canvas.h}`}
      width="100%"
      role="img"
      aria-label="파이프라인 구조도"
    >
      <defs>
        <marker id="pl-arrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--color-text-secondary)" />
        </marker>
      </defs>

      {/* 엣지 선 (노드 아래) */}
      {edgeGeo.map((g, i) => (
        <path key={i} className="pl-edge" d={g.d} fill="none"
          stroke="var(--color-text-secondary)" strokeWidth="1.2"
          markerEnd="url(#pl-arrow)" />
      ))}

      {/* 노드 */}
      {nodes.map((n) => {
        const isProcess = n.kind === 'process';
        const isHuman = n.kind === 'human';
        const clickable = !!n.stageId;
        const isSel = clickable && selectedNodeId === n.id;
        const rx = n.kind === 'data' ? 2 : 10;
        let fill = 'var(--color-background-card)';
        let stroke = 'var(--color-border-emphasized)';
        let sw = 1;
        if (isProcess) { fill = 'var(--color-accent-muted)'; stroke = 'var(--color-accent)'; sw = 1.5; }
        if (isHuman) { fill = 'var(--color-background-muted)'; stroke = 'var(--color-border-emphasized)'; sw = 1.2; }
        if (isSel) sw = 2.5;
        return (
          <g key={n.id}
            className={`pl-node${clickable ? ' is-clickable' : ''}`}
            onClick={clickable ? () => onSelectNode(isSel ? null : n.id) : undefined}
          >
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={rx}
              fill={fill} stroke={stroke} strokeWidth={sw}
              strokeDasharray={isHuman ? '5 4' : undefined} />
            <foreignObject x={n.x} y={n.y} width={n.w} height={n.h}>
              <div className="pl-node-body">
                <span className="pl-node-label">{n.label}</span>
                {n.sub && <span className="pl-node-sub">{n.sub}</span>}
              </div>
            </foreignObject>
          </g>
        );
      })}

      {/* 엣지 라벨 (노드 위 — 박스에 가려지지 않게 마지막에 그림) */}
      {edgeGeo.map((g, i) => {
        const { e, lx, ly } = g;
        if (!e.label && !e.count) return null;
        const labelW = (e.label ? e.label.length * 6.2 : 0) + (e.count ? e.count.length * 7 + 14 : 0) + 12;
        return (
          <g key={`lbl-${i}`}>
            <rect x={lx - labelW / 2} y={ly - 9} width={labelW} height={18} rx="3"
              fill="var(--color-background-body)" />
            {e.label && (
              <text x={e.count ? lx - 4 : lx} y={ly + 3}
                textAnchor={e.count ? 'end' : 'middle'}
                fontSize="11" fill="var(--color-text-secondary)">{e.label}</text>
            )}
            {e.count && (
              <g>
                <rect x={lx + (e.label ? 2 : -(e.count.length * 7 + 12) / 2)} y={ly - 8}
                  width={e.count.length * 7 + 12} height={16} rx="8"
                  fill="var(--color-accent-muted)" />
                <text x={lx + (e.label ? 2 : 0) + (e.count.length * 7 + 12) / 2} y={ly + 3}
                  textAnchor="middle" fontSize="10.5" fontWeight="600"
                  fill="var(--color-text-accent)">{e.count}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function DiagramView({ pipeline }) {
  const stages = pipeline.stages || [];
  const diagram = pipeline.diagram;
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const selNode = diagram.nodes.find((n) => n.id === selectedNodeId);
  const selStage = selNode && stages.find((s) => s.id === selNode.stageId);
  const selIndex = selStage ? stages.indexOf(selStage) : -1;

  return (
    <VStack gap={3}>
      <div className="pl-diagram-legend">
        <span className="pl-legend-item"><span className="pl-swatch data" />산출물·데이터</span>
        <span className="pl-legend-item"><span className="pl-swatch process" />처리 단계 (클릭 가능)</span>
        <span className="pl-legend-item"><span className="pl-swatch human" />사람 개입</span>
      </div>
      <div className="pl-diagram-wrap">
        <DiagramSVG diagram={diagram} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
      </div>
      {selStage ? (
        <div className="pl-node-detail">
          <StagePanel stage={selStage} index={selIndex} isFirst={selIndex === 0} />
        </div>
      ) : (
        <Text type="supporting">처리 노드를 클릭하면 상세 설명이 여기에 표시됩니다.</Text>
      )}
    </VStack>
  );
}

export function PipelineDetail({ pipeline }) {
  if (pipeline.error) {
    return <Text color="accent">파이프라인 파싱 오류: {pipeline.error}</Text>;
  }
  const stages = pipeline.stages || [];

  return (
    <VStack gap={4}>
      {/* 헤더 */}
      <VStack gap={2}>
        <Heading level={2}>{pipeline.title}</Heading>
        {pipeline.script && (
          <Text type="supporting"><code>{pipeline.script}</code></Text>
        )}
        {pipeline.goal && (
          <div className="pl-goal">
            <Text type="supporting" weight="semibold">목표</Text>
            <Text>{pipeline.goal}</Text>
          </div>
        )}
        {pipeline.designIntent && (
          <div className="pl-intent">
            <Text type="supporting" weight="semibold">설계 의도</Text>
            <Text>{pipeline.designIntent}</Text>
          </div>
        )}
      </VStack>

      {/* 2D 구조도 (diagram 있으면) 또는 세로 패널 폴백 */}
      {pipeline.diagram ? (
        <DiagramView pipeline={pipeline} />
      ) : (
        <div className="pl-stages">
          {stages.map((s, i) => (
            <React.Fragment key={s.id || i}>
              <StagePanel stage={s} index={i} isFirst={i === 0} />
              {i < stages.length - 1 && (
                <Connector flow={s.funnel?.out != null ? s.funnel.out : null} />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* 알려진 한계 — 노란 배경 없이 중립 리스트 */}
      {Array.isArray(pipeline.knownIssues) && pipeline.knownIssues.length > 0 && (
        <div className="pl-issues">
          <p className="pl-issues-title">알려진 한계</p>
          <ul>
            {pipeline.knownIssues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </VStack>
  );
}
