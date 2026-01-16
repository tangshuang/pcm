import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useStore } from './store';
import { useWebSocket } from './hooks/useWebSocket';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import InputArea from './components/InputArea';
import StatusBar from './components/StatusBar';
import HomePage from './components/HomePage';
import Paper from './components/Paper';
import ScrollToTop from './components/ScrollToTop';
import { v4 as uuidv4 } from 'uuid';

export default function App() {
  const { sessionId, setSession, connected, loadHistoryNodes } = useStore();
  const { send } = useWebSocket();
  
  useEffect(() => {
    // Initialize session
    if (!sessionId) {
      // Try to restore session ID from localStorage
      const savedSessionId = localStorage.getItem('currentSessionId');
      if (savedSessionId) {
        setSession(savedSessionId);
      } else {
        const newSessionId = uuidv4();
        setSession(newSessionId);
        localStorage.setItem('currentSessionId', newSessionId);
      }
    }
  }, [sessionId, setSession]);
  
  // Load history when connection is established and session ID exists
  useEffect(() => {
    if (connected && sessionId) {
      loadHistoryNodes(sessionId);
    }
  }, [connected, sessionId, loadHistoryNodes]);
  
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/paper" element={<Paper />} />
        <Route path="/dashboard" element={
          <div className="app-container" style={{overflow: 'hidden'}}>
            <Sidebar send={send} />
            <div className="main-area">
              <Canvas send={send} />
              <StatusBar />
              <InputArea send={send} />
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}
