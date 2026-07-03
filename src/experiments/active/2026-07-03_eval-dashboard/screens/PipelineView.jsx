import React, { useEffect, useMemo, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Stack';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Spinner } from '@astryxdesign/core/Spinner';
import { listPipelines } from '../lib/api.js';

// 깔때기 수치 포맷: null은 '—'
function fmtFunnel(funnel) {
  if (!funnel) return null;
  const inV = funnel.in == null ? '—' : String(funnel.in);
  const outV = funnel.out == null ? '—' : String(funnel.out);
  if (funnel.in == null && funnel.out == null) return null;
  return `${inV} → ${outV}`;
}

// 단계의 대표 통과 수치: out 우선, 없으면 in
function passValue(funnel) {
  if (!funnel) return null;
  if (funnel.out != null) return funnel.out;
  if (funnel.in != null) return funnel.in;
  return null;
}

// 노드 폭 스케일: 로그 스케일로 [min,max] 폭에 매핑. 값이 없으면 균일(최대폭).
function widthScaler(stages) {
  const vals = stages.map((s) => passValue(s.funnel)).filter((v) => v != null && v > 0);
  const NODE_MIN = 120;
  const NODE_MAX = 280;
  if (vals.length === 0) {
    return () => NODE_MAX; // funnel 전무 → 균일 폭
  }
  const logs = vals.map((v) => Math.log(v));
  const lo = Math.min(...logs);
  const hi = Math.max(...logs);
  return (funnel) => {
    const v = passValue(funnel);
    if (v == null || v <= 0) return NODE_MAX;
    if (hi === lo) return NODE_MAX;
    const t = (Math.log(v) - lo) / (hi - lo);
    return NODE_MIN + t * (NODE_MAX - NODE_MIN);
  };
}

function ellipsize(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

// ── SVG 구조도 ─────────────────────────────────────────────────
function PipelineDiagram({ stages, selectedIndex, onSelect }) {
  const VIEW_W = 320;
  const NODE_H = 56;
  const V_GAP = 52; // 노드 간 세로 간격(연결선 + 전이 라벨 공간)
  const PAD_TOP = 16;
  const scale = useMemo(() => widthScaler(stages), [stages]);

  const rows = stages.map((s, i) => {
    const w = scale(s.funnel);
    const y = PAD_TOP + i * (NODE_H + V_GAP);
    const x = (VIEW_W - w) / 2;
    return { stage: s, index: i, w, x, y };
  });

  const VIEW_H = PAD_TOP * 2 + stages.length * NODE_H + (stages.length - 1) * V_GAP;

  return (
    <svg
      className="pl-diagram"
      role="img"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMin meet"
    >
      <title>파이프라인 단계 흐름 구조도 — 노드 폭은 통과 수치에 비례</title>
      <defs>
        <marker id="pl-arrow" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--color-border)" />
        </marker>
      </defs>

      {/* 연결선 + 전이 라벨 */}
      {rows.slice(0, -1).map((r, i) => {
        const next = rows[i + 1];
        const x = VIEW_W / 2;
        const y1 = r.y + NODE_H;
        const y2 = next.y;
        const funnel = fmtFunnel(next.stage.funnel);
        return (
          <g key={`edge-${i}`}>
            <line
              x1={x} y1={y1} x2={x} y2={y2 - 2}
              stroke="var(--color-border)" strokeWidth="1.5"
              markerEnd="url(#pl-arrow)"
            />
            {funnel && (
              <text
                x={x + 8} y={(y1 + y2) / 2 + 4}
                fontSize="11" fill="var(--color-text-secondary)"
              >
                {funnel}
              </text>
            )}
          </g>
        );
      })}

      {/* 노드 */}
      {rows.map((r) => {
        const isSel = r.index === selectedIndex;
        const pass = passValue(r.stage.funnel);
        return (
          <g
            key={r.stage.id || r.index}
            className="pl-node"
            onClick={() => onSelect(r.index)}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={r.x} y={r.y} width={r.w} height={NODE_H} rx="10"
              fill="var(--color-background-card)"
              stroke={isSel ? 'var(--color-accent)' : 'var(--color-border)'}
              strokeWidth={isSel ? 2 : 1}
            />
            <text
              x={r.x + 12} y={r.y + 22}
              fontSize="11" fill="var(--color-text-secondary)"
            >
              {r.index + 1}단계
            </text>
            <text
              x={r.x + 12} y={r.y + 40}
              fontSize="13" fontWeight="600" fill="var(--color-text-primary)"
            >
              {ellipsize(r.stage.name, Math.max(6, Math.floor(r.w / 12)))}
            </text>
            {pass != null && (
              <g>
                <rect
                  x={r.x + r.w - 46} y={r.y + 10} width="36" height="18" rx="9"
                  fill="var(--color-accent-muted)"
                />
                <text
                  x={r.x + r.w - 28} y={r.y + 23}
                  fontSize="10" textAnchor="middle" fill="var(--color-text-accent)"
                >
                  {pass}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── 파라미터 테이블 (name · value · meaning · effect) ──────────
function ParamTable({ params }) {
  if (!Array.isArray(params) || params.length === 0) return null;
  return (
    <div className="pl-param-table-wrap">
      <table className="pl-param-table">
        <thead>
          <tr>
            <th>파라미터</th>
            <th>값</th>
            <th>의미</th>
            <th>바꾸면</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p, i) => (
            <tr key={i}>
              <td><code>{p.name}</code></td>
              <td><code>{String(p.value)}</code></td>
              <td>{p.meaning}</td>
              <td>{p.effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 선택된 단계 상세 (항상 펼쳐진 패널) ─────────────────────────
function StageDetail({ stage, index }) {
  if (!stage) return null;
  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center">
        <span className="pl-stage-num">{index + 1}</span>
        <Heading level={3}>{stage.name}</Heading>
      </HStack>

      {stage.why && (
        <div className="pl-why">
          <Text type="label" weight="semibold" color="accent">왜 이 단계가 있는가</Text>
          <Text>{stage.why}</Text>
        </div>
      )}

      {stage.how && (
        <VStack gap={0.5}>
          <Text type="supporting" weight="semibold">어떻게 (how)</Text>
          <Text type="supporting">{stage.how}</Text>
        </VStack>
      )}

      <ParamTable params={stage.params} />

      {stage.prompt && (
        <details className="pl-prompt">
          <summary>프롬프트 전문 보기</summary>
          <pre className="pl-prompt-pre">{stage.prompt}</pre>
        </details>
      )}

      {stage.output && (
        <VStack gap={0.5}>
          <Text type="supporting" weight="semibold">출력</Text>
          <Text type="supporting">{stage.output}</Text>
        </VStack>
      )}
    </VStack>
  );
}

// ── 단일 파이프라인 상세 ───────────────────────────────────────
function PipelineDetail({ pipeline }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => { setSelectedIndex(0); }, [pipeline.file]);

  if (pipeline.error) {
    return <Text color="accent">파이프라인 파싱 오류: {pipeline.error}</Text>;
  }

  const stages = pipeline.stages || [];
  const selected = stages[selectedIndex];

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

      {/* 본문 2열: SVG 구조도 + 선택 단계 상세 */}
      <div className="pl-body">
        <div className="pl-diagram-col">
          <Text type="supporting" weight="semibold">단계 흐름</Text>
          {stages.length > 0 && (
            <PipelineDiagram
              stages={stages}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
            />
          )}
        </div>
        <div className="pl-detail-col">
          <StageDetail stage={selected} index={selectedIndex} />
        </div>
      </div>

      {/* 알려진 한계 */}
      {Array.isArray(pipeline.knownIssues) && pipeline.knownIssues.length > 0 && (
        <VStack gap={2}>
          <Heading level={3}>알려진 한계</Heading>
          {pipeline.knownIssues.map((issue, i) => (
            <Banner key={i} status="warning" title={`한계 ${i + 1}`} description={issue} />
          ))}
        </VStack>
      )}
    </VStack>
  );
}

export default function PipelineView() {
  const [pipelines, setPipelines] = useState([]);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    listPipelines()
      .then((data) => {
        setPipelines(data);
        if (data.length > 0) setSelectedId(data[0].file);
      })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoaded(true));
  }, []);

  const selected = pipelines.find((p) => p.file === selectedId);

  return (
    <div className="pl-shell">
      <aside className="eval-sidebar">
        <VStack gap={2}>
          <Heading level={3}>파이프라인</Heading>
          {error && <Text type="supporting" color="accent">{error} (dev 서버에서만 동작)</Text>}
          <VStack gap={0.5}>
            {pipelines.map((p) => (
              <button
                key={p.file}
                className={`eval-run-item${selectedId === p.file ? ' is-active' : ''}`}
                onClick={() => setSelectedId(p.file)}
              >
                <span>{p.title || p.file}</span>
              </button>
            ))}
          </VStack>
        </VStack>
      </aside>

      <main className="eval-detail">
        {!loaded && <Spinner />}
        {loaded && !error && pipelines.length === 0 && (
          <Text type="supporting">등록된 파이프라인이 없습니다.</Text>
        )}
        {selected && <PipelineDetail pipeline={selected} />}
      </main>
    </div>
  );
}
