import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Logo } from './Logo.jsx';

export default function Sidebar({ send }) {
  const { tasks, events, subscriptions, sessionId, reset } = useStore();
  const [subForm, setSubForm] = useState({ type: 'rss', url: '', name: '' });
  const [apiForm, setApiForm] = useState({ name: '', url: '', extractPath: '' });
  const [showClearButton, setShowClearButton] = useState(false);
  const [escPressCount, setEscPressCount] = useState(0);
  const escTimeoutRef = useRef(null);
  const runningTasks = tasks.filter(task => task.status === 'running');
  
  const handleAddSubscription = (e) => {
    e.preventDefault();
    if (!subForm.url) return;
    
    send('subscribe', {
      type: subForm.type,
      url: subForm.url,
      name: subForm.name || subForm.url,
      interval: 300000
    });
    
    setSubForm({ type: 'rss', url: '', name: '' });
  };
  
  const handleAddApiPoller = (e) => {
    e.preventDefault();
    if (!apiForm.url) return;

    send('poll_api', {
      name: apiForm.name || apiForm.url,
      url: apiForm.url,
      extractPath: apiForm.extractPath,
      interval: 60000
    });

    setApiForm({ name: '', url: '', extractPath: '' });
  };

  // ESC键连续按下检测
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // 如果按钮已显示，按1次ESC就隐藏并重置
        if (showClearButton) {
          setShowClearButton(false);
          setEscPressCount(0);
          if (escTimeoutRef.current) {
            clearTimeout(escTimeoutRef.current);
          }
          return;
        }

        // 按钮未显示时，执行连续按下检测
        // 清除之前的超时
        if (escTimeoutRef.current) {
          clearTimeout(escTimeoutRef.current);
        }

        // 增加计数
        const newCount = escPressCount + 1;
        setEscPressCount(newCount);

        // 如果达到8次，显示按钮
        if (newCount >= 8) {
          setShowClearButton(true);
          setEscPressCount(0); // 重置计数
        } else {
          // 设置2秒超时，如果2秒内没有继续按ESC，重置计数
          escTimeoutRef.current = setTimeout(() => {
            setEscPressCount(0);
          }, 2000);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (escTimeoutRef.current) {
        clearTimeout(escTimeoutRef.current);
      }
    };
  }, [escPressCount, showClearButton]);

  const handleClearHistory = () => {
    if (confirm('Are you sure you want to clear the current session history?')) {
      reset();
      localStorage.removeItem('currentSessionId');
      window.location.reload();
    }
  };
  
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className='flex items-center gap-2'>
          <Logo />
          PCM
        </h1>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
          Session: {sessionId?.slice(0, 8)}...
        </div>
      </div>
      
      {showClearButton && (
        <div className="sidebar-section">
          <h3>Session Control</h3>
          <button
            onClick={handleClearHistory}
            style={{
              background: 'var(--accent-red)',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 12px',
              color: 'white',
              fontSize: '13px',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            Clear History
          </button>
        </div>
      )}

      <div className="sidebar-section">
        <h3>Running Tasks</h3>
        <div className="task-list">
          {runningTasks.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No tasks</div>
          ) : (
            runningTasks.map(task => (
              <div key={task.id} className="task-item">
                <div className={`task-status ${task.status}`} />
                <div className="task-info">
                  <div className="task-type">{task.type}</div>
                  <div className="task-progress">{task.topic}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sidebar-section">
        <h3>Environment Events</h3>
        <div className="events-panel">
          {events.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No events</div>
          ) : (
            events.slice(0, 10).map(event => (
              <div key={event.id} className="event-item">
                <span className="event-source">{event.source}</span>
                <span className="event-type">{event.type}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sidebar-section">
        <h3>Add Subscription</h3>
        <form className="subscription-form" onSubmit={handleAddSubscription}>
          <select
            value={subForm.type}
            onChange={e => setSubForm({...subForm, type: e.target.value})}
          >
            <option value="rss">RSS Feed</option>
            <option value="webpage">Web Monitoring</option>
          </select>
          <input
            type="text"
            placeholder="Name"
            value={subForm.name}
            onChange={e => setSubForm({...subForm, name: e.target.value})}
          />
          <input
            type="url"
            placeholder="URL"
            value={subForm.url}
            onChange={e => setSubForm({...subForm, url: e.target.value})}
          />
          <button type="submit">Add Subscription</button>
        </form>
      </div>

      <div className="sidebar-section">
        <h3>API Polling</h3>
        <form className="subscription-form" onSubmit={handleAddApiPoller}>
          <input
            type="text"
            placeholder="Name (e.g., BTC Price)"
            value={apiForm.name}
            onChange={e => setApiForm({...apiForm, name: e.target.value})}
          />
          <input
            type="url"
            placeholder="API URL"
            value={apiForm.url}
            onChange={e => setApiForm({...apiForm, url: e.target.value})}
          />
          <input
            type="text"
            placeholder="Data Path (e.g., data.price)"
            value={apiForm.extractPath}
            onChange={e => setApiForm({...apiForm, extractPath: e.target.value})}
          />
          <button type="submit">Add Polling</button>
        </form>
      </div>

      <div className="sidebar-section">
        <h3>Active Subscriptions</h3>
        <div className="task-list">
          {subscriptions.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No subscriptions</div>
          ) : (
            subscriptions.map(sub => (
              <div key={sub.id} className="task-item">
                <div className="task-status running" />
                <div className="task-info">
                  <div className="task-type">{sub.name || sub.config?.name}</div>
                  <div className="task-progress">{sub.type || sub.config?.type}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
