import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve, relative, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readdirSync, statSync, existsSync, readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// src/experiments 내의 모든 index.html을 찾아 빌드 엔트리로 등록하는 함수
function getExperimentInputs(dir, inputs = {}) {
  if (!existsSync(dir)) return inputs;
  
  const files = readdirSync(dir);
  files.forEach(file => {
    const fullPath = resolve(dir, file);
    if (statSync(fullPath).isDirectory()) {
      getExperimentInputs(fullPath, inputs);
    } else if (file === 'index.html') {
      // dist 내에서도 src/experiments/... 경로를 유지하도록 키 이름을 생성
      const relPath = relative(__dirname, fullPath);
      // 키 이름은 중복되지 않게 경로 기반으로 생성 (예: src_experiments_active_view1_index)
      const inputKey = relPath.replace(/\//g, '_').replace('.html', '');
      inputs[inputKey] = fullPath;
    }
  });
  return inputs;
}

const experimentsDir = resolve(__dirname, 'src/experiments');
const experimentInputs = getExperimentInputs(experimentsDir);

// 실험 파일 변경 감시 → key:value 라인 diff → 브라우저로 push
function editTrailPlugin() {
  // file → 직전 내용
  const lastContent = new Map();
  // CSS 한 줄 `prop: value;` / JS 한 줄 `key: value,` 형태만 추출 (멀티라인 객체 무시)
  const lineRe = /^[ \t]*([\w-]+)\s*:\s*([^;,{}\n]+)[;,]?\s*(?:\/\/[^\n]*)?$/;
  const extractKvLines = (src) => {
    const out = new Set();
    src.split('\n').forEach(line => {
      const m = line.match(lineRe);
      if (m) out.add(`${m[1]}: ${m[2].trim()}`);
    });
    return out;
  };
  // 실험 디렉토리 하위 모든 css/js를 미리 읽어 baseline 깔기 (첫 저장도 잡히도록)
  const preloadBaselines = (dir) => {
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir)) {
      const full = resolve(dir, file);
      const stat = statSync(full);
      if (stat.isDirectory()) preloadBaselines(full);
      else if (/\.(css|js)$/.test(file)) {
        try { lastContent.set(full, readFileSync(full, 'utf8')); } catch {}
      }
    }
  };
  return {
    name: 'edit-trail',
    configureServer(server) {
      preloadBaselines(resolve(__dirname, 'src/experiments'));
      server.watcher.on('change', (file) => {
        if (!/[\\/]experiments[\\/]/.test(file)) return;
        if (!/\.(css|js)$/.test(file)) return;
        let now;
        try { now = readFileSync(file, 'utf8'); } catch { return; }
        const prev = lastContent.get(file) ?? '';
        lastContent.set(file, now);
        const oldSet = extractKvLines(prev);
        const newSet = extractKvLines(now);
        const added = [];
        for (const l of newSet) if (!oldSet.has(l)) added.push(l);
        if (!added.length) return;
        const rel = relative(__dirname, file).replace(/\\/g, '/');
        server.ws.send({
          type: 'custom',
          event: 'edit-trail',
          data: { file: rel, lines: added, ts: Date.now() },
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    editTrailPlugin(),
  ],
  assetsInclude: ['**/*.lottie'],
  base: './',
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      'expo-linear-gradient': resolve(__dirname, 'src/shared/web-shims/linear-gradient.jsx'),
      'react-native-svg': resolve(__dirname, 'src/shared/web-shims/react-native-svg.jsx'),
    },
    extensions: ['.web.js', '.js', '.jsx', '.json'],
  },
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  optimizeDeps: {
    esbuildOptions: { jsx: 'automatic', jsxImportSource: 'react' },
    include: ['react', 'react-dom', 'react-dom/client', 'react-native-web'],
  },
  define: {
    __DEV__: 'true',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  server: {
    port: 5174,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ...experimentInputs
      }
    }
  }
})
