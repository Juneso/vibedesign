import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import RunBrowser from './screens/RunBrowser.jsx';
import PipelineView from './screens/PipelineView.jsx';
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
  const [tab, setTab] = useState('runs');
  return (
    <div className="eval-app">
      <div className="eval-tabbar">
        <SegmentedControl label="화면" isLabelHidden size="sm" value={tab} onChange={setTab}>
          <SegmentedControlItem value="runs" label="런 결과" />
          <SegmentedControlItem value="pipeline" label="파이프라인" />
        </SegmentedControl>
      </div>
      <div className="eval-tabpanel">
        {tab === 'runs' ? <RunBrowser /> : <PipelineView />}
      </div>
    </div>
  );
}

createRoot(document.getElementById('app-root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
