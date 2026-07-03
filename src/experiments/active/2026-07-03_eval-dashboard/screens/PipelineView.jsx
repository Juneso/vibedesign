import React, { useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/Stack';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Spinner } from '@astryxdesign/core/Spinner';
import { listPipelines } from '../lib/api.js';

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

function PipelineDetail({ pipeline }) {
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

      {/* 상세 구조도: 각 단계 내부를 펼침 */}
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
