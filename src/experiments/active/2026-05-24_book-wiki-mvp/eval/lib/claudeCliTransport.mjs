// claude -p transport (BKT-342 3단계) — 헤드리스 claude CLI 를 transport 계약
// ({system,user} → 응답 텍스트)에 맞춘 어댑터. 재생성을 구독 요금 안에서 돌린다
// (개발 루프 API 0원 방침의 실행 버전 — 설계 문서 "비용 전략" 2).
//
// 토큰·지연 로깅(onUsage)은 대고객 전환 대비 ④ — 런 로그에 쌓아 모델별
// "메모 1건당 몇 원·몇 초" 단가표가 자동 축적되게 한다.

import { spawn } from 'node:child_process';

// retries: CLI 는 동시 실행·순간 한도에서 exit 1(스트더러 빈 채)로 즉사할 수 있다
// (실측: 병렬 2프로세스에서 16콜 연쇄 실패). 백오프 재시도로 흡수한다.
// 지연 대책 실측: 기본 설정에서 haiku 가 콜당 7천~16k 토큰을 생각에 써 45~175초,
// 타임아웃 초과분은 kill+재시도로 3~9분까지 늘어졌다. --effort low 는 무효였고
// MAX_THINKING_TOKENS=0 이 정답 — m18 150초/16k → m11 21초/1.3k, 판정 품질도
// 오히려 개선(과잉 사고가 표제어 추상화를 유발했음: 짜증이 분노에서 분리됨).
// lift·배정은 고정 어휘에서 고르고 슬롯을 채우는 폐쇄 판정이라 생각이 필요 없다.
export function claudeCliTransport({ model = 'claude-haiku-4-5-20251001', bin = 'claude', timeoutMs = 300000, onUsage, retries = 2, maxThinkingTokens = 0 } = {}) {
  const once = ({ system, user }) => new Promise((resolveP, rejectP) => {
    const args = ['-p', '--output-format', 'json', '--model', model];
    if (system) args.push('--system-prompt', system);
    const t0 = Date.now();
    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, MAX_THINKING_TOKENS: String(maxThinkingTokens) } });
    const timer = setTimeout(() => { child.kill('SIGKILL'); rejectP(new Error(`claude -p 타임아웃 ${timeoutMs}ms`)); }, timeoutMs);
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); rejectP(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return rejectP(new Error(`claude -p exit ${code}: ${err.slice(0, 300)}`));
      let j;
      try { j = JSON.parse(out); } catch { return rejectP(new Error(`claude -p 출력 파싱 실패: ${out.slice(0, 200)}`)); }
      if (j.is_error) return rejectP(new Error(`claude -p 오류: ${String(j.result).slice(0, 300)}`));
      onUsage?.({
        model, ms: Date.now() - t0, apiMs: j.duration_api_ms ?? null,
        inputTokens: j.usage?.input_tokens ?? null, outputTokens: j.usage?.output_tokens ?? null,
        cacheReadTokens: j.usage?.cache_read_input_tokens ?? null, costUsd: j.total_cost_usd ?? null,
      });
      // 프롬프트는 "JSON만 출력"을 요구하지만 모델이 펜스나 산문을 두르는 일이 있다
      // (실측: sonnet 역할 블록 응답이 산문 섞임 → 파싱 실패 → 블록 0개).
      // 펜스 제거 후에도 JSON 이 아니면 첫 { 부터 마지막 } 까지를 추출한다.
      let text = String(j.result ?? '');
      const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) text = m[1];
      text = text.trim();
      if (!text.startsWith('{')) {
        const a = text.indexOf('{'), b = text.lastIndexOf('}');
        if (a >= 0 && b > a) text = text.slice(a, b + 1);
      }
      resolveP(text);
    });
    child.stdin.end(user);
  });
  return async (prompt) => {
    for (let i = 0; ; i++) {
      try { return await once(prompt); } catch (e) {
        if (i >= retries) throw e;
        const wait = (i + 1) * 10000;
        console.warn(`  ⚠ claude -p 실패(${e.message.slice(0, 60)}) — ${wait / 1000}초 후 재시도 ${i + 1}/${retries}`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  };
}
