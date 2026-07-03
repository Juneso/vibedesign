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
