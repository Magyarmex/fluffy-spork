import React, { useEffect, useState } from 'react';
import { DebugEvent, debugBus } from '@core/debug';

export function DebugPanel({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<DebugEvent[]>([]);

  useEffect(() => {
    const unsub = debugBus.subscribe((ev) => {
      setEvents((prev) => [...prev.slice(-49), ev]);
    });
    return unsub;
  }, []);

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-card" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '80vh', overflow: 'auto' }}>
        <h2>Debug log</h2>
        {events.length === 0 && <div className="small">No debug events yet.</div>}
        <div>
          {events
            .slice()
            .reverse()
            .map((ev) => (
              <div key={ev.id} style={{ padding: '6px 0', borderBottom: '1px solid #1f2532' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge" style={{ background: ev.level === 'error' ? '#3a2024' : '#1f2633' }}>{ev.level.toUpperCase()}</span>
                  <span className="small">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
                <div>{ev.message}</div>
                {ev.detail && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#9ba7b6' }}>{ev.detail}</pre>}
              </div>
            ))}
        </div>
        <button style={{ marginTop: 12 }} onClick={() => setEvents([])}>
          Clear log
        </button>
      </div>
    </div>
  );
}
