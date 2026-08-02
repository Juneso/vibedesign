import React, { useEffect, useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/Stack';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Spinner } from '@astryxdesign/core/Spinner';
import { listRuns, getRun } from '../lib/api.js';
import { EVAL_AXES } from '../lib/evalAxes.js';

// 평가축 개요 — "무엇을 왜 재고 있는가"를 한 화면에 모은다.
// 지표가 늘면서 포화돼 폐기한 것과 쓰는 것이 뒤섞였고, 어느 지표에 기준선이
// 있는지도 흩어져 있었다. 여기서 정의·기준선·주의점·최신 수치를 함께 본다.

const STATUS = {
  live:    { label: '사용 중', cls: 'is-live' },
  retired: { label: '폐기',    cls: 'is-retired' },
  planned: { label: '설계만',  cls: 'is-planned' },
};

// 책마다 가장 최근 런 하나만 — 같은 책을 여러 번 감사하면 표가 중복으로 찬다.
function latestPerLabel(runs) {
  const m = new Map();
  for (const r of runs) {
    const prev = m.get(r.label);
    if (!prev || String(r.runAt || '') > String(prev.runAt || '')) m.set(r.label, r);
  }
  return [...m.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

function AxisCard({ axis, rows, loading }) {
  const st = STATUS[axis.status] || STATUS.live;
  return (
    <section className={`eval-axis ${st.cls}`}>
      <header className="eval-axis-head">
        <div className="eval-axis-titles">
          <Heading level={4}>{axis.title}</Heading>
          <Text type="supporting">{axis.asks}</Text>
        </div>
        <span className={`eval-axis-badge ${st.cls}`}>{st.label}</span>
      </header>

      <dl className="eval-axis-defs">
        <div><dt>왜 재나</dt><dd>{axis.why}</dd></div>
        <div><dt>어떻게 재나</dt><dd>{axis.how}</dd></div>
        <div><dt>기준선</dt><dd>{axis.baseline}</dd></div>
        {axis.caution && <div><dt>주의</dt><dd className="eval-axis-caution">{axis.caution}</dd></div>}
        {axis.retiredWhy && <div><dt>폐기 이유</dt><dd className="eval-axis-caution">{axis.retiredWhy}</dd></div>}
      </dl>

      {axis.metric && (
        loading ? <Spinner />
        : rows.length === 0 ? <Text type="supporting">아직 이 축의 런이 없습니다.</Text>
        : (
          <div className="eval-axis-table-wrap">
            <table className="eval-axis-table">
              <thead><tr><th>책</th><th>{axis.good}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.file}><td>{r.label}</td><td className="eval-axis-num">{r.text}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}

export default function EvalAxes() {
  const [runs, setRuns] = useState(null);
  const [detail, setDetail] = useState({}); // file → 런 JSON
  const [error, setError] = useState(null);

  useEffect(() => {
    listRuns().then(setRuns).catch((e) => setError(String(e.message || e)));
  }, []);

  // 축별 최신 런만 상세 조회한다 — 전량을 읽으면 로컬에서도 느리다.
  const wanted = useMemo(() => {
    if (!runs) return [];
    return EVAL_AXES.filter((a) => a.series && a.metric)
      .flatMap((a) => latestPerLabel(runs.filter((r) => r.series === a.series)).map((r) => ({ ...r, axisId: a.id })));
  }, [runs]);

  useEffect(() => {
    let alive = true;
    (async () => {
      for (const r of wanted) {
        if (detail[r.file]) continue;
        try {
          // API 는 { json, md } 로 감싸서 준다 — 본문은 .json 쪽이다.
          const res = await getRun(r.file);
          if (!alive) return;
          setDetail((p) => ({ ...p, [r.file]: res?.json ?? res }));
        } catch { /* 개별 실패는 그 행만 비운다 */ }
      }
    })();
    return () => { alive = false; };
  }, [wanted]);

  if (error) return <Text type="supporting" color="accent">{error} (dev 서버에서만 동작)</Text>;

  return (
    <VStack gap={3}>
      <VStack gap={1}>
        <Heading level={3}>평가축</Heading>
        <Text type="supporting">
          "이 로직이 좋다"를 무엇으로 보이려 하는가. 각 축의 정의·기준선·주의점과 책별 최신 수치를 함께 둔다.
          포화돼 폐기한 축도 이유와 함께 남긴다 — 같은 실패를 다시 설계하지 않기 위해서다.
        </Text>
      </VStack>

      {EVAL_AXES.map((axis) => {
        const mine = wanted.filter((r) => r.axisId === axis.id);
        const rows = mine.map((r) => {
          const j = detail[r.file];
          if (!j) return null;
          try { return { file: r.file, label: r.label, ...axis.metric(j) }; } catch { return null; }
        }).filter(Boolean);
        return (
          <AxisCard
            key={axis.id}
            axis={axis}
            rows={rows}
            loading={!!axis.metric && runs != null && rows.length < mine.length}
          />
        );
      })}
    </VStack>
  );
}
