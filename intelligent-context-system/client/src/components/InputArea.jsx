import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { v4 as uuidv4 } from 'uuid';

export default function InputArea({ send }) {
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef(null);
  const {
    sessionId,
    userId,
    addNode,
    connected,
    stats,
    addActiveProcessing,
    setMessageStatus,
    selectedNodeId // 获取当前选中的节点ID
  } = useStore();

  const handleSubmit = () => {
    // 移除isProcessing检查，允许并发发送
    if (!input.trim() || !connected) return;

    // 生成消息ID，前后端使用同一个ID
    const messageId = uuidv4();

    // 添加用户消息节点（使用生成的messageId作为节点ID）
    // 如果有选中的节点，则将其作为父节点（创建分支）
    addNode({
      id: messageId, // 使用生成的messageId作为节点ID
      type: 'chat',
      title: 'User',
      content: input,
      parentNodeId: selectedNodeId || null // 使用选中的节点作为父节点
    });

    // 添加到活跃处理追踪（新架构）
    addActiveProcessing(messageId);
    setMessageStatus(messageId, { stage: 'sending', message: 'Sending...' });

    // 发送到服务器（包含messageId与锚点提示）
    // 传递 parentNodeId 让后端知道从哪个节点继续对话
    send('chat', {
      messageId, // 发送messageId给后端
      sessionId,
      userId,
      content: input,
      parentNodeId: selectedNodeId || null // 传递父节点ID给后端
    });

    // 立即清空输入（不等待回复）
    setInput('');
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => setIsComposing(false);
  
  // 自动调整高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);
  
  return (
    <div className="input-area">
      <div className="input-wrapper">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={connected ? "Enter message... (Shift+Enter for new line)" : "Connecting to server..."}
          disabled={!connected}
          rows={1}
        />
        <button
          className="send-btn"
          onClick={handleSubmit}
          disabled={!input.trim() || !connected}
        >
          {stats.totalProcessing > 0 ? `Send (${stats.totalProcessing} processing)` : 'Send'}
        </button>
      </div>
    </div>
  );
}
