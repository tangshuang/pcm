import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ContextModal from './ContextModal';
import { v4 as uuidv4 } from 'uuid';

const Node = React.memo(function Node({ node, onClose, send }) {
  const { moveNode, streamingNodes, updateNode, scale, saveCanvasState, activeNodeId, setActiveNode, selectedNodeId, setSelectedNode, toggleNodeExpanded, getNodeNumber, nodes, sessionId, userId, addNode, addActiveProcessing, setMessageStatus, messageStatuses } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(node.content || '');
  const [isHovering, setIsHovering] = useState(false);
  const [contentHeight, setContentHeight] = useState(null);
  const [showContextModal, setShowContextModal] = useState(false);
  const [showIntentInfo, setShowIntentInfo] = useState(false); // 控制意图信息的展开/收起
  const [isLoadingIntentMeta, setIsLoadingIntentMeta] = useState(false);
  const [isLoadingContextSpec, setIsLoadingContextSpec] = useState(false);
  const [intentMetaError, setIntentMetaError] = useState(null);
  const [contextSpecError, setContextSpecError] = useState(null);
  const contentRef = useRef(null);
  const nodeRef = useRef(null); // 用于检测点击外部
  const textareaRef = useRef(null); // 用于检测编辑框外部点击
  const rafRef = useRef(null); // 用于requestAnimationFrame
  const wasStreamingRef = useRef(false);

  const isStreaming = streamingNodes.has(node.id);
  const isActive = activeNodeId === node.id;
  const isSelected = selectedNodeId === node.id;
  const isExpanded = node.expanded !== false; // 默认展开，除非明确设置为 false
  const nodeNumber = getNodeNumber(node.id); // 获取节点编号

  // 查找关联的意图节点（如果当前节点是用户节点）
  const isUserNode = node.type === 'chat' && node.title === 'User';
  const intentNode = isUserNode ? nodes.find(n => n.type === 'intent' && n.parentNodeId === node.id) : null;
  const intentMeta = intentNode?.intentMeta || null;
  const contextSpec = intentNode?.contextSpec || null;

  // 检查是否正在处理（分析意图或构建上下文）
  // 条件：用户节点 && 有处理状态 && 状态是处理中的阶段
  const messageStatus = messageStatuses.get(node.id);
  const isProcessing = isUserNode && messageStatus &&
    ['sending', 'analyzing', 'context_building', 'building_context'].includes(messageStatus.stage);

  // 检查是否应该显示意图按钮（只要意图节点存在就显示）
  const shouldShowIntentButton = isUserNode && intentNode;

  // 自动滚动到底部 - 在流式回复时
  useEffect(() => {
    if (!contentRef.current) {
      wasStreamingRef.current = isStreaming;
      return;
    }

    if (isStreaming) {
      // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
      requestAnimationFrame(() => {
        if (contentRef.current) {
          // 强制滚动到底部
          contentRef.current.scrollTop = contentRef.current.scrollHeight;

          // 如果第一次滚动失败，再尝试一次（等待渲染完成）
          setTimeout(() => {
            if (contentRef.current && isStreaming) {
              contentRef.current.scrollTop = contentRef.current.scrollHeight;
            }
          }, 50);
        }
      });
    } else if (wasStreamingRef.current) {
      requestAnimationFrame(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
      });
    }

    wasStreamingRef.current = isStreaming;
  }, [isStreaming, node.content]);

  // 监测实际内容高度变化，动态调整节点位置
  useEffect(() => {
    if (nodeRef.current && !isEditing) {
      let adjustTimeout = null;

      // 使用 ResizeObserver 监听节点高度变化
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const realHeight = entry.contentRect.height;

          // 如果实际高度与估算高度差异超过10px，更新并重新布局
          if (Math.abs(realHeight - (node.estimatedHeight || 0)) > 10) {
            updateNode(node.id, { estimatedHeight: realHeight });

            // 使用防抖，避免频繁重新布局
            if (adjustTimeout) {
              clearTimeout(adjustTimeout);
            }

            adjustTimeout = setTimeout(() => {
              const { adjustNodePositions } = useStore.getState();
              if (adjustNodePositions) {
                adjustNodePositions(node.id);
              }
            }, 150);
          }
        }
      });

      resizeObserver.observe(nodeRef.current);

      return () => {
        resizeObserver.disconnect();
        if (adjustTimeout) {
          clearTimeout(adjustTimeout);
        }
      };
    }
  }, [node.id, node.estimatedHeight, isEditing, updateNode]);

  // 处理节点内容区域的滚轮事件
  const handleContentWheel = useCallback((e) => {
    if (!isActive) return;
    
    // 完全阻止事件冒泡到画布，让内容区域独立处理滚动
    e.stopPropagation();
  }, [isActive]);

  // 删除确认处理
  const handleDelete = useCallback((e) => {
    e.stopPropagation();

    const confirmMessage = 'Are you sure you want to delete this message?\n\nNote: This will also delete all messages after this one.';

    if (window.confirm(confirmMessage)) {
      onClose();
    }
  }, [onClose]);

  const handleClick = useCallback((e) => {
    if (hasDragged || isEditing) {
      setHasDragged(false);
      return;
    }

    // 如果是收起状态的意图节点圆圈，点击展开
    if (node.type === 'intent' && !isExpanded) {
      toggleNodeExpanded(node.id);
      setActiveNode(node.id);
      e.stopPropagation();
      return;
    }

    // 意图节点（展开状态）：单击激活节点以允许滚动
    if (node.type === 'intent' && isExpanded) {
      setActiveNode(node.id);
      e.stopPropagation();
      return;
    }

    // 其他节点（用户消息、AI回复、任务）：单击选中节点用于创建分支
    if (node.type === 'chat' || node.type === 'task') {
      setSelectedNode(node.id);
      setActiveNode(node.id);
      e.stopPropagation();
    }
  }, [node.id, node.type, isEditing, hasDragged, setActiveNode, setSelectedNode, toggleNodeExpanded, isExpanded]);

  const handleMouseDown = useCallback((e) => {
    if (e.target.classList.contains('node-close') || isEditing) return;

    // 只允许左键（button === 0）拖动节点，禁用右键拖动
    if (e.button !== 0) return;

    // 如果节点已激活，内容区域允许文本选择，不触发拖动
    if (isActive) {
      if (e.target.closest('.node-content')) {
        return;
      }
      // 如果点击的是意图信息面板区域，不触发拖动，允许文本选择
      if (e.target.closest('.intent-info-panel')) {
        return;
      }
    }

    // 节点未激活时，所有区域（包括内容区域）都可以拖动卡片

    setIsDragging(true);
    // 考虑缩放因素计算偏移量
    setDragOffset({
      x: e.clientX / scale - node.x,
      y: e.clientY / scale - node.y
    });

    e.preventDefault();
    e.stopPropagation();
  }, [node.x, node.y, isEditing, scale, isActive]);
  
  const handleMouseMove = useCallback((e) => {
    if (isDragging) {
      // 使用 requestAnimationFrame 节流更新，提高性能
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        // 考虑缩放因素计算新位置
        const newX = e.clientX / scale - dragOffset.x;
        const newY = e.clientY / scale - dragOffset.y;
        moveNode(node.id, newX, newY);
        setHasDragged(true); // 标记已经拖拽
      });
    }
  }, [isDragging, dragOffset, node.id, moveNode, scale]);
  
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      // 拖拽结束时保存画布状态
      setTimeout(() => {
        saveCanvasState();
      }, 100);
    }
  }, [isDragging, saveCanvasState]);
  
  // 绑定全局鼠标事件
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 清理 requestAnimationFrame
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);


  const handleDoubleClick = useCallback((e) => {
    if (e.target.classList.contains('node-close')) return;

    // 只允许编辑用户消息和AI回复
    if (node.type === 'chat' || node.type === 'task') {
      // 在进入编辑模式前，获取当前内容区域的可见高度
      if (contentRef.current) {
        // 使用 clientHeight 获取容器的可见高度（不包括溢出部分）
        // 减去 16px 以更好地匹配原始内容高度
        const currentHeight = contentRef.current.clientHeight - 24;
        setContentHeight(Math.max(currentHeight, 100)); // 至少 100px
      }
      setIsEditing(true);
      setEditContent(node.content || '');
      setActiveNode(node.id); // 编辑时激活节点
    }
  }, [node.content, node.type, node.id, setActiveNode]);
  
  const handleSaveEdit = useCallback(async () => {
    if (editContent !== node.content) {
      // 保存历史版本
      const historyEntry = {
        timestamp: Date.now(),
        originalContent: node.content,
        editedContent: editContent,
        editReason: 'User manual edit'
      };
      
      // 更新节点内容
      updateNode(node.id, { 
        content: editContent,
        editHistory: [...(node.editHistory || []), historyEntry]
      });
      
      // 发送到后端保存
      try {
        await fetch('/api/messages/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: node.id,
            newContent: editContent,
            originalContent: node.content,
            timestamp: Date.now()
          })
        });
      } catch (err) {
        console.error('Failed to save edit:', err);
      }
    }
    
    setIsEditing(false);
  }, [editContent, node.content, node.id, node.editHistory, updateNode]);
  
  const handleCancelEdit = useCallback(() => {
    setEditContent(node.content || '');
    setIsEditing(false);
  }, [node.content]);

  // 监听外部点击以保存并退出编辑态
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e) => {
      // 检查点击是否在编辑框外部（包括节点内的其他地方）
      if (textareaRef.current && !textareaRef.current.contains(e.target)) {
        handleSaveEdit();
      }
    };

    // 添加延迟以避免立即触发（因为双击事件后会有mousedown事件）
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing, handleSaveEdit]);

  // 右键菜单处理 - 允许显示系统右键菜单
  const handleContextMenu = useCallback((e) => {
    // 不阻止默认行为，允许右键菜单
    // 右键拖动已在 handleMouseDown 中被禁用（只允许左键 button === 0）
  }, []);

  const formatList = (value) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return 'None';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };

  const formatConfidence = (value) => {
    return typeof value === 'number' && !Number.isNaN(value) ? value.toFixed(2) : '0.00';
  };
  
  const getTypeColor = () => {
    switch (node.type) {
      case 'chat': return 'chat';
      case 'task': return 'task';
      case 'event': return 'event';
      case 'intent': return 'memory';
      default: return 'chat';
    }
  };

  const getIntentColorByType = (intentType) => {
    if (intentType === 'question') return '#3b82f6';
    if (intentType === 'task') return '#8b5cf6';
    if (intentType === 'feedback') return '#f59e0b';
    if (intentType === 'clarification') return '#ec4899';
    if (intentType === 'interrupt') return '#ef4444';
    return '#10b981';
  };

  // 根据意图类型获取颜色
  const getIntentColor = () => {
    const intentType = node.intent || '';
    return getIntentColorByType(intentType);
  };

  // 根据意图节点内容获取按钮颜色
  const getIntentButtonColor = (intentNodeContent, intentType) => {
    if (intentType) {
      return getIntentColorByType(intentType);
    }

    const content = intentNodeContent || '';
    if (content.includes('Type: question') || content.includes('question')) return '#3b82f6';
    if (content.includes('Type: task') || content.includes('task')) return '#8b5cf6';
    if (content.includes('Type: feedback') || content.includes('feedback')) return '#f59e0b';
    if (content.includes('Type: clarification') || content.includes('clarification')) return '#ec4899';
    if (content.includes('Type: interrupt') || content.includes('interrupt')) return '#ef4444';
    return '#10b981';
  };

  useEffect(() => {
    if (!showIntentInfo || !intentNode) return;
    let cancelled = false;

    const loadIntentMeta = async () => {
      if (intentNode.intentMeta) return;
      setIsLoadingIntentMeta(true);
      setIntentMetaError(null);
      try {
        const response = await fetch(`/api/intents/${intentNode.id}/meta`);
        if (!response.ok) {
          throw new Error(`Failed to load intent metadata: ${response.status}`);
        }
        const meta = await response.json();
        if (!cancelled) {
          updateNode(intentNode.id, { intentMeta: meta });
        }
      } catch (err) {
        if (!cancelled) {
          setIntentMetaError(err.message || 'Failed to load intent metadata');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingIntentMeta(false);
        }
      }
    };

    const loadContextSpec = async () => {
      if (intentNode.contextSpec) return;
      setIsLoadingContextSpec(true);
      setContextSpecError(null);
      try {
        const response = await fetch(`/api/intents/${intentNode.id}/spec`);
        if (!response.ok) {
          throw new Error(`Failed to load context spec: ${response.status}`);
        }
        const spec = await response.json();
        if (!cancelled) {
          updateNode(intentNode.id, { contextSpec: spec });
        }
      } catch (err) {
        if (!cancelled) {
          setContextSpecError(err.message || 'Failed to load context spec');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingContextSpec(false);
        }
      }
    };

    loadIntentMeta();
    loadContextSpec();

    return () => {
      cancelled = true;
    };
  }, [showIntentInfo, intentNode?.id, intentNode?.intentMeta, intentNode?.contextSpec, updateNode]);
  
  // Markdown 渲染配置 - 使用 useMemo 缓存，避免每次渲染都重新创建
  const markdownComponents = useMemo(() => ({
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          customStyle={{
            margin: '12px 0',
            borderRadius: '6px',
            fontSize: '13px',
            lineHeight: '1.5'
          }}
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code
          className={className}
          style={{
            background: 'var(--bg-tertiary)',
            padding: '2px 6px',
            borderRadius: '3px',
            fontSize: '13px',
            fontFamily: 'monospace',
            color: 'var(--accent-blue)'
          }}
          {...props}
        >
          {children}
        </code>
      );
    },
    h1: ({ children }) => (
      <h1 style={{ marginTop: '20px', marginBottom: '12px', color: 'var(--text-primary)', fontSize: '24px', fontWeight: '600' }}>
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 style={{ marginTop: '18px', marginBottom: '10px', color: 'var(--text-primary)', fontSize: '20px', fontWeight: '600' }}>
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 style={{ marginTop: '16px', marginBottom: '8px', color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600' }}>
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p style={{ marginTop: '8px', marginBottom: '8px', lineHeight: '1.6', color: 'var(--text-primary)' }}>
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul style={{ marginTop: '8px', marginBottom: '8px', paddingLeft: '24px', color: 'var(--text-primary)' }}>
        {React.Children.map(children, (child, index) =>
          React.isValidElement(child) ? React.cloneElement(child, { key: index }) : child
        )}
      </ul>
    ),
    ol: ({ children }) => (
      <ol style={{ marginTop: '8px', marginBottom: '8px', paddingLeft: '24px', color: 'var(--text-primary)' }}>
        {React.Children.map(children, (child, index) =>
          React.isValidElement(child) ? React.cloneElement(child, { key: index }) : child
        )}
      </ol>
    ),
    li: ({ children }) => (
      <li style={{ marginTop: '4px', lineHeight: '1.6' }}>
        {children}
      </li>
    ),
    blockquote: ({ children }) => (
      <blockquote style={{
        margin: '12px 0',
        padding: '8px 16px',
        borderLeft: '4px solid var(--accent-blue)',
        background: 'var(--bg-tertiary)',
        borderRadius: '4px',
        color: 'var(--text-secondary)'
      }}>
        {React.Children.map(children, (child, index) =>
          React.isValidElement(child) ? React.cloneElement(child, { key: index }) : child
        )}
      </blockquote>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: 'var(--accent-blue)',
          textDecoration: 'underline',
          cursor: 'pointer'
        }}
      >
        {children}
      </a>
    ),
    table: ({ children }) => (
      <div style={{ overflowX: 'auto', marginTop: '12px', marginBottom: '12px' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid var(--border-color)'
        }}>
          {React.Children.map(children, (child, index) =>
            React.isValidElement(child) ? React.cloneElement(child, { key: index }) : child
          )}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th style={{
        padding: '8px',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-color)',
        fontWeight: '600',
        textAlign: 'left'
      }}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td style={{
        padding: '8px',
        border: '1px solid var(--border-color)'
      }}>
        {children}
      </td>
    ),
    hr: () => (
      <hr style={{
        margin: '16px 0',
        border: 'none',
        borderTop: '1px solid var(--border-color)'
      }} />
    )
  }), []); // 空依赖数组，因为配置是静态的

  // 意图节点不再单独渲染（已在Canvas中过滤），这里作为安全保障
  if (node.type === 'intent') {
    return null;
  }

  // 判断是否是根节点（没有parentNodeId，或者parentNodeId对应的节点不存在）
  const isRootNode = !node.parentNodeId || !nodes.find(n => n.id === node.parentNodeId);

  // 正常显示（矩形卡片）
  return (
    <div
      ref={nodeRef}
      className={`node ${isDragging ? 'dragging' : ''} ${isEditing ? 'editing' : ''} ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''} ${isRootNode ? 'root-node' : ''}`}
      style={{
        left: node.x,
        top: node.y,
        borderColor: isStreaming
          ? 'var(--accent-blue)'
          : isEditing
          ? 'var(--accent-green)'
          : isActive
          ? 'var(--accent-purple)'
          : isSelected
          ? 'var(--accent-orange)'
          : undefined,
        // borderWidth: isActive ? '3px' : '1px',
        borderWidth: '1px',
        zIndex: isDragging ? 1000 : isEditing ? 999 : isActive ? 500 : isSelected ? 100 : 10,
        cursor: isActive || isEditing ? 'initial' : 'grab',
        // 根节点使用浅蓝色背景
        background: isRootNode ? '#f1f6ff' : undefined,
        // boxShadow: isActive && isSelected
        //   ? '0 0 0 4px var(--accent-purple), 0 0 0 8px var(--accent-orange)'
        //   : isActive
        //   ? '0 0 0 4px var(--accent-purple)'
        //   : isSelected
        //   ? '0 0 0 3px var(--accent-orange)'
        //   : undefined
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="node-header">
        <div className={`node-type-indicator ${getTypeColor()}`} />
        <span className="node-title">
          {nodeNumber && (
            <span style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              marginRight: 6,
              fontWeight: '600'
            }}>
              #{nodeNumber}
            </span>
          )}
          {node.title}
          {node.editHistory && node.editHistory.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--accent-orange)', marginLeft: 4 }}>
              (Edited {node.editHistory.length} time{node.editHistory.length > 1 ? 's' : ''})
            </span>
          )}
        </span>
        {isStreaming && (
          <span style={{
            fontSize: 10,
            color: 'var(--accent-blue)',
            animation: 'pulse 1s infinite'
          }}>
            ●
          </span>
        )}
        {/* 用户节点右上方：处理中loading或意图按钮 */}
        {!isEditing && isUserNode && (
          <>
            {isProcessing ? (
              // 正在处理中（分析意图或等待AI回复）：显示loading图标
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginRight: '4px',
                padding: '4px 10px',
                background: 'var(--accent-blue)',
                borderRadius: '4px',
                color: 'white',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    animation: 'spin 1s linear infinite'
                  }}
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span>Analyzing...</span>
              </div>
             ) : shouldShowIntentButton ? (
               // AI回复节点已出现：显示意图按钮
               <button
                className="node-intent-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowIntentInfo(!showIntentInfo);
                  // 展开意图信息时激活并选中节点，使其z-index处于顶部并拥有橙色边框
                  if (!showIntentInfo) {
                    setActiveNode(node.id);
                    setSelectedNode(node.id);
                  }
                }}
                style={{
                  background: getIntentButtonColor(intentNode.content, intentNode.intent),
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: '4px 10px',
                  marginRight: '4px',
                  borderRadius: '4px',
                  transition: 'all 0.2s',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
                title={showIntentInfo ? "Collapse intent info" : "Expand intent info"}
              >
                <span>Intent</span>
                <span style={{
                  fontSize: '10px',
                  transition: 'transform 0.2s',
                  display: 'inline-block'
                }}>
                  {showIntentInfo ? '▲' : '▼'}
                </span>
              </button>
            ) : null}
          </>
        )}
        {!isEditing && node.type !== 'intent' && (
          <button
            className="node-close"
            onClick={handleDelete}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '0 4px'
            }}
          >
            ×
          </button>
        )}
        {!isEditing && node.type === 'intent' && (
          <button
            className="node-collapse"
            onClick={(e) => {
              e.stopPropagation();
              toggleNodeExpanded(node.id);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '0 4px'
            }}
            title="Collapse"
          >
            ▲
          </button>
        )}
      </div>
      <div
        ref={contentRef}
        className={`node-content ${(node.type === 'intent' || (node.type === 'chat' && node.title === 'User')) ? 'preserve-whitespace' : ''}`}
        style={{
          overflowY: (isActive || isStreaming) && !isEditing ? 'auto' : 'hidden',
          maxHeight: (isActive || isStreaming) && !isEditing ? '400px' : undefined,
          // 未激活时：不可选中文本，显示 grab 光标
          // 激活时：可选中文本，显示默认光标
          userSelect: isActive && !isEditing ? 'text' : 'none',
          cursor: isActive && !isEditing ? 'text' : 'grab'
        }}
        onWheel={handleContentWheel}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            style={{
              width: '100%',
              height: contentHeight ? `${contentHeight}px` : '100px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '8px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              lineHeight: '1.6',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              margin: 0,
              overflowY: 'auto'
            }}
            placeholder="Edit content..."
            autoFocus
          />
        ) : (
          <>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={markdownComponents}
            >
              {node.content || ''}
            </ReactMarkdown>
            {isStreaming && (
              <span className="cursor" style={{
                display: 'inline-block',
                width: '8px',
                height: '16px',
                background: 'var(--accent-blue)',
                marginLeft: '2px',
                animation: 'pulse 0.5s infinite'
              }} />
            )}
          </>
        )}
      </div>

      {/* 用户节点：展示意图信息 */}
      {isUserNode && intentNode && showIntentInfo && !isEditing && (
        <div className="intent-info-panel" style={{
          borderTop: '1px solid var(--border-color)',
          marginTop: '12px',
          paddingTop: '12px',
          paddingLeft: '12px',
          paddingRight: '12px',
          paddingBottom: '4px',
          userSelect: isActive ? 'text' : 'none',
          cursor: isActive ? 'default' : 'grab'
        }}>
          <div style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            marginBottom: '8px',
            fontWeight: '600'
          }}>
            Intent Analysis
          </div>
          <div style={{
            fontSize: '13px',
            color: 'var(--text-primary)',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            userSelect: isActive ? 'text' : 'none',
            cursor: isActive ? 'text' : 'grab'
          }}>
            {intentNode.content}
          </div>
          <div style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            marginTop: '12px',
            marginBottom: '8px',
            fontWeight: '600'
          }}>
            Structured Intent
          </div>
          <div style={{
            fontSize: '13px',
            color: 'var(--text-primary)',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            userSelect: isActive ? 'text' : 'none',
            cursor: isActive ? 'text' : 'grab'
          }}>
            {isLoadingIntentMeta && 'Loading intent structure...'}
            {intentMetaError && `Failed to load: ${intentMetaError}`}
            {!isLoadingIntentMeta && !intentMetaError && !intentMeta && 'No structured intent data available'}
            {intentMeta?.intentStruct && (
              <>
                <div>Goal: {intentMeta.intentStruct.goal || 'None'}</div>
                <div>Constraints: {formatList(intentMeta.intentStruct.constraints)}</div>
                <div>Entities: {formatList(intentMeta.intentStruct.entities)}</div>
                <div>Plan Hints: {formatList(intentMeta.intentStruct.planHints)}</div>
                <div>Uncertainty: {formatList(intentMeta.intentStruct.uncertaintyReasons)}</div>
                <div>Confidence: {formatConfidence(intentMeta.confidence ?? intentMeta.intentStruct.confidence ?? intentNode.confidence)}</div>
              </>
            )}
          </div>
          <div style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            marginTop: '12px',
            marginBottom: '8px',
            fontWeight: '600'
          }}>
            Context Requirement Spec (CRS)
          </div>
          <div style={{
            fontSize: '13px',
            color: 'var(--text-primary)',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            userSelect: isActive ? 'text' : 'none',
            cursor: isActive ? 'text' : 'grab'
          }}>
            {isLoadingContextSpec && 'Loading context spec...'}
            {contextSpecError && `Failed to load: ${contextSpecError}`}
            {!isLoadingContextSpec && !contextSpecError && !contextSpec && 'No context spec data available'}
            {contextSpec && (
              <>
                <div>Required: {formatList(contextSpec.required)}</div>
                <div>Constraints: {formatList(contextSpec.constraints)}</div>
                <div>Memory Types: {formatList(contextSpec.memoryTypes)}</div>
                <div>
                  History Policy:
                  {` ${contextSpec.historyPolicy?.includeRecent ? 'Include recent' : 'Not included'}`}
                  {contextSpec.historyPolicy?.maxTurns ? `, max turns ${contextSpec.historyPolicy.maxTurns}` : ''}
                </div>
                <div>
                  Budget:
                  {` maxTokens=${contextSpec.budget?.maxTokens ?? '-'}, maxMemories=${contextSpec.budget?.maxMemories ?? '-'}`}
                </div>
              </>
            )}
          </div>
          {/* 始终显示按钮，context 按需加载 */}
          <div style={{
            marginTop: '12px',
            display: 'flex',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                
                // 按需加载 context
                try {
                  const response = await fetch(`/api/intents/${intentNode.id}/context`);
                  if (response.ok) {
                    const context = await response.json();
                    // 临时存储 context 用于显示
                    intentNode.context = context;
                    setShowContextModal(true);
                  } else {
                    console.error('Failed to load context:', response.status);
                    alert('Failed to load context, please try again');
                  }
                } catch (err) {
                  console.error('Error loading context:', err);
                  alert('Failed to load context, please try again');
                }
              }}
              style={{
                background: 'var(--accent-blue)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2563eb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent-blue)';
              }}
              title="View the complete context information sent to AI"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              View Context
            </button>
             <button
               onClick={async (e) => {
                 e.stopPropagation();

                 // 按需加载 context 用于再次执行
                 try {
                   const response = await fetch(`/api/intents/${intentNode.id}/context`);
                   if (response.ok) {
                     const context = await response.json();

                     // 发送再次执行请求到服务器
                     if (send) {
                       send('reexecute', {
                         sessionId,
                         userId,
                         intentNodeId: intentNode.id,
                         context: context,
                         userContent: node.content
                       });
                     } else {
                       console.error('send function not available');
                     }
                   } else {
                     console.error('Failed to load context:', response.status);
                     alert('Failed to load context, please try again');
                   }
                 } catch (err) {
                   console.error('Error loading context:', err);
                   alert('Failed to load context, please try again');
                 }
               }}
               style={{
                 background: 'var(--accent-green)',
                 color: 'white',
                   border: 'none',
                   borderRadius: '6px',
                   padding: '6px 12px',
                   fontSize: '12px',
                   cursor: 'pointer',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '4px',
                   transition: 'all 0.2s'
                 }}
                 onMouseEnter={(e) => {
                   e.currentTarget.style.background = '#059669';
                 }}
                 onMouseLeave={(e) => {
                   e.currentTarget.style.background = 'var(--accent-green)';
                 }}
                 title="Create a new branch task based on current intent"
               >
                 <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                 </svg>
                 Re-execute
               </button>
             <button
               onClick={(e) => {
                 e.stopPropagation();
                 setShowIntentInfo(false);
               }}
               style={{
                 background: 'var(--accent-orange)',
                 color: 'white',
                 border: 'none',
                 borderRadius: '6px',
                 padding: '6px 12px',
                 fontSize: '12px',
                 cursor: 'pointer',
                 display: 'flex',
                 alignItems: 'center',
                 gap: '4px',
                 transition: 'all 0.2s'
               }}
               onMouseEnter={(e) => {
                 e.currentTarget.style.opacity = '0.8';
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.opacity = '1';
               }}
               title="Collapse intent information"
             >
               <span style={{ fontSize: '12px' }}>▲</span>
               Collapse
             </button>
            </div>
        </div>
      )}

      {/* 上下文查看弹窗 */}
      {showContextModal && createPortal(
        <ContextModal
          context={intentNode ? intentNode.context : node.context}
          onClose={() => setShowContextModal(false)}
        />,
        document.body
      )}
    </div>
  );
});

export default Node;
