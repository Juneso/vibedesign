import React, { useEffect, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/Stack';
import { Text, Heading } from '@astryxdesign/core/Text';
import { savePipelineName } from '../lib/api.js';
import { Markdown, mdInline } from '../lib/md.jsx';

// ── 흐름도 렌더러 ────────────────────────────────────────────
// 파이프라인 구조도는 Mermaid(flowchart)로 그린다. 노드 좌표를 손으로 박아두는 대신
// 정의 파일에는 그래프(무엇이 무엇으로 흐르는가)만 두고 배치는 Mermaid 의 dagre 레이아웃에 맡긴다.
// 라이브러리 선택 근거는 이 폴더의 README 대신 커밋 메시지 참조 —
// Mermaid 89k★ / xyflow(React Flow) 38k★ 중, "자동 배치가 내장"이고
// "정의가 마크다운 코드블록 문법 그대로"라는 두 조건을 모두 만족하는 쪽이 Mermaid 다.
// mermaid 는 무거워서(≈500kB) 정적 import 하면 대시보드 초기 청크에 통째로 실린다.
// 흐름도를 처음 그릴 때 한 번만 동적 로드한다.
let mermaidPromise = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        fontFamily: 'inherit',
        flowchart: {
          htmlLabels: true, curve: 'basis', nodeSpacing: 34, rankSpacing: 44, padding: 8,
          // 역할 묶음 제목이 묶음 위쪽 테두리에 걸쳐 그려져서, 여백을 주지 않으면
          // 바깥에서 들어오는 화살표가 제목 글자를 관통한다.
          subGraphTitleMargin: { top: 6, bottom: 12 },
        },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

// 노드 종류(data = 산출물 / proc = 처리 단계 / human = 사람 개입)는 정의 파일에서 `:::data` 처럼
// 붙이고, 색은 style.css 가 맡는다. Mermaid 의 classDef 는 `var(--토큰)` 을 파싱하지 못해
// (괄호가 구문과 충돌) 디자인 토큰을 쓰려면 CSS 쪽에서 입히는 수밖에 없다.

let mmdSeq = 0;

// 렌더된 svg 의 노드 <g> 에서 원본 노드 id 를 되찾는다.
// Mermaid 는 id 를 `<렌더id>-flowchart-<노드id>-<일련번호>` 형태로 붙인다.
function nodeIdOf(el) {
  const m = (el.id || '').match(/flowchart-(.+)-\d+$/);
  return m ? m[1] : null;
}

function MermaidFlow({ code, selectedId, onSelect, clickable }) {
  const hostRef = useRef(null);
  const [svg, setSvg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    const id = `pl-mmd-${mmdSeq++}`;
    loadMermaid()
      .then((mermaid) => mermaid.render(id, `${code}\n`))
      .then((res) => { if (alive) setSvg(res.svg); })
      .catch((e) => { if (alive) { setSvg(null); setError(String(e?.message || e)); } });
    return () => { alive = false; };
  }, [code]);

  // 처리 노드에 클릭·선택 상태를 입힌다. Mermaid 가 만든 DOM 을 직접 손대는 유일한 지점.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !svg) return;
    const nodes = Array.from(host.querySelectorAll('.node'));
    const offs = [];
    nodes.forEach((el) => {
      const nid = nodeIdOf(el);
      if (!nid || !clickable.has(nid)) return;
      el.classList.add('is-clickable');
      el.classList.toggle('is-selected', nid === selectedId);
      const handler = () => onSelect(nid);
      el.addEventListener('click', handler);
      offs.push(() => el.removeEventListener('click', handler));
    });
    return () => offs.forEach((f) => f());
  }, [svg, selectedId, onSelect, clickable]);

  if (error) {
    return <Text type="supporting" color="accent">흐름도를 그리지 못했습니다: {error}</Text>;
  }
  if (!svg) return <Text type="supporting">흐름도 그리는 중…</Text>;

  return (
    <div
      ref={hostRef}
      className="pl-mermaid"
      // eslint-disable-next-line react/no-danger -- mermaid.render 가 만든 svg. 입력은 레포 안의 정의 파일뿐이다.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ── 문서 제목 — 더블클릭하면 고칠 수 있고, 저장하면 pipelines/*.json 의 shortTitle 에 반영된다.
// (사이드바 칩에서 편집하면 칩의 onClick 이 먼저 두 번 발화해 편집 진입이 방해받아 본문으로 옮겼다)
function EditableTitle({ pipeline, onRenamed }) {
  const name = pipeline.shortTitle || pipeline.title || pipeline.file;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const commit = async () => {
    const next = draft.trim();
    if (!next || next === name) { setEditing(false); return; }
    setSaving(true);
    try {
      await savePipelineName(pipeline.file, next);
      onRenamed?.(next);
      // 셸 사이드바(부모 프레임) 라벨도 같은 이름으로 맞춘다
      try { window.parent?.postMessage({ type: 'pipeline-renamed', file: pipeline.file, shortTitle: next }, '*'); } catch { /* noop */ }
      setEditing(false);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div>
        <input
          className="pl-title-input"
          value={draft}
          autoFocus
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); setDraft(name); setEditing(false); }
          }}
          aria-label="파이프라인 이름 편집"
        />
        {error && <Text type="supporting" color="accent">저장 실패: {error}</Text>}
      </div>
    );
  }

  return (
    <Heading level={2}>
      <span
        className="pl-title-editable"
        onDoubleClick={() => { setDraft(name); setError(null); setEditing(true); }}
        title="더블클릭하면 이름을 고칠 수 있어요"
      >
        {name}
      </span>
    </Heading>
  );
}

