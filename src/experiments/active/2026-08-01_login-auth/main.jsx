import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';

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
