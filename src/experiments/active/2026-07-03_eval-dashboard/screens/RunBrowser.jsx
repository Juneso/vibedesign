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
          <span>{expanded ? '▾' : '▸'} {run.label || iterationLabel(file)}</span>
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
                {SERIES_META[series]?.purpose && (
                  <span className="eval-series-purpose">{SERIES_META[series].purpose}</span>
                )}
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

// ── 경량 md 렌더러 ───────────────────────────────────────────
// eval 문서 전용: 체크포인트 섹션 강조 + 긴 코드블록(로그) 접기.
// 외부 md 라이브러리 없이 이 문서들이 쓰는 패턴만 지원 (h1/h2, >인용, 표, ```펜스, 리스트, **굵게**, `코드`).

function mdInline(text) {
  const out = [];
  let rest = text;
  let k = 0;
  const rx = /\*\*(.+?)\*\*|`([^`]+)`/;
  while (rest) {
    const m = rest.match(rx);
    if (!m) { out.push(rest); break; }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[1] !== undefined) out.push(<strong key={k++}>{m[1]}</strong>);
    else out.push(<code key={k++} className="eval-md-code">{m[2]}</code>);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

// md → { title, meta[], sections[{title, blocks[]}] }
function parseMd(md) {
  const lines = md.split(/\r?\n/);
  let title = null;
  const meta = [];
  const sections = [];
  let cur = { title: null, blocks: [] }; // h2 이전 본문

  const pushSection = () => { if (cur.title !== null || cur.blocks.length) sections.push(cur); };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('# ') && title === null) { title = line.slice(2).trim(); i++; continue; }
    if (line.startsWith('## ')) { pushSection(); cur = { title: line.slice(3).trim(), blocks: [] }; i++; continue; }

    // 인용(>) — 문서 상단 메타는 · 구분 칩으로, 본문 중간은 인용 블록으로
    if (line.startsWith('>')) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith('>')) { quote.push(lines[i].replace(/^>\s?/, '')); i++; }
      if (sections.length === 0 && cur.title === null && cur.blocks.length === 0) {
        quote.join(' · ').split(' · ').forEach((c) => c.trim() && meta.push(c.trim()));
      } else {
        cur.blocks.push({ type: 'quote', lines: quote });
      }
      continue;
    }

    if (line.startsWith('```')) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++; }
      i++; // 닫는 펜스
      cur.blocks.push({ type: 'fence', code: code.join('\n') });
      continue;
    }

    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells); // 구분줄 제외
        i++;
      }
      cur.blocks.push({ type: 'table', rows });
      continue;
    }

    if (/^\s*- /.test(line)) {
      const items = [];
      while (i < lines.length && (/^\s*- /.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        if (/^\s*- /.test(lines[i])) items.push(lines[i].replace(/^\s*- /, ''));
        else items[items.length - 1] += ' ' + lines[i].trim(); // 들여쓴 연속줄
        i++;
      }
      cur.blocks.push({ type: 'list', items });
      continue;
    }

    if (line.trim()) cur.blocks.push({ type: 'p', text: line.trim() });
    i++;
  }
  pushSection();
  return { title, meta, sections };
}

function MdBlock({ block }) {
  if (block.type === 'fence') {
    const long = block.code.split('\n').length > 24;
    const pre = <pre className="eval-md-pre">{block.code}</pre>;
    return long
      ? <details className="eval-md-collapse"><summary>펼쳐 보기 ({block.code.split('\n').length}줄)</summary>{pre}</details>
      : pre;
  }
  if (block.type === 'table') {
    const [head, ...body] = block.rows;
    return (
      <table className="eval-md-table">
        <thead><tr>{head.map((c, i) => <th key={i}>{mdInline(c)}</th>)}</tr></thead>
        <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{mdInline(c)}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  if (block.type === 'list') {
    return <ul className="eval-md-list">{block.items.map((it, i) => <li key={i}>{mdInline(it)}</li>)}</ul>;
  }
  if (block.type === 'quote') {
    return <div className="eval-md-quote">{block.lines.map((l, i) => <div key={i}>{mdInline(l)}</div>)}</div>;
  }
  return <p className="eval-md-p">{mdInline(block.text)}</p>;
}

function MdSection({ section }) {
  const t = section.title || '';
  const isCheckpoint = /체크포인트|요약|판정/.test(t);
  const isLog = /로그/.test(t);
  const body = section.blocks.map((b, i) => <MdBlock key={i} block={b} />);

  if (isLog) {
    return (
      <details className="eval-md-collapse eval-md-logsec">
        <summary>{t}</summary>
        {body}
      </details>
    );
  }
  return (
    <section className={`eval-md-section${isCheckpoint ? ' is-checkpoint' : ''}`}>
      {t && <h4 className="eval-md-h">{isCheckpoint ? t : t}</h4>}
      {body}
    </section>
  );
}

// ── 제네릭 뷰 (md 우선, 없으면 JSON pretty) ──────────────────
// tree가 있는 런: '트리' 섹션(ASCII 코드블록) 대신 SVG 트리 삽입
export function GenericDetail({ json, md }) {
  if (md == null) {
    return <pre className="eval-md-pre">{JSON.stringify(json, null, 2)}</pre>;
  }
  const { meta, sections } = parseMd(md);
  const hasTree = json?.tree?.nodes?.length > 0;

  // '트리' 섹션 인덱스 찾기 (ASCII 코드블록 포함 섹션)
  const treeSecIdx = hasTree
    ? sections.findIndex((s) => s.title === '트리')
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
