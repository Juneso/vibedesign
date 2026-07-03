import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Stack';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Spinner } from '@astryxdesign/core/Spinner';
import { listRuns, getRun, getLabels, saveLabels } from '../lib/api.js';
import { SERIES_META, seriesTitle, iterationLabel } from '../lib/seriesMeta.js';

// mtime → 'M월 D일'
function fmtMonthDay(mtimeMs) {
  if (!mtimeMs) return null;
  const d = new Date(mtimeMs);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const CONNECTIONS_SERIES = 'connections-qf';

// 후보 카드의 안정적 key: canonical|memberUnits.join('-')
function candKey(item) {
  const units = Array.isArray(item.memberUnits) ? item.memberUnits.join('-') : '';
  return `${item.canonical || ''}|${units}`;
}

function useLabelMap(series) {
  const [labels, setLabels] = useState({}); // key -> {verdict, comment, questionFix}
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    getLabels(series)
      .then((data) => {
        if (!alive) return;
        const map = {};
        (data.labels || []).forEach((l) => { map[l.key] = l; });
        setLabels(map);
      })
      .catch(() => { if (alive) setLabels({}); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [series]);

  return [labels, setLabels, loaded];
}

// ── 좌측: 시리즈 그룹 런 목록 ────────────────────────────────
function RunList({ runs, selected, onSelect }) {
  const groups = useMemo(() => {
    const m = new Map();
    runs.forEach((r) => {
      if (!m.has(r.series)) m.set(r.series, []);
      m.get(r.series).push(r);
    });
    return [...m.entries()].sort((a, b) => {
      const am = Math.max(...a[1].map((r) => r.mtimeMs));
      const bm = Math.max(...b[1].map((r) => r.mtimeMs));
      return bm - am;
    });
  }, [runs]);

  const [open, setOpen] = useState(() => new Set());
  const toggle = (s) => setOpen((prev) => {
    const next = new Set(prev);
    next.has(s) ? next.delete(s) : next.add(s);
    return next;
  });

  return (
    <VStack gap={0.5}>
      {groups.map(([series, items]) => {
        const isOpen = open.has(series);
        return (
          <div key={series} className="eval-runlist-group">
            <button className="eval-series-toggle" onClick={() => toggle(series)}>
              <span>{isOpen ? '▾' : '▸'}</span>
              <span className="eval-series-title">
                {seriesTitle(series)}
                {SERIES_META[series]?.purpose && (
                  <span className="eval-series-purpose">{SERIES_META[series].purpose}</span>
                )}
              </span>
              <Badge variant="neutral" label={String(items.length)} />
            </button>
            {isOpen && items.map((r) => (
              <button
                key={r.file}
                className={`eval-run-item${selected === r.file ? ' is-active' : ''}`}
                onClick={() => onSelect(r)}
              >
                <span>{iterationLabel(r.file)}</span>
                {fmtMonthDay(r.mtimeMs) && (
                  <span className="eval-run-date">{fmtMonthDay(r.mtimeMs)}</span>
                )}
              </button>
            ))}
          </div>
        );
      })}
    </VStack>
  );
}

// ── connections-qf 후보 카드 ───────────────────────────────
function CandidateCard({ item, runFile, label, onChange }) {
  const verdict = label?.verdict || '';
  const comment = label?.comment || '';
  const questionFix = label?.questionFix || '';
  const reason = item._pairV?.reason || item.reason;

  return (
    <Card padding={4}>
      <VStack gap={2}>
        <VStack gap={1}>
          <Text type="label" weight="semibold">{item.canonical}</Text>
          <HStack gap={1} wrap="wrap">
            {(item.books || []).map((b, i) => (
              <Badge key={i} variant="blue" label={b} />
            ))}
            {typeof item.qsim === 'number' && (
              <Badge variant="neutral" label={`qsim ${item.qsim.toFixed(3)}`} />
            )}
            {typeof item.tsim === 'number' && (
              <Badge variant="neutral" label={`tsim ${item.tsim.toFixed(3)}`} />
            )}
            {Array.isArray(item.memberUnits) && (
              <Badge variant="neutral" label={`units ${item.memberUnits.join(', ')}`} />
            )}
          </HStack>
        </VStack>

        {reason && (
          <Text type="supporting">{reason}</Text>
        )}

        <SegmentedControl
          label="판정"
          size="sm"
          value={verdict}
          onChange={(v) => onChange({ verdict: v, comment, questionFix })}
        >
          <SegmentedControlItem value="pass" label="✅ pass" />
          <SegmentedControlItem value="fail" label="❌ fail" />
          <SegmentedControlItem value="hold" label="보류" />
        </SegmentedControl>

        <TextArea
          label="코멘트"
          isLabelHidden
          placeholder="코멘트"
          value={comment}
          onChange={(v) => onChange({ verdict, comment: v, questionFix })}
        />
        <TextInput
          label="질문 교정안"
          isLabelHidden
          placeholder="질문 교정안 (선택)"
          value={questionFix}
          onChange={(v) => onChange({ verdict, comment, questionFix: v })}
        />
      </VStack>
    </Card>
  );
}

function ConnectionsDetail({ runFile, series, json, labels, setLabels, onSave, saving, savedAt }) {
  const kept = json.kept || [];
  const dropped = json.dropped || [];

  const setLabel = useCallback((key, patch) => {
    setLabels((prev) => ({
      ...prev,
      [key]: { key, runFile, ...prev[key], ...patch },
    }));
  }, [setLabels, runFile]);

  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center" hAlign="between">
        <Heading level={2}>{seriesTitle(series)} · {iterationLabel(runFile)}</Heading>
        <HStack gap={2} vAlign="center">
          {savedAt && <Text type="supporting">저장됨 {savedAt}</Text>}
          <Button label="저장" variant="primary" isLoading={saving} onClick={onSave} />
        </HStack>
      </HStack>

      <Text type="supporting">kept {kept.length} · dropped {dropped.length}</Text>

      <VStack gap={2}>
        {kept.map((item) => {
          const key = candKey(item);
          return (
            <CandidateCard
              key={key}
              item={item}
              runFile={runFile}
              label={labels[key]}
              onChange={(patch) => setLabel(key, patch)}
            />
          );
        })}
      </VStack>

      {dropped.length > 0 && (
        <div className="eval-dropped">
          <VStack gap={2}>
            <Heading level={3}>Dropped</Heading>
            {dropped.map((item) => {
              const key = candKey(item);
              return (
                <CandidateCard
                  key={key}
                  item={item}
                  runFile={runFile}
                  label={labels[key]}
                  onChange={(patch) => setLabel(key, patch)}
                />
              );
            })}
          </VStack>
        </div>
      )}
    </VStack>
  );
}

// ── 제네릭 뷰 (md 우선, 없으면 JSON pretty) ──────────────────
function GenericDetail({ runFile, series, json, md }) {
  return (
    <VStack gap={2}>
      <Heading level={2}>{seriesTitle(series)} · {iterationLabel(runFile)}</Heading>
      <pre className="eval-md-pre">{md != null ? md : JSON.stringify(json, null, 2)}</pre>
    </VStack>
  );
}

export default function RunBrowser() {
  const [runs, setRuns] = useState([]);
  const [runsError, setRunsError] = useState(null);
  const [selected, setSelected] = useState(null); // {file, series}
  const [runData, setRunData] = useState(null); // {json, md}
  const [loadingRun, setLoadingRun] = useState(false);

  useEffect(() => {
    listRuns().then(setRuns).catch((e) => setRunsError(String(e.message || e)));
  }, []);

  const series = selected?.series || '';
  const isConnections = series === CONNECTIONS_SERIES;
  const [labels, setLabels, labelsLoaded] = useLabelMap(series || '_none');

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    if (!selected) return;
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
    <div className="eval-shell">
      <aside className="eval-sidebar">
        <VStack gap={2}>
          <Heading level={3}>Eval 런</Heading>
          {runsError && <Text type="supporting" color="accent">{runsError} (dev 서버에서만 동작)</Text>}
          <RunList runs={runs} selected={selected?.file} onSelect={setSelected} />
        </VStack>
      </aside>

      <main className="eval-detail">
        {!selected && <Text type="supporting">좌측에서 런을 선택하세요.</Text>}
        {selected && (loadingRun || !runData) && <Spinner />}
        {selected && runData?.error && (
          <Text color="accent">{runData.error}</Text>
        )}
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
      </main>
    </div>
  );
}
