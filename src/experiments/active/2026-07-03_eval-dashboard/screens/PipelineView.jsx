import React, { useEffect, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Stack';
import { Card } from '@astryxdesign/core/Card';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
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

// ── 단계 카드 (아코디언) ───────────────────────────────────────
function StageCard({ stage, index, total }) {
  const [open, setOpen] = useState(false);
  const funnel = fmtFunnel(stage.funnel);

  return (
    <div className="pl-stage-wrap">
      <Card padding={0}>
        <button
          className="pl-stage-head"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <HStack gap={2} vAlign="center" hAlign="between">
            <HStack gap={2} vAlign="center">
              <span className="pl-stage-num">{index + 1}</span>
              <Text type="label" weight="semibold">{stage.name}</Text>
            </HStack>
            <HStack gap={2} vAlign="center">
              {funnel && <Badge variant="blue" label={funnel} />}
              <span className="pl-stage-caret">{open ? '▾' : '▸'}</span>
            </HStack>
          </HStack>
        </button>

        {open && (
          <div className="pl-stage-body">
            <VStack gap={3}>
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
          </div>
        )}
      </Card>
      {index < total - 1 && <div className="pl-arrow">↓</div>}
    </div>
  );
}

// ── 단일 파이프라인 상세 ───────────────────────────────────────
function PipelineDetail({ pipeline }) {
  if (pipeline.error) {
    return <Text color="accent">파이프라인 파싱 오류: {pipeline.error}</Text>;
  }
  return (
    <VStack gap={4}>
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

      <VStack gap={0}>
        <Text type="supporting" weight="semibold">단계 흐름</Text>
        <div className="pl-funnel">
          {(pipeline.stages || []).map((s, i) => (
            <StageCard key={s.id || i} stage={s} index={i} total={pipeline.stages.length} />
          ))}
        </div>
      </VStack>

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
