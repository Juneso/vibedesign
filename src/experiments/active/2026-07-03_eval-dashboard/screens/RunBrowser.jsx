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
import { getLabels, getRun, saveLabels } from '../lib/api.js';
import { SERIES_META, seriesTitle, iterationLabel } from '../lib/seriesMeta.js';

// mtime → 'M월 D일'
function fmtMonthDay(mtimeMs) {
  if (!mtimeMs) return null;
  const d = new Date(mtimeMs);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export const CONNECTIONS_SERIES = 'connections-qf';

// 후보 카드의 안정적 key: canonical|memberUnits.join('-')
function candKey(item) {
  const units = Array.isArray(item.memberUnits) ? item.memberUnits.join('-') : '';
  return `${item.canonical || ''}|${units}`;
}

export function useLabelMap(series) {
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

// 런 본문 lazy 로드 캐시 (파일명 → {json, md} 또는 {error})
const RUN_CACHE = new Map();

function loadRun(file) {
  if (RUN_CACHE.has(file)) return Promise.resolve(RUN_CACHE.get(file));
  return getRun(file)
    .then((data) => { RUN_CACHE.set(file, data); return data; })
    .catch((e) => { const err = { error: String(e.message || e) }; return err; });
}

// ── 하나의 런 행: 헤더(토글 + 상태/저장 버튼) + 펼침 본문 ──────────
// 라벨맵·데이터·저장 상태를 행 단위로 소유한다.
function RunRow({ run, expanded, onToggle }) {
  const { file, series } = run;
  const isConnections = series === CONNECTIONS_SERIES;

  const [data, setData] = useState(() => RUN_CACHE.get(file) || null);
  const [loading, setLoading] = useState(!RUN_CACHE.has(file));

  const [labels, setLabels, labelsLoaded] = useLabelMap(
    expanded && isConnections ? series : '_none'
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const readOnly = run.readOnly;
  const status = run.status;

  // 펼침 시 lazy 로드 (캐시 재사용)
  useEffect(() => {
    if (!expanded) return;
    let alive = true;
    if (RUN_CACHE.has(file)) { setData(RUN_CACHE.get(file)); setLoading(false); return; }
    setLoading(true);
    loadRun(file).then((d) => { if (alive) { setData(d); setLoading(false); } });
    return () => { alive = false; };
  }, [expanded, file]);

  const onSave = useCallback(async () => {
    setSaving(true);
    const body = {
      series,
      updatedAt: new Date().toISOString(),
      labels: Object.values(labels).map((l) => ({
        runFile: l.runFile || file,
        key: l.key,
        verdict: l.verdict || '',
        comment: l.comment || '',
        questionFix: l.questionFix || '',
      })),
    };
    try {
      await saveLabels(series, body);
      setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    } catch (e) {
      setSavedAt(`저장 실패: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }, [series, file, labels]);

  // 행 우측 버튼: done/applied → disabled, 활성 → 저장
  let action;
  if (status === 'done') {
    action = <Button label="종료됨" size="sm" variant="secondary" isDisabled />;
  } else if (status === 'applied') {
    action = <Button label="반영됨" size="sm" variant="secondary" isDisabled />;
  } else {
    // 활성 런: connections면 저장 동작, 아니면 저장할 라벨 스키마 없음
    action = isConnections
      ? (
        <HStack gap={2} vAlign="center">
          {savedAt && <span className="eval-run-date">{savedAt}</span>}
          <Button label="저장" size="sm" variant="primary" isLoading={saving} isDisabled={!expanded} onClick={onSave} />
        </HStack>
      )
      : <Button label="저장" size="sm" variant="secondary" isDisabled />;
  }

  return (
    <div className={`eval-run-row${expanded ? ' is-expanded' : ''}`}>
      <div className="eval-run-head">
        <button
          className={`eval-run-item${expanded ? ' is-active' : ''}`}
          onClick={onToggle}
        >
          <span>{expanded ? '▾' : '▸'} {iterationLabel(file)}</span>
          {fmtMonthDay(run.mtimeMs) && (
            <span className="eval-run-date">{fmtMonthDay(run.mtimeMs)}</span>
          )}
        </button>
        <div className="eval-run-action">{action}</div>
      </div>

      {expanded && (
        <div className="eval-run-body">
          {(loading || !data) && <Spinner />}
          {data?.error && <Text color="accent">{data.error}</Text>}
          {data && !data.error && (
            isConnections
              ? (labelsLoaded
                  ? <ConnectionsDetail
                      runFile={file}
                      json={data.json}
                      labels={labels}
                      setLabels={setLabels}
                      readOnly={readOnly}
                    />
                  : <Spinner />)
              : <GenericDetail json={data.json} md={data.md} />
          )}
        </div>
      )}
    </div>
  );
}

// ── 시리즈 그룹 + 행별 아코디언 ─────────────────────────────
export function RunList({ runs, statusMap }) {
  const status = statusMap || {};
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

  // 시리즈 그룹 접힘 상태
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const toggleGroup = (s) => setOpenGroups((prev) => {
    const next = new Set(prev);
    next.has(s) ? next.delete(s) : next.add(s);
    return next;
  });

  // 한 번에 하나의 런만 펼침
  const [openRun, setOpenRun] = useState(null);

  return (
    <VStack gap={0.5}>
      {groups.map(([series, items]) => {
        const isOpen = openGroups.has(series);
        return (
          <div key={series} className="eval-runlist-group">
            <button className="eval-series-toggle" onClick={() => toggleGroup(series)}>
              <span>{isOpen ? '▾' : '▸'}</span>
              <span className="eval-series-title">
                {seriesTitle(series)}
                {SERIES_META[series]?.purpose && (
                  <span className="eval-series-purpose">{SERIES_META[series].purpose}</span>
                )}
              </span>
              <Badge variant="neutral" label={String(items.length)} />
            </button>
            {isOpen && items.map((r) => {
              const st = status[r.file];
              const readOnly = st === 'done' || st === 'applied';
              const expanded = openRun === r.file;
              return (
                <RunRow
                  key={r.file}
                  run={{ ...r, status: st, readOnly }}
                  expanded={expanded}
                  onToggle={() => setOpenRun(expanded ? null : r.file)}
                />
              );
            })}
          </div>
        );
      })}
    </VStack>
  );
}

// ── connections-qf 후보 카드 ───────────────────────────────
function CandidateCard({ item, runFile, label, onChange, readOnly }) {
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
          isDisabled={readOnly}
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
          isDisabled={readOnly}
          onChange={(v) => onChange({ verdict, comment: v, questionFix })}
        />
        <TextInput
          label="질문 교정안"
          isLabelHidden
          placeholder="질문 교정안 (선택)"
          value={questionFix}
          isDisabled={readOnly}
          onChange={(v) => onChange({ verdict, comment, questionFix: v })}
        />
      </VStack>
    </Card>
  );
}

export function ConnectionsDetail({ runFile, json, labels, setLabels, readOnly }) {
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
              readOnly={readOnly}
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
                  readOnly={readOnly}
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
export function GenericDetail({ json, md }) {
  return (
    <VStack gap={2}>
      <pre className="eval-md-pre">{md != null ? md : JSON.stringify(json, null, 2)}</pre>
    </VStack>
  );
}
