import React, { useState } from 'react';
import { useStore } from '../App.jsx';
import { update, log, uid } from '../lib/storage.js';

// 내 맥락 = 책 메모와 결합되어 wiki 페이지에 녹아드는 사용자의 구체 상황·질문·고민.
// 자유 카드 + 가벼운 프로필 (background / currentWork / openQuestions).

export default function ContextScreen() {
  const s = useStore();
  const contexts = Object.values(s.contexts).sort((a, b) => b.updatedAt - a.updatedAt);
  const [editing, setEditing] = useState(null); // null | 'new' | contextId
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div className="p-4 pb-24">
      <header className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold">내 맥락</h1>
        <button onClick={() => setEditing('new')} className="px-3 py-1.5 text-sm bg-black text-white rounded-full">+ 카드</button>
      </header>
      <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed">
        지금 하고 있는 일·고민·질문을 짧게 적어두세요. Ingest 때 책 메모와 연결되어 wiki에 함께 녹습니다.
      </p>

      <button onClick={() => setProfileOpen(true)}
        className="w-full text-left bg-white border border-zinc-100 rounded-xl p-3 mb-4">
        <div className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1">프로필</div>
        <div className="text-xs text-zinc-700 line-clamp-2">
          {s.profile.background || '배경 미설정'} · 진행 중: {(s.profile.currentWork || []).join(', ') || '없음'}
        </div>
      </button>

      {contexts.length === 0 && (
        <div className="text-center text-zinc-400 py-12 text-sm">
          카드가 없습니다.<br/>예: "SKT 콜뷰 인터랙션 작업 중", "회사 정보흐름 답답함"
        </div>
      )}

      <ul className="space-y-2">
        {contexts.map(c => (
          <li key={c.id}>
            <button onClick={() => setEditing(c.id)} className="w-full text-left bg-white p-3 rounded-xl border border-zinc-100">
              <div className="text-sm font-semibold">{c.title}</div>
              {c.body && <div className="text-xs text-zinc-600 mt-1 line-clamp-3 whitespace-pre-wrap">{c.body}</div>}
              <div className="text-[10px] text-zinc-400 mt-1.5">{new Date(c.updatedAt).toLocaleDateString()}</div>
            </button>
          </li>
        ))}
      </ul>

      {editing && (
        <ContextEditor
          contextId={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
    </div>
  );
}

function ContextEditor({ contextId, onClose }) {
  const s = useStore();
  const existing = contextId ? s.contexts[contextId] : null;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');

  const save = () => {
    if (!title.trim()) return;
    update(st => {
      if (existing) {
        st.contexts[contextId] = { ...existing, title: title.trim(), body: body.trim(), updatedAt: Date.now() };
      } else {
        const id = uid('ctx');
        st.contexts[id] = { id, title: title.trim(), body: body.trim(), createdAt: Date.now(), updatedAt: Date.now() };
      }
    });
    log('context-saved', { id: contextId ?? 'new' });
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    if (!confirm('이 카드를 삭제할까요?')) return;
    update(st => { delete st.contexts[contextId]; });
    log('context-removed', { id: contextId });
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">{existing ? '맥락 카드' : '새 카드'}</h3>
          <button onClick={onClose} className="text-zinc-400 text-sm">취소</button>
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="짧은 제목 (예: 회사 정보 흐름 답답함)"
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg" />
        <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="(선택) 자세한 상황·고민·질문" rows={5}
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg resize-none" />
        <div className="flex gap-2">
          {existing && <button onClick={remove} className="px-3 py-2 text-sm text-rose-600 border border-rose-200 rounded-lg">삭제</button>}
          <button onClick={save} className="flex-1 py-2.5 bg-black text-white rounded-lg text-sm font-semibold">저장</button>
        </div>
      </div>
    </div>
  );
}

function ProfileEditor({ onClose }) {
  const s = useStore();
  const [background, setBackground] = useState(s.profile.background || '');
  const [currentWork, setCurrentWork] = useState((s.profile.currentWork || []).join(', '));
  const [interests, setInterests] = useState((s.profile.interests || []).join(', '));
  const [openQuestions, setOpenQuestions] = useState((s.profile.openQuestions || []).join('\n'));

  const split = (v) => v.split(',').map(x => x.trim()).filter(Boolean);
  const splitL = (v) => v.split('\n').map(x => x.trim()).filter(Boolean);

  const save = () => {
    update(st => {
      st.profile = {
        background: background.trim(),
        currentWork: split(currentWork),
        interests: split(interests),
        openQuestions: splitL(openQuestions),
      };
    });
    log('profile-updated', {});
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-h-[85%] bg-white rounded-t-3xl p-4 space-y-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">프로필</h3>
          <button onClick={onClose} className="text-zinc-400 text-sm">취소</button>
        </div>
        <Labeled label="배경 (한 줄)">
          <input value={background} onChange={e => setBackground(e.target.value)}
            placeholder="예: IT 업계 디자이너"
            className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg" />
        </Labeled>
        <Labeled label="진행 중인 일 (쉼표)">
          <input value={currentWork} onChange={e => setCurrentWork(e.target.value)}
            placeholder="예: SKT 콜뷰, 독서앱"
            className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg" />
        </Labeled>
        <Labeled label="관심사 (쉼표)">
          <input value={interests} onChange={e => setInterests(e.target.value)}
            placeholder="예: 문학, 인터랙션, 시스템 사고"
            className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg" />
        </Labeled>
        <Labeled label="답을 찾고 있는 질문 (한 줄당 하나)">
          <textarea value={openQuestions} onChange={e => setOpenQuestions(e.target.value)} rows={4}
            placeholder={'예:\n팀의 의사결정 속도를 어떻게 높일까\nAI 시대 디자이너의 차별점은'}
            className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg resize-none" />
        </Labeled>
        <button onClick={save} className="w-full py-2.5 bg-black text-white rounded-lg text-sm font-semibold">저장</button>
      </div>
    </div>
  );
}

function Labeled({ label, children }) {
  return (
    <div>
      <div className="text-[11px] text-zinc-500 mb-1">{label}</div>
      {children}
    </div>
  );
}
