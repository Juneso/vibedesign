import React from 'react';

// ── 경량 md 렌더러 (공용) ─────────────────────────────────────
// eval 런 문서(RunBrowser)와 파이프라인 정의(PipelineView)가 함께 쓴다.
// 외부 md 라이브러리 없이 이 문서들이 쓰는 패턴만 지원
// (h1/h2, >인용, 표, ```펜스, 리스트, **굵게**, `코드`).

export function mdInline(text) {
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
export function parseMd(md) {
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

export function MdBlock({ block }) {
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

// "이 실행에서 단계별로 일어난 일" — 굵은 글씨 한 줄이 단계 제목, 그 뒤 블록이 그 단계 내용.
// 단계 경계를 보더로 나누기 위해 블록 배열을 단계 단위로 묶는다.
function groupStages(blocks) {
  const groups = [];
  for (const b of blocks) {
    const head = b.type === 'p' && /^\*\*(.+)\*\*$/.test(b.text.trim());
    if (head || !groups.length) groups.push({ head: head ? b : null, blocks: head ? [] : [b] });
    else groups[groups.length - 1].blocks.push(b);
  }
  return groups;
}

export function MdSection({ section }) {
  const t = section.title || '';
  const isCheckpoint = /체크포인트|요약|판정/.test(t);
  const isLog = /로그/.test(t);
  const isNarrative = /단계별로 일어난 일/.test(t);
  const body = section.blocks.map((b, i) => <MdBlock key={i} block={b} />);

  if (isNarrative) {
    return (
      <section className="eval-md-section">
        {t && <h4 className="eval-md-h">{t}</h4>}
        <div className="eval-md-narr">
          {groupStages(section.blocks).map((g, i) => (
            <div className="eval-md-narr-step" key={i}>
              {g.head && <div className="eval-md-narr-head">{mdInline(g.head.text)}</div>}
              {g.blocks.map((b, j) => <MdBlock key={j} block={b} />)}
            </div>
          ))}
        </div>
      </section>
    );
  }

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
      {t && <h4 className="eval-md-h">{t}</h4>}
      {body}
    </section>
  );
}

// 짧은 md 조각(불렛·문단·표)을 그대로 렌더한다. h2 섹션 구조가 없는 필드용.
// 파이프라인 정의의 goal / designIntent / stages[].why·how 가 이 형태다.
export function Markdown({ source }) {
  if (!source) return null;
  const { sections } = parseMd(String(source));
  const blocks = sections.flatMap((s) => s.blocks);
  return <div className="eval-md-frag">{blocks.map((b, i) => <MdBlock key={i} block={b} />)}</div>;
}
