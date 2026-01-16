import React from 'react';
import { useStore } from '../store';

export default function StatusBar() {
  const { connected, nodes, tasks, selectedNodeId, getNodeNumber, setSelectedNode, centerOnNode } = useStore();

  return (
    <div className="status-bar">
      <div className="status-dot" style={{
        background: connected ? 'var(--accent-green)' : 'var(--accent-red)'
      }} />
      <span>{connected ? 'Connected' : 'Disconnected'}</span>
      <span style={{ margin: '0 12px', color: 'var(--border-color)' }}>|</span>
      <span>Nodes: {nodes.length}</span>
      <span style={{ margin: '0 12px', color: 'var(--border-color)' }}>|</span>
      <span>Tasks: {tasks.filter(t => t.status === 'running').length} running</span>
      {selectedNodeId && (
        <>
          <span style={{ margin: '0 12px', color: 'var(--border-color)' }}>|</span>
          <span
            onClick={() => centerOnNode(selectedNodeId)}
            style={{
              color: 'var(--accent-orange)',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.7'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            Selected: #{getNodeNumber(selectedNodeId)}
          </span>
          <button
            onClick={() => setSelectedNode(null)}
            style={{
              marginLeft: '8px',
              padding: '2px 6px',
              background: 'transparent',
              border: '1px solid var(--accent-orange)',
              borderRadius: '4px',
              color: 'var(--accent-orange)',
              cursor: 'pointer',
              fontSize: '12px',
              lineHeight: '1',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'var(--accent-orange)';
              e.target.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'transparent';
              e.target.style.color = 'var(--accent-orange)';
            }}
            title="Deselect"
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}
