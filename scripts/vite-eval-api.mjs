// Dev-only Vite 미들웨어 — book-wiki-mvp eval 런/라벨 API.
// 빌드에는 영향 없음 (configureServer 훅에서만 라우트 등록).
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const EVAL_DIR = resolve(REPO_ROOT, 'src/experiments/active/2026-05-24_book-wiki-mvp/eval');
const RUNS_DIR = join(EVAL_DIR, 'runs');
const LABELS_DIR = join(EVAL_DIR, 'labels');
const PIPELINES_DIR = join(EVAL_DIR, 'pipelines');

// 파일명에서 숫자 접미(-1, -12 등) 제거 → 시리즈명
function seriesOf(fileName) {
  return fileName.replace(/\.json$/, '').replace(/-\d+$/, '');
}

// path traversal 방지: '..' 또는 슬래시 포함 시 거부
function isSafeSegment(seg) {
  return typeof seg === 'string' && seg.length > 0 && !seg.includes('..') && !seg.includes('/') && !seg.includes('\\');
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function evalApiPlugin() {
  return {
    name: 'eval-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] || '';
        if (!url.startsWith('/api/eval/')) return next();

        try {
          // GET /api/eval/runs
          if (req.method === 'GET' && url === '/api/eval/runs') {
            if (!existsSync(RUNS_DIR)) return sendJson(res, 200, []);
            const runs = readdirSync(RUNS_DIR)
              .filter((f) => f.endsWith('.json'))
              .map((f) => {
                const st = statSync(join(RUNS_DIR, f));
                return { file: f, series: seriesOf(f), mtimeMs: st.mtimeMs, size: st.size };
              })
              .sort((a, b) => b.mtimeMs - a.mtimeMs);
            return sendJson(res, 200, runs);
          }

          // GET /api/eval/pipelines
          if (req.method === 'GET' && url === '/api/eval/pipelines') {
            if (!existsSync(PIPELINES_DIR)) return sendJson(res, 200, []);
            const pipelines = readdirSync(PIPELINES_DIR)
              .filter((f) => f.endsWith('.json'))
              .sort()
              .map((f) => {
                try {
                  const content = JSON.parse(readFileSync(join(PIPELINES_DIR, f), 'utf8'));
                  return { file: f, ...content };
                } catch (e) {
                  return { file: f, error: String(e?.message || e) };
                }
              });
            return sendJson(res, 200, pipelines);
          }

          // GET /api/eval/runs/:file
          if (req.method === 'GET' && url.startsWith('/api/eval/runs/')) {
            const file = decodeURIComponent(url.slice('/api/eval/runs/'.length));
            if (!isSafeSegment(file) || !file.endsWith('.json')) return sendJson(res, 400, { error: 'invalid file' });
            const jsonPath = join(RUNS_DIR, file);
            if (!existsSync(jsonPath)) return sendJson(res, 404, { error: 'not found' });
            const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
            const mdPath = jsonPath.replace(/\.json$/, '.md');
            const md = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : null;
            return sendJson(res, 200, { json, md });
          }

          // GET /api/eval/labels/:series
          if (req.method === 'GET' && url.startsWith('/api/eval/labels/')) {
            const series = decodeURIComponent(url.slice('/api/eval/labels/'.length));
            if (!isSafeSegment(series)) return sendJson(res, 400, { error: 'invalid series' });
            const labelPath = join(LABELS_DIR, `${series}.labels.json`);
            if (!existsSync(labelPath)) return sendJson(res, 200, { series, labels: [] });
            return sendJson(res, 200, JSON.parse(readFileSync(labelPath, 'utf8')));
          }

          // POST /api/eval/labels/:series
          if (req.method === 'POST' && url.startsWith('/api/eval/labels/')) {
            const series = decodeURIComponent(url.slice('/api/eval/labels/'.length));
            if (!isSafeSegment(series)) return sendJson(res, 400, { error: 'invalid series' });
            const raw = await readBody(req);
            let body;
            try { body = JSON.parse(raw); } catch { return sendJson(res, 400, { error: 'invalid json' }); }
            if (!existsSync(LABELS_DIR)) mkdirSync(LABELS_DIR, { recursive: true });
            const labelPath = join(LABELS_DIR, `${series}.labels.json`);
            writeFileSync(labelPath, JSON.stringify(body, null, 2) + '\n', 'utf8');
            return sendJson(res, 200, { ok: true });
          }

          return sendJson(res, 404, { error: 'unknown eval route' });
        } catch (err) {
          return sendJson(res, 500, { error: String(err?.message || err) });
        }
      });
    },
  };
}
