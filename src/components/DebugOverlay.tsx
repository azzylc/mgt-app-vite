'use client';
import { useEffect, useState } from 'react';

// Global log buffer
const logBuffer: string[] = [];

// Global log function
(globalThis as any).dlog = function(...args: any[]) {
  const line = `[${new Date().toISOString().split('T')[1].substring(0, 12)}] ${args.map(a => String(a)).join(' ')}`;
  logBuffer.push(line);
  if (logBuffer.length > 100) logBuffer.shift();
  console.log(...args);
};

export function DebugOverlay() {
  const [logs, setLogs] = useState('');
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setLogs(logBuffer.slice().reverse().join('\n'));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: 'fixed',
          bottom: 10,
          right: 10,
          background: '#000',
          color: '#0f0',
          border: '1px solid #0f0',
          padding: '8px 12px',
          borderRadius: 4,
          zIndex: 999999,
          fontSize: 12,
        }}
      >
        Show Debug
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '40vh',
        overflow: 'auto',
        background: 'rgba(0,0,0,0.95)',
        color: '#0f0',
        fontSize: 10,
        zIndex: 999998,
        padding: 8,
        whiteSpace: 'pre-wrap',
        fontFamily: 'monospace',
        borderTop: '2px solid #0f0',
      }}
    >
      <button
        onClick={() => setVisible(false)}
        style={{
          position: 'absolute',
          top: 5,
          right: 5,
          background: '#f00',
          color: '#fff',
          border: 'none',
          padding: '4px 8px',
          borderRadius: 3,
          fontSize: 10,
          cursor: 'pointer',
        }}
      >
        Hide
      </button>
      <button
        onClick={() => logBuffer.length = 0}
        style={{
          position: 'absolute',
          top: 5,
          right: 60,
          background: '#ff0',
          color: '#000',
          border: 'none',
          padding: '4px 8px',
          borderRadius: 3,
          fontSize: 10,
          cursor: 'pointer',
        }}
      >
        Clear
      </button>
      <div style={{ marginTop: 25 }}>
        {logs || '(no logs yet)'}
      </div>
    </div>
  );
}
