// Dev-only Vite 미들웨어 — book-wiki-mvp eval 런/라벨 API.
// 빌드에는 영향 없음 (configureServer 훅에서만 라우트 등록).
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, mkdirSync, openSync, readSync, closeSync } from 'fs';
import { execFileSync } from 'child_process';

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

// 런 목록용 메타. 파일 전체를 파싱하지 않고 선두 1KB만 읽어 키를 찾는다
// (런 파일이 78개·4.6MB라 목록 요청마다 전량 파싱하면 낭비).
function peekField(filePath, name) {
  let fd;
  try {
    fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(1024);
    const n = readSync(fd, buf, 0, 1024, 0);
    const m = buf.slice(0, n).toString('utf8').match(new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    return m ? JSON.parse(`"${m[1]}"`) : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* noop */ }
  }
}

// 실행 시각의 신뢰 순서: ① json 의 runAt ② git 최종 커밋 시각 ③ 파일 mtime.
// mtime 은 체크아웃·리베이스만 해도 전부 현재 시각으로 바뀌어 실행 시각과 무관해진다.
// git 시각은 author date(%aI) — committer date 는 리베이스 때 전부 갱신되어 무의미해진다.
// 한 번의 log 순회로 경로별 최종 시각을 모아 캐시한다(파일당 호출 금지).
let gitDateCache = { at: 0, map: new Map() };
function gitDates() {
  if (Date.now() - gitDateCache.at < 30000) return gitDateCache.map;
  const map = new Map();
  try {
    const out = execFileSync('git', ['log', '--format=%aI', '--name-only', '--', RUNS_DIR], {
      cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    let cur = null;
    for (const line of out.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (/^\d{4}-\d{2}-\d{2}T/.test(t)) { cur = t; continue; }
      if (cur && !map.has(t)) map.set(t, cur); // 최신 커밋이 먼저 나오므로 최초 등장만 취한다
    }
  } catch { /* git 없음/실패 시 mtime 폴백 */ }
  gitDateCache = { at: Date.now(), map };
  return map;
}

function resolveRunAt(file, fullPath, st) {
  const inJson = peekField(fullPath, 'runAt');
  if (inJson) return { runAt: inJson, runAtSource: 'json' };
  const rel = `src/experiments/active/2026-05-24_book-wiki-mvp/eval/runs/${file}`;
  const g = gitDates().get(rel);
  if (g) return { runAt: g, runAtSource: 'git' };
  return { runAt: new Date(st.mtimeMs).toISOString(), runAtSource: 'mtime' };
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
                const full = join(RUNS_DIR, f);
                const st = statSync(full);
                const { runAt, runAtSource } = resolveRunAt(f, full, st);
                return {
                  file: f, series: seriesOf(f), mtimeMs: st.mtimeMs, size: st.size,
                  label: peekField(full, 'label'), runAt, runAtSource,
                };
              })
              .sort((a, b) => new Date(b.runAt) - new Date(a.runAt));
            return sendJson(res, 200, runs);
          }

          // GET /api/eval/run-status
          if (req.method === 'GET' && url === '/api/eval/run-status') {
            const statusPath = join(LABELS_DIR, 'run-status.json');
            if (!existsSync(statusPath)) return sendJson(res, 200, {});
            return sendJson(res, 200, JSON.parse(readFileSync(statusPath, 'utf8')));
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

          // POST /api/eval/pipelines/:file — 사이드바에서 고친 이름을 정의 파일에 반영.
          // 이름(shortTitle)만 덮어쓰고 나머지 키·순서는 그대로 둔다. 파일명과 id 는 건드리지 않는다
          // (seriesMeta 의 pipelineId 가 id 를 참조하므로 바꾸면 런 연결이 끊긴다).
          if (req.method === 'POST' && url.startsWith('/api/eval/pipelines/')) {
            const file = decodeURIComponent(url.slice('/api/eval/pipelines/'.length));
            if (!isSafeSegment(file) || !file.endsWith('.json')) return sendJson(res, 400, { error: 'invalid file' });
            const jsonPath = join(PIPELINES_DIR, file);
            if (!existsSync(jsonPath)) return sendJson(res, 404, { error: 'not found' });
            const raw = await readBody(req);
            let body;
            try { body = JSON.parse(raw); } catch { return sendJson(res, 400, { error: 'invalid json' }); }
            const name = typeof body?.shortTitle === 'string' ? body.shortTitle.trim() : '';
            if (!name) return sendJson(res, 400, { error: 'shortTitle required' });
            const content = JSON.parse(readFileSync(jsonPath, 'utf8'));
            content.shortTitle = name;
            writeFileSync(jsonPath, JSON.stringify(content, null, 2) + '\n', 'utf8');
            return sendJson(res, 200, { ok: true, file, shortTitle: name });
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
