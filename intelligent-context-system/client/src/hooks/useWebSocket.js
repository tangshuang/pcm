import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';
import { v4 as uuidv4 } from 'uuid';

export function useWebSocket() {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const resolveWebSocketUrl = useCallback(() => {
    const envUrl = import.meta.env.VITE_WS_URL;
    if (envUrl) {
      return envUrl;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const envPath = import.meta.env.VITE_WS_PATH;
    const path = envPath === undefined ? '/ws' : envPath;
    const normalizedPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';

    return `${protocol}//${host}${normalizedPath}`;
  }, []);
  
  const {
    setConnected,
    setStatus,
    addNode,
    updateNode,
    appendToNode,
    startStreaming,
    endStreaming,
    addStreamingNode,
    removeStreamingNode,
    setMessageStatus,
    removeMessageStatus,
    addActiveProcessing,
    removeActiveProcessing,
    addTask,
    updateTask,
    addEvent,
    addSubscription,
    removeSubscription,
    setSelectedNode,
    centerOnNode,
    saveCanvasState
  } = useStore();
  
  const connect = useCallback(() => {
    const wsUrl = resolveWebSocketUrl();
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      setConnected(true, null);
    };
    
    ws.onclose = () => {
      setConnected(false, null);
      
      // 自动重连
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };
  }, [resolveWebSocketUrl]);
  
  const handleMessage = useCallback((message) => {
    const { type, data } = message;
    
    switch (type) {
      case 'connected':
        setConnected(true, data.clientId);
        break;
        
      case 'status':
        setStatus(data);
        break;

      // 新增：每消息状态更新
      case 'message_status':
        setMessageStatus(data.messageId, {
          stage: data.stage,
          message: data.message
        });
        break;

      // 新增：任务限制达到
      case 'task_limit_reached':
        setMessageStatus(data.messageId, {
          stage: 'queued',
          message: `Queued (limit ${data.limit})`
        });
        break;

      // 新增：错误处理
      case 'error':
        if (data.messageId) {
          setMessageStatus(data.messageId, {
            stage: 'error',
            message: `Error: ${data.error}`
          });
          removeActiveProcessing(data.messageId);
        }
        console.error('Server error:', data.error);
        break;

      case 'intent_analyzed':
        // 检查是否已存在相同的意图节点
        const existingIntentNode = useStore.getState().nodes.find(
          n => n.id === data.intentId
        );
        if (!existingIntentNode) {
          // 使用后端的 intentId 作为节点 ID，保持一致性
          // 不再保存 context，按需从后端加载
          addNode({
            id: data.intentId, // 使用后端的 intentId
            type: 'intent',
            title: `Intent: ${data.intent}`,
            content: `Type: ${data.intent}\nTopic: ${data.topic}\nUrgency: ${data.urgency}\nConfidence: ${typeof data.confidence === 'number' ? data.confidence.toFixed(2) : '0.00'}\nRelated: ${data.relatedTopics?.join(', ') || 'None'}`,
            intentId: data.intentId,
            intent: data.intent,
            topic: data.topic,
            urgency: data.urgency,
            confidence: data.confidence,
            relatedTopics: data.relatedTopics,
            relatedMessageId: data.relatedMessageId, // 保存关联的用户消息ID
            parentNodeId: data.parentNodeId // 意图节点的父节点是用户消息
            // context 不再保存，按需加载
          });
          // 保存意图节点ID，供AI回复使用
          window.__currentIntentNodeId = data.intentId;
        }
        break;
        
      case 'context_built':
        addEvent({
          id: uuidv4(),
          source: 'system',
          type: 'context_built',
          data: {
            taskId: data.taskId,
            contextSize: data.contextSize,
            memoryCount: data.memoryCount
          },
          timestamp: Date.now()
        });
        break;
        
      case 'response_start':
        // 更新原始消息状态
        if (data.relatedMessageId) {
          setMessageStatus(data.relatedMessageId, {
            stage: 'responding',
            message: 'Responding...'
          });
        }

        // 检查是否已存在相同messageId的节点
        const existingResponseNode = useStore.getState().nodes.find(
          n => n.messageId === data.messageId
        );
        if (!existingResponseNode) {
          // 使用后端提供的 messageId 作为节点 ID
          addNode({
            id: data.messageId, // 使用后端的 messageId 作为节点 ID
            type: data.nodeType === 'task_response' ? 'task' : 'chat',
            title: data.nodeType === 'task_response' ? 'Task Execution' : 'AI Reply',
            content: '',
            messageId: data.messageId,
            parentNodeId: data.parentNodeId || window.__currentIntentNodeId || null // 优先使用后端提供的parentNodeId
          });

          // 使用新的并发API
          addStreamingNode(data.messageId);
          // 保存messageId用于后续更新
          window.__currentStreamingNodeId = data.messageId;
        }
        break;
        
      case 'response_chunk':
        if (data.messageId) {
          updateNode(data.messageId, { content: data.accumulated });
        } else if (window.__currentStreamingNodeId) {
          updateNode(window.__currentStreamingNodeId, { content: data.accumulated });
        }
        break;
        
      case 'response_end':
        // 使用新的并发API
        if (data.messageId) {
          removeStreamingNode(data.messageId);
        }

        // 清理消息状态
        if (data.relatedMessageId) {
          removeMessageStatus(data.relatedMessageId);
          removeActiveProcessing(data.relatedMessageId);
        }

        // 自动选中最后一条消息作为下次对话的分支点
        if (data.messageId) {
          setSelectedNode(data.messageId);
        } else if (window.__currentStreamingNodeId) {
          setSelectedNode(window.__currentStreamingNodeId);
        }
        window.__currentStreamingNodeId = null;

        // 保持status为idle（兼容旧代码）
        setStatus({ stage: 'idle', message: '' });

        // 流式响应结束后保存画布状态（确保AI回复内容被持久化）
        setTimeout(() => {
          saveCanvasState();
        }, 100);
        break;
        
      case 'task_created':
        addTask({
          id: data.taskId,
          type: data.type,
          topic: data.topic,
          status: 'running',
          progress: 0
        });
        break;
        
      case 'task_completed':
        updateTask(data.taskId, { status: 'completed', progress: 100 });
        break;
        
      case 'environment_event':
        addEvent({
          id: data.id,
          source: data.source,
          type: data.type,
          data: data.data,
          timestamp: Date.now()
        });
        
        // 为环境事件创建节点
        addNode({
          id: data.id, // 使用事件ID作为节点ID
          type: 'event',
          title: `${data.source}: ${data.type}`,
          content: JSON.stringify(data.data, null, 2)
        });
        break;
        
      case 'subscription_added':
        addSubscription(data);
        break;
        
      case 'subscription_removed':
        removeSubscription(data.id);
        break;
        
      default:
        console.error('Unknown message type:', type, data);
    }
  }, []);
  
  const send = useCallback((type, data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);
  
  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);
  
  return { send };
}
