// Vite dev 서버 플러그인: 알라딘 TTB API를 /api/aladin/* 로 프록시.
// TTB 키는 .env.local 의 ALADIN_TTB_KEY 에서 주입 (브라우저에 노출 X).
// 본 실험(2026-05-24_book-wiki-mvp) 전용. 다른 실험엔 영향 없음.

import { loadEnv } from 'vite';

export function aladinPlugin() {
  let ttbKey = '';
  return {
    name: 'book-wiki-mvp:aladin-proxy',
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), '');
      ttbKey = env.ALADIN_TTB_KEY || '';
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/aladin/')) return next();

        const send = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(typeof body === 'string' ? body : JSON.stringify(body));
        };

        if (!ttbKey) return send(500, { error: 'ALADIN_TTB_KEY missing in .env.local' });

        try {
          const url = new URL(req.url, 'http://localhost');
          const path = url.pathname.replace('/api/aladin/', '');
          let upstream;
          if (path === 'search') {
            const q = url.searchParams.get('q') ?? '';
            if (!q.trim()) return send(200, { item: [] });
            upstream = `http://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${ttbKey}&Query=${encodeURIComponent(q)}&QueryType=Keyword&MaxResults=10&SearchTarget=Book&output=js&Version=20131101&Cover=Big`;
          } else if (path === 'lookup') {
            const id = url.searchParams.get('id') ?? '';
            if (!id) return send(400, { error: 'id required' });
            upstream = `http://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${ttbKey}&itemIdType=ISBN13&ItemId=${encodeURIComponent(id)}&output=js&Version=20131101&OptResult=Toc,Story,fulldescription&Cover=Big`;
          } else {
            return send(404, { error: 'unknown path' });
          }
          const r = await fetch(upstream);
          const text = await r.text();
          send(r.status, text);
        } catch (e) {
          send(500, { error: String(e?.message ?? e) });
        }
      });
    },
  };
}
