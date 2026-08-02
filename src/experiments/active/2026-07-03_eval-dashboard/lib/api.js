// eval dev API fetch 래퍼 (vite configureServer 미들웨어와 통신).
const BASE = '/api/eval';

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

export function listRuns() {
  return get('/runs');
}

export function getRun(file) {
  return get(`/runs/${encodeURIComponent(file)}`);
}

export function listPipelines() {
  return get('/pipelines');
}

// 사이드바에서 고친 파이프라인 이름을 정의 파일(shortTitle)에 저장
export async function savePipelineName(file, shortTitle) {
  const res = await fetch(`${BASE}/pipelines/${encodeURIComponent(file)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shortTitle }),
  });
  if (!res.ok) throw new Error(`POST pipelines/${file} → ${res.status}`);
  return res.json();
}

export function getRunStatus() {
  return get('/run-status');
}

export function getLabels(series) {
  return get(`/labels/${encodeURIComponent(series)}`);
}

export async function saveLabels(series, body) {
  const res = await fetch(`${BASE}/labels/${encodeURIComponent(series)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST labels/${series} → ${res.status}`);
  return res.json();
}
