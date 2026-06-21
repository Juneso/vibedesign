import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';
import { getState, update } from './lib/storage.js';
import { buildSeedState } from './lib/seedLoader.js';

// localStorage 비어있으면 골든셋(샌델+조르바+메모+프로필) 자동 주입
const s = getState();
if (Object.keys(s.books).length === 0) {
  const seed = buildSeedState();
  update(st => {
    Object.assign(st.books, seed.books);
    Object.assign(st.memos, seed.memos);
    Object.assign(st.profile, seed.profile);
  });
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 20, color: 'red', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
          <b>Render Error</b>{'\n'}{this.state.err?.message}{'\n\n'}{this.state.err?.stack}
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('app-root')).render(
  <ErrorBoundary><App /></ErrorBoundary>
);
