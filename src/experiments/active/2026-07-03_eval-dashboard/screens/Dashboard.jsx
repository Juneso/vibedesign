import React, { useEffect, useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/Stack';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Spinner } from '@astryxdesign/core/Spinner';
import { listPipelines, listRuns, getRunStatus } from '../lib/api.js';
import { SERIES_META } from '../lib/seriesMeta.js';
import { PipelineDetail } from './PipelineView.jsx';
import EvalAxes from './EvalAxes.jsx';
import { RunList } from './RunBrowser.jsx';

// "기타 eval" — 파이프라인 미연결(pipelineId=null) 시리즈를 모으는 가상 항목
const MISC_ID = '__misc__';
// "평가축" — 파이프라인이 아니라 "무엇을 왜 재는가"를 모아 보는 가상 항목
const AXES_ID = '__axes__';

// 파이프라인 정의(pipelines[].id) ↔ 시리즈(SERIES_META[series].pipelineId) 매핑.
// MISC_ID일 때는 pipelineId가 null인 시리즈 전체.
function seriesForPipeline(pipelineId) {
  return Object.entries(SERIES_META)
    .filter(([, m]) => (pipelineId === MISC_ID ? m.pipelineId == null : m.pipelineId === pipelineId))
    .map(([series]) => series);
}

// ── 우측: 활성 파이프라인에 연결된 런 아코디언 목록 + 행별 라벨링 ────
function RunResults({ runs, statusMap }) {
  return (
    <VStack gap={3}>
      <Heading level={3}>Eval 런</Heading>
      {runs.length === 0 && (
        <Text type="supporting">이 파이프라인에 연결된 런이 없습니다.</Text>
      )}
      {runs.length > 0 && <RunList runs={runs} statusMap={statusMap} />}
    </VStack>
  );
}

// 셸 사이드바가 URL ?pipeline=<file|__misc__> 로 선택을 구동할 때의 값.
// 값이 있으면 대시보드 내부 파이프라인 선택 컬럼을 숨기고 이 파이프라인을 고정한다.
const URL_PIPELINE = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('pipeline');

export default function Dashboard() {
  const [pipelines, setPipelines] = useState([]);
  const [plError, setPlError] = useState(null);
  const [plLoaded, setPlLoaded] = useState(false);
  const [activeId, setActiveId] = useState(null); // pipeline.file 또는 MISC_ID
  const drivenByUrl = URL_PIPELINE != null && URL_PIPELINE !== '';

  const [runs, setRuns] = useState([]);
  const [runsError, setRunsError] = useState(null);
  const [statusMap, setStatusMap] = useState({});

  useEffect(() => {
    getRunStatus().then(setStatusMap).catch(() => setStatusMap({}));
  }, []);

  useEffect(() => {
    listPipelines()
      .then((raw) => {
        // 최신 버전이 위로 — pipelines/*.json 의 order 내림차순 (없으면 0, 동률은 제목순)
        const data = [...raw].sort((a, b) => (b.order ?? 0) - (a.order ?? 0) || String(a.title || '').localeCompare(String(b.title || '')));
        setPipelines(data);
        if (drivenByUrl) {
          if (URL_PIPELINE === MISC_ID) {
            setActiveId(MISC_ID);
          } else {
            const match = data.find((p) => p.file === URL_PIPELINE);
            setActiveId(match ? (match.id ?? match.file) : MISC_ID);
          }
        } else if (data.length > 0) {
          setActiveId(data[0].id ?? data[0].file);
        } else {
          setActiveId(MISC_ID);
        }
      })
      .catch((e) => setPlError(String(e.message || e)))
      .finally(() => setPlLoaded(true));
  }, []);

  useEffect(() => {
    listRuns().then(setRuns).catch((e) => setRunsError(String(e.message || e)));
  }, []);

  const active = pipelines.find((p) => (p.id ?? p.file) === activeId);
  const isMisc = activeId === MISC_ID;

  // 우측에 표시할 런: 활성 파이프라인에 연결된 시리즈의 런만
  // seriesMeta 에 등록되지 않은 시리즈는 그동안 어디에도 안 나왔다 —
  // V9 계열이 2주 넘게 보이지 않은 원인. 미등록분은 "기타 eval" 로 흘려보내
  // 최소한 눈에는 띄게 한다(등록하면 제대로 된 이름·파이프라인으로 옮겨간다).
  const unregistered = useMemo(() => {
    const known = new Set(Object.keys(SERIES_META));
    return [...new Set(runs.map((r) => r.series).filter((s) => !known.has(s)))];
  }, [runs]);

  const activeSeries = useMemo(
    () => new Set([
      ...seriesForPipeline(activeId),
      ...(activeId === MISC_ID ? unregistered : []),
    ]),
    [activeId, unregistered]
  );
  const filteredRuns = useMemo(
    () => runs.filter((r) => activeSeries.has(r.series)),
    [runs, activeSeries]
  );

  return (
    <div className="eval-split">
      {/* 좌측: 파이프라인 선택 + 구조도 */}
      <section className="eval-split-col eval-pipeline-col">
        <VStack gap={3}>
          {!drivenByUrl && <VStack gap={1}>
            <Heading level={3}>파이프라인</Heading>
            {plError && <Text type="supporting" color="accent">{plError} (dev 서버에서만 동작)</Text>}
            <div className="eval-pl-chips">
              {pipelines.map((p) => {
                const id = p.id ?? p.file;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`eval-pl-chip${activeId === id ? ' is-active' : ''}`}
                    onClick={() => setActiveId(id)}
                  >
                    {p.shortTitle || p.title || p.file}
                  </button>
                );
              })}
              <button
                type="button"
                className={`eval-pl-chip${activeId === AXES_ID ? ' is-active' : ''}`}
                onClick={() => setActiveId(AXES_ID)}
              >
                평가축
              </button>
              <button
                type="button"
                className={`eval-pl-chip${isMisc ? ' is-active' : ''}`}
                onClick={() => setActiveId(MISC_ID)}
              >
                기타 eval
              </button>
            </div>
          </VStack>}

          {!plLoaded && <Spinner />}
          {activeId === AXES_ID && <EvalAxes />}
          {isMisc && (
            <VStack gap={1}>
              <Text type="supporting">
                파이프라인 미연결 eval 목록입니다. 우측에서 미매핑 시리즈의 런을 확인하세요.
              </Text>
              {unregistered.length > 0 && (
                <Text type="supporting" color="accent">
                  seriesMeta 미등록 {unregistered.length}종이 여기 섞여 있습니다 — {unregistered.join(', ')}
                </Text>
              )}
            </VStack>
          )}
          {!isMisc && active && (
            <PipelineDetail
              pipeline={active}
              onRenamed={(name) => setPipelines((prev) =>
                prev.map((q) => (q.file === active.file ? { ...q, shortTitle: name } : q)))}
            />
          )}
          {!isMisc && activeId !== AXES_ID && plLoaded && !active && !plError && (
            <Text type="supporting">등록된 파이프라인이 없습니다.</Text>
          )}
        </VStack>
      </section>

      {/* 우측: 활성 파이프라인의 Eval 결과. 평가축 화면은 자체 표를 들고 있어 우측을 비운다. */}
      {activeId !== AXES_ID && <section className="eval-split-col eval-runs-col">
        {runsError
          ? <Text type="supporting" color="accent">{runsError} (dev 서버에서만 동작)</Text>
          : <RunResults key={activeId} runs={filteredRuns} statusMap={statusMap} />}
      </section>}
    </div>
  );
}
