import React from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from './screens/Dashboard.jsx';
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

function App() {
  return (
    <div className="eval-app">
      <Dashboard />
    </div>
  );
}

createRoot(document.getElementById('app-root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
