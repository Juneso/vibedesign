import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { VStack } from '@astryxdesign/core/Stack';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Spinner } from '@astryxdesign/core/Spinner';
import { listPipelines, listRuns, getRun, saveLabels } from '../lib/api.js';
import { SERIES_META } from '../lib/seriesMeta.js';
import { PipelineDetail } from './PipelineView.jsx';
import {
  RunList,
  ConnectionsDetail,
  GenericDetail,
  useLabelMap,
  CONNECTIONS_SERIES,
} from './RunBrowser.jsx';

// "기타 eval" — 파이프라인 미연결(pipelineId=null) 시리즈를 모으는 가상 항목
const MISC_ID = '__misc__';

// 파이프라인 정의(pipelines[].id) ↔ 시리즈(SERIES_META[series].pipelineId) 매핑.
// MISC_ID일 때는 pipelineId가 null인 시리즈 전체.
function seriesForPipeline(pipelineId) {
  return Object.entries(SERIES_META)
    .filter(([, m]) => (pipelineId === MISC_ID ? m.pipelineId == null : m.pipelineId === pipelineId))
    .map(([series]) => series);
}

// ── 우측: 활성 파이프라인에 연결된 런 결과 + 라벨링 ──────────────
function RunResults({ runs }) {
  const [selected, setSelected] = useState(null); // {file, series}
  const [runData, setRunData] = useState(null);
  const [loadingRun, setLoadingRun] = useState(false);

  const series = selected?.series || '';
  const isConnections = series === CONNECTIONS_SERIES;
  const [labels, setLabels, labelsLoaded] = useLabelMap(series || '_none');

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  // 활성 파이프라인(=runs 목록) 변경 시 선택 초기화 + 최신 런 자동 선택
  useEffect(() => {
    if (runs.length === 0) { setSelected(null); return; }
    const latest = runs.reduce((a, b) => (b.mtimeMs > a.mtimeMs ? b : a));
    setSelected({ file: latest.file, series: latest.series });
  }, [runs]);

  useEffect(() => {
    if (!selected) { setRunData(null); return; }
    setLoadingRun(true);
    setRunData(null);
    getRun(selected.file)
      .then(setRunData)
      .catch((e) => setRunData({ error: String(e.message || e) }))
      .finally(() => setLoadingRun(false));
  }, [selected]);

  const onSave = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    const body = {
      series: selected.series,
      updatedAt: new Date().toISOString(),
      labels: Object.values(labels).map((l) => ({
        runFile: l.runFile || selected.file,
        key: l.key,
        verdict: l.verdict || '',
        comment: l.comment || '',
        questionFix: l.questionFix || '',
      })),
    };
    try {
      await saveLabels(selected.series, body);
      setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    } catch (e) {
      setSavedAt(`저장 실패: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }, [selected, labels]);

  return (
    <VStack gap={3}>
      <Heading level={3}>Eval 런</Heading>
      {runs.length === 0 && (
        <Text type="supporting">이 파이프라인에 연결된 런이 없습니다.</Text>
      )}
      {runs.length > 0 && (
        <RunList runs={runs} selected={selected?.file} onSelect={setSelected} />
      )}

      {selected && (loadingRun || !runData) && <Spinner />}
      {selected && runData?.error && <Text color="accent">{runData.error}</Text>}
      {selected && runData && !runData.error && (
        isConnections
          ? (labelsLoaded
              ? <ConnectionsDetail
                  runFile={selected.file}
                  series={series}
                  json={runData.json}
                  labels={labels}
                  setLabels={setLabels}
                  onSave={onSave}
                  saving={saving}
                  savedAt={savedAt}
                />
              : <Spinner />)
          : <GenericDetail runFile={selected.file} series={series} json={runData.json} md={runData.md} />
      )}
    </VStack>
  );
}

export default function Dashboard() {
  const [pipelines, setPipelines] = useState([]);
  const [plError, setPlError] = useState(null);
  const [plLoaded, setPlLoaded] = useState(false);
  const [activeId, setActiveId] = useState(null); // pipeline.file 또는 MISC_ID

  const [runs, setRuns] = useState([]);
  const [runsError, setRunsError] = useState(null);

  useEffect(() => {
    listPipelines()
      .then((data) => {
        setPipelines(data);
        if (data.length > 0) setActiveId(data[0].id ?? data[0].file);
        else setActiveId(MISC_ID);
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
  const activeSeries = useMemo(
    () => new Set(seriesForPipeline(activeId)),
    [activeId]
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
          <VStack gap={1}>
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
                    {p.title || p.file}
                  </button>
                );
              })}
              <button
                type="button"
                className={`eval-pl-chip${isMisc ? ' is-active' : ''}`}
                onClick={() => setActiveId(MISC_ID)}
              >
                기타 eval
              </button>
            </div>
          </VStack>

          {!plLoaded && <Spinner />}
          {isMisc && (
            <Text type="supporting">
              파이프라인 미연결 eval 목록입니다. 우측에서 미매핑 시리즈의 런을 확인하세요.
            </Text>
          )}
          {!isMisc && active && <PipelineDetail pipeline={active} />}
          {!isMisc && plLoaded && !active && !plError && (
            <Text type="supporting">등록된 파이프라인이 없습니다.</Text>
          )}
        </VStack>
      </section>

      {/* 우측: 활성 파이프라인의 Eval 결과 */}
      <section className="eval-split-col eval-runs-col">
        {runsError
          ? <Text type="supporting" color="accent">{runsError} (dev 서버에서만 동작)</Text>
          : <RunResults key={activeId} runs={filteredRuns} />}
      </section>
    </div>
  );
}