// 파라미터 — 칩+펼침 대신 마크다운 표. 이름·값·뜻·바꾸면 네 칸이 한눈에 들어온다.
function ParamTable({ params }) {
  if (!Array.isArray(params) || params.length === 0) return null;
  return (
    <table className="eval-md-table pl-param-table">
      <thead>
        <tr><th>파라미터</th><th>값</th><th>뜻</th><th>바꾸면</th></tr>
      </thead>
      <tbody>
        {params.map((p, i) => (
          <tr key={i}>
            <td><code className="eval-md-code">{p.name}</code></td>
            <td>{String(p.value)}</td>
            <td>{p.meaning ? mdInline(p.meaning) : '—'}</td>
            <td>{p.effect ? mdInline(p.effect) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── 한 단계의 상세 — 전부 마크다운 위계(소제목 + 불렛 + 표)로 표현한다 ──
function StageDetail({ stage, index }) {
  const f = stage.funnel || {};
  const flow = (f.in != null || f.out != null)
    ? `들어온 것 ${f.in != null ? `${f.in}개` : '집계 없음'} → 통과 ${f.out != null ? `${f.out}개` : '집계 없음'}`
    : null;

  return (
    <section className="eval-md-section pl-stage-detail">
      <h4 className="eval-md-h">{index + 1}. {stage.name}</h4>

      {stage.why && (
        <>
          <h5 className="eval-md-h5">왜 필요한가</h5>
          <Markdown source={stage.why} />
        </>
      )}

      {stage.how && (
        <>
          <h5 className="eval-md-h5">어떻게 하나</h5>
          <Markdown source={stage.how} />
        </>
      )}

      {Array.isArray(stage.params) && stage.params.length > 0 && (
        <>
          <h5 className="eval-md-h5">파라미터</h5>
          <ParamTable params={stage.params} />
        </>
      )}

      {(stage.output || flow) && (
        <>
          <h5 className="eval-md-h5">나오는 것</h5>
          <ul className="eval-md-list">
            {stage.output && <li>{mdInline(stage.output)}</li>}
            {flow && <li>{flow}</li>}
          </ul>
        </>
      )}

      {stage.prompt && (
        <details className="eval-md-collapse pl-prompt">
          <summary>이 단계의 프롬프트 전문 보기</summary>
          <pre className="eval-md-pre">{stage.prompt}</pre>
        </details>
      )}
    </section>
  );
}

function FlowSection({ pipeline }) {
  const stages = pipeline.stages || [];
  const diagram = pipeline.diagram || {};
  const stageOf = diagram.stageOf || {};
  const [selectedId, setSelectedId] = useState(null);

  const clickable = React.useMemo(() => new Set(Object.keys(stageOf)), [stageOf]);
  const onSelect = React.useCallback(
    (nid) => setSelectedId((cur) => (cur === nid ? null : nid)),
    []
  );

  if (!diagram.flowchart) return null;

  const selStage = selectedId ? stages.find((s) => s.id === stageOf[selectedId]) : null;
  const selIndex = selStage ? stages.indexOf(selStage) : -1;

  return (
    <section className="eval-md-section">
      <h4 className="eval-md-h">흐름도</h4>
      <p className="eval-md-p pl-flow-hint">
        큰 상자는 <b>역할 묶음</b>(①②③…)이고, 그 안에서 번호가 붙은 <b>처리 단계</b>를 누르면 아래에 설명이 열립니다.
        번호는 아래 상세 제목의 번호와 같습니다. 옅은 테두리는 데이터, 점선은 사람이 보는 지점입니다.
      </p>
      <MermaidFlow
        code={diagram.flowchart}
        selectedId={selectedId}
        onSelect={onSelect}
        clickable={clickable}
      />
      {selStage
        ? <StageDetail stage={selStage} index={selIndex} />
        : <p className="eval-md-p pl-flow-hint">아직 고른 단계가 없습니다.</p>}
    </section>
  );
}

// diagram 이 없는 정의를 위한 폴백 — 단계를 순서대로 모두 펼친다.
function StageListFallback({ stages }) {
  return (
    <section className="eval-md-section">
      <h4 className="eval-md-h">단계</h4>
      {stages.map((s, i) => <StageDetail key={s.id || i} stage={s} index={i} />)}
    </section>
  );
}

export function PipelineDetail({ pipeline, onRenamed }) {
  if (pipeline.error) {
    return <Text color="accent">파이프라인 파싱 오류: {pipeline.error}</Text>;
  }
  const stages = pipeline.stages || [];

  return (
    <VStack gap={3}>
      <VStack gap={1}>
        {/* 문서 제목(더블클릭 편집). 원래의 긴 설명형 제목은 아래 줄에 남긴다 */}
        <EditableTitle pipeline={pipeline} onRenamed={onRenamed} />
        {pipeline.shortTitle && pipeline.title && pipeline.title !== pipeline.shortTitle && (
          <Text type="supporting">{pipeline.title}</Text>
        )}
        {pipeline.script && (
          <Text type="supporting"><code>{pipeline.script}</code></Text>
        )}
      </VStack>

      <div className="eval-md pl-doc">
        {pipeline.goal && (
          <section className="eval-md-section">
            <h4 className="eval-md-h">한 줄 요약</h4>
            <Markdown source={pipeline.goal} />
          </section>
        )}

        {pipeline.designIntent && (
          <section className="eval-md-section">
            <h4 className="eval-md-h">왜 이렇게 만들었나</h4>
            <Markdown source={pipeline.designIntent} />
          </section>
        )}

        {pipeline.diagram?.flowchart
          ? <FlowSection pipeline={pipeline} />
          : (stages.length > 0 && <StageListFallback stages={stages} />)}

        {Array.isArray(pipeline.knownIssues) && pipeline.knownIssues.length > 0 && (
          <section className="eval-md-section">
            <h4 className="eval-md-h">알려진 한계</h4>
            <ul className="eval-md-list">
              {pipeline.knownIssues.map((issue, i) => <li key={i}>{mdInline(issue)}</li>)}
            </ul>
          </section>
        )}
      </div>
    </VStack>
  );
}
