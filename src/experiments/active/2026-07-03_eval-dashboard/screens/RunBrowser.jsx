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
import { TreeSvg } from './TreeSvg.jsx';
import { parseMd, mdInline, MdSection } from '../lib/md.jsx';

// mtime → 'M월 D일'
// 실행 시각 — API 가 runAt(json runAt → git 커밋 → mtime 순)으로 해석해 내려준다.
// mtime 만 쓰면 체크아웃·리베이스로 전부 현재 시각이 되어 최신순 정렬이 무너진다.
function runTime(run) {
  const t = run?.runAt ? Date.parse(run.runAt) : (run?.mtimeMs || 0);
  return Number.isFinite(t) ? t : 0;
}

function fmtDateTime(run) {
  const t = runTime(run);
  if (!t) return null;
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}

// 시리즈 그룹 헤더에 붙일 "가장 최근 실행" 시각
function latestOf(items) {
  if (!items?.length) return null;
  return fmtDateTime(items.reduce((a, b) => (runTime(b) > runTime(a) ? b : a)));
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
          <span>{expanded ? '▾' : '▸'} {run.label || iterationLabel(file)}</span>
          {fmtDateTime(run) && (
            <span className="eval-run-date">{fmtDateTime(run)}</span>
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
    // 그룹 안은 최신 런이 위로, 그룹끼리는 가장 최근에 돈 시리즈가 위로
    for (const [, items] of m) items.sort((x, y) => runTime(y) - runTime(x));
    return [...m.entries()].sort((a, b) => {
      const am = Math.max(...a[1].map(runTime));
      const bm = Math.max(...b[1].map(runTime));
      return bm - am;
    });
  }, [runs]);

  // 기본 펼침. runs 는 비동기로 도착하므로 "열린 것"이 아니라 "사용자가 닫은 것"을 추적한다
  // (열린 목록을 초기 state 로 잡으면 첫 렌더의 빈 배열로 굳어 아무것도 펼쳐지지 않는다)
  const [closedGroups, setClosedGroups] = useState(() => new Set());
  const toggleGroup = (s) => setClosedGroups((prev) => {
    const next = new Set(prev);
    next.has(s) ? next.delete(s) : next.add(s);
    return next;
  });

  // 런도 기본 펼침. 아코디언이 아니라 여러 런을 동시에 열어둘 수 있다
  const [closedRuns, setClosedRuns] = useState(() => new Set());
  const toggleRun = (file) => setClosedRuns((prev) => {
    const next = new Set(prev);
    next.has(file) ? next.delete(file) : next.add(file);
    return next;
  });

  return (
    <VStack gap={0.5}>
      {groups.map(([series, items]) => {
        const isOpen = !closedGroups.has(series);
        return (
          <div key={series} className="eval-runlist-group">
            <button className="eval-series-toggle" onClick={() => toggleGroup(series)}>
              <span>{isOpen ? '▾' : '▸'}</span>
              <span className="eval-series-title">
                {seriesTitle(series)}
                <span className="eval-series-purpose">
                  {SERIES_META[series]?.purpose}
                  {SERIES_META[series]?.purpose && latestOf(items) ? ' · ' : ''}
                  {latestOf(items) && `최근 실행 ${latestOf(items)}`}
                </span>
              </span>
              <Badge variant="neutral" label={String(items.length)} />
            </button>
            {isOpen && items.map((r) => {
              const st = status[r.file];
              const readOnly = st === 'done' || st === 'applied';
              const expanded = !closedRuns.has(r.file);
              return (
                <RunRow
                  key={r.file}
                  run={{ ...r, status: st, readOnly }}
                  expanded={expanded}
                  onToggle={() => toggleRun(r.file)}
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

// ── 채점 런 (kind: map-match-v12) — 축별 점수표 ────────────────
// 이 런들은 .md 가 없다. 점수가 md 산문이 아니라 {책,런,축,점수,근거,실패} 레코드로
// 나오도록 설계된 산출물이라(BKT-374), 렌더러가 없으면 raw JSON 으로만 보였다.
function ScoreDetail({ json }) {
  const records = json.records || [];
  return (
    <div className="eval-md">
      <div className="eval-md-meta">
        <span className="eval-md-chip">{json.book}</span>
        <span className="eval-md-chip">총점 {json.total}</span>
        <span className="eval-md-chip">축 {records.length}개</span>
        {records.length === 5 && (
          <span className="eval-md-chip is-warn">위계 축 도입 전 — 6축 런과 총점 직접 비교 금지</span>
        )}
      </div>
      <section className="eval-md-section">
        <h4 className="eval-md-h">축별 점수</h4>
        <table className="eval-md-table eval-score-table">
          <thead><tr><th>축</th><th>점수</th><th>근거</th></tr></thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}>
                <td><b>{r.axis}</b></td>
                <td>
                  <div className="eval-score-cell">
                    <span className="eval-score-num">{r.score}</span>
                    <span className="eval-score-bar"><i style={{ width: `${Math.max(0, Math.min(100, r.score))}%` }} /></span>
                  </div>
                </td>
                <td>{r.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {records.some((r) => r.failures?.length) && (
        <section className="eval-md-section">
          <h4 className="eval-md-h">감점 근거 — 무엇이 안 잡혔나</h4>
          {records.filter((r) => r.failures?.length).map((r, i) => (
            <div key={i}>
              <h5 className="eval-md-h5">{r.axis} ({r.score})</h5>
              <ul className="eval-md-list">
                {r.failures.map((f, j) => <li key={j}>{f}</li>)}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ── lift 런 (kind: lift-v12) — 메모별 주장 분해 결과 ───────────
// 조립에 들어가는 재료다. 트리가 이상할 때 원인이 lift 인지 조립인지 여기서 갈린다.
function LiftDetail({ json }) {
  const lifts = json.lifts || [];
  const u = json.usage || {};
  return (
    <div className="eval-md">
      <div className="eval-md-meta">
        <span className="eval-md-chip">{json.model}</span>
        <span className="eval-md-chip">{json.promptVersion}</span>
        <span className="eval-md-chip">메모 {json.nMemos} → 주장 {json.nClaims}</span>
        {json.warnTotal > 0 && <span className="eval-md-chip is-warn">경고 {json.warnTotal}</span>}
        {u.calls != null && <span className="eval-md-chip">{u.calls}콜 · {Math.round((u.ms || 0) / 1000)}초 · ${u.costUsd}</span>}
      </div>
      <section className="eval-md-section">
        <h4 className="eval-md-h">메모별 주장</h4>
        {lifts.map((l) => (
          <details key={l.memoId} className="eval-md-collapse eval-lift-memo">
            <summary>
              p.{l.p} — 주장 {l.claims.length}개
              {l.claims.length > 0 && <span className="eval-lift-heads"> · {l.claims.map((c) => c.headword).join(' · ')}</span>}
              {l.thinkEsc && <span className="eval-md-chip">생각 재lift</span>}
              {l.gapFixed && <span className="eval-md-chip">격차 보정</span>}
              {l.warnings?.length > 0 && <span className="eval-md-chip is-warn">⚠{l.warnings.length}</span>}
            </summary>
            {l.claims.map((c) => (
              <div key={c.id} className="eval-lift-claim">
                <div className="eval-lift-head">
                  <b>{c.headword}</b>
                  {c.devices.map((d) => <span key={d} className="eval-md-chip">{d}</span>)}
                  {c.confidence !== 'high' && <span className="eval-md-chip is-warn">{c.confidence}</span>}
                </div>
                <p className="eval-md-p">{c.claim}</p>
                {Object.entries(c.slots || {}).map(([rel, s]) => (
                  <div key={rel} className="eval-lift-slot">
                    <code className="eval-md-code">{rel}</code>{' '}
                    {Object.entries(s).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ↔ ') : v}`).join(' / ')}
                  </div>
                ))}
                {c.evidence?.length > 0 && (
                  <div className="eval-lift-ev">증거 — {c.evidence.join(' · ')}</div>
                )}
              </div>
            ))}
            {l.warnings?.length > 0 && (
              <ul className="eval-md-list eval-lift-warn">
                {l.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </details>
        ))}
      </section>
    </div>
  );
}

// ── 제네릭 뷰 (md 우선, 없으면 JSON pretty) ──────────────────
// tree가 있는 런: '트리' 섹션(ASCII 코드블록) 대신 SVG 트리 삽입
export function GenericDetail({ json, md }) {
  // md 가 없어도 구조를 아는 런은 전용 렌더러로. 남는 것만 JSON 덤프.
  if (json?.kind === 'map-match-v12') return <ScoreDetail json={json} />;
  if (json?.kind === 'lift-v12') return <LiftDetail json={json} />;
  // md 를 안 쓰는 런이라도 트리는 그릴 수 있다 (증분 동화 런이 md 없이 저장된다)
  if (md == null && json?.tree?.nodes?.length > 0) {
    return (
      <div className="eval-md">
        <div className="eval-md-meta">
          {json.model && <span className="eval-md-chip">{json.model}</span>}
          {json.nMemos != null && <span className="eval-md-chip">메모 {json.nMemos}</span>}
          {json.llmCalls != null && <span className="eval-md-chip">LLM {json.llmCalls}콜</span>}
          {json.liftsFrom && <span className="eval-md-chip">lift: {json.liftsFrom}</span>}
        </div>
        <section className="eval-md-section">
          <h4 className="eval-md-h">트리</h4>
          <TreeSvg tree={json.tree} />
        </section>
        {Array.isArray(json.log) && json.log.length > 0 && (
          <details className="eval-md-collapse eval-md-logsec">
            <summary>로그</summary>
            <ul className="eval-md-list">{json.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </details>
        )}
      </div>
    );
  }
  if (md == null) {
    return <pre className="eval-md-pre">{JSON.stringify(json, null, 2)}</pre>;
  }
  const { meta, sections } = parseMd(md);
  const hasTree = json?.tree?.nodes?.length > 0;

  // '트리' 섹션 인덱스 찾기 (ASCII 코드블록 포함 섹션)
  const treeSecIdx = hasTree
    // '트리' 외에 '최종 트리'(hier-incr) 같은 변형도 SVG 로 치환한다 — 안 그러면
    // ASCII 목록이 먼저 나오고 SVG 는 맨 아래 중복으로 붙어 그래프가 안 보이는 것처럼 읽힌다
    ? sections.findIndex((s) => /트리$/.test(String(s.title || '').trim()))
    : -1;

  return (
    <div className="eval-md">
      {meta.length > 0 && (
        <div className="eval-md-meta">
          {meta.map((c, i) => <span key={i} className="eval-md-chip">{mdInline(c)}</span>)}
        </div>
      )}
      {sections.map((s, i) => {
        // '트리' 섹션: ASCII 대신 SVG 트리
        if (i === treeSecIdx) {
          return (
            <section key={i} className="eval-md-section">
              <h4 className="eval-md-h">트리</h4>
              <TreeSvg tree={json.tree} />
            </section>
          );
        }
        return <MdSection key={i} section={s} />;
      })}
      {/* tree는 있는데 '트리' 섹션이 md에 없는 경우 — 섹션 끝에 추가 */}
      {hasTree && treeSecIdx === -1 && (
        <section className="eval-md-section">
          <h4 className="eval-md-h">트리</h4>
          <TreeSvg tree={json.tree} />
        </section>
      )}
    </div>
  );
}
