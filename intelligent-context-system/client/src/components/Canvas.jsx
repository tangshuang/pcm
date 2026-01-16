import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import Node from './Node';

export default function Canvas({ send }) {
  const canvasRef = useRef(null);
  const { nodes, scale, offset, setScale, setOffset, removeNode, saveCanvasState, activeNodeId, setActiveNode, selectedNodeId, toggleNodeExpanded, reorganizeLayout, centerOnNode } = useStore();

  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [cursorStyle, setCursorStyle] = useState('default');
  const rafRef = useRef(null); // 用于requestAnimationFrame

  const handleWheel = useCallback((e) => {
    // 检查事件是否发生在激活的节点内容区域
    const activeNode = document.querySelector('.node.active .node-content');
    if (activeNode && activeNode.contains(e.target)) {
      // 如果鼠标在激活节点的内容区域内，只阻止事件冒泡，但允许默认滚动行为
      e.stopPropagation();
      return;
    }

    e.preventDefault();

    // 检测是否按下 Ctrl 或 Command 键 (Mac: metaKey, Win/Linux: ctrlKey)
    const isZooming = e.ctrlKey || e.metaKey;
    // 检测是否按下 Shift 键（但不包括同时按下Ctrl/Command的情况）
    const isShifting = e.shiftKey && !isZooming;

    if (isZooming) {
      // 缩放模式
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newScale = Math.max(0.25, Math.min(2, scale + delta));

      // 获取canvas元素的位置
      const rect = canvasRef.current.getBoundingClientRect();

      // 计算鼠标相对于canvas元素的位置
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // 计算鼠标在世界坐标系中的位置（缩放前）
      const worldX = (mouseX - offset.x) / scale;
      const worldY = (mouseY - offset.y) / scale;

      // 计算新的偏移量，使鼠标指向的世界坐标位置保持不变
      const newOffsetX = mouseX - worldX * newScale;
      const newOffsetY = mouseY - worldY * newScale;

      setScale(newScale);
      setOffset({ x: newOffsetX, y: newOffsetY });
    } else if (isShifting) {
      // 横向滚动模式
      // 使用deltaX（有些浏览器会自动转换）或deltaY（作为备选）
      const deltaX = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      setOffset({ x: offset.x - deltaX, y: offset.y });
    } else {
      // 纵向滚动模式（默认）
      const deltaY = e.deltaY;
      setOffset({ x: offset.x, y: offset.y - deltaY });
    }

    // 延迟保存状态
    setTimeout(() => {
      saveCanvasState();
    }, 500);
  }, [scale, offset, setScale, setOffset, saveCanvasState]);

  // 使用 useEffect 添加非被动的 wheel 事件监听器
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);
  
  const handleMouseDown = useCallback((e) => {
    // 中键（button === 1）按下时，无论鼠标在哪里都拖动画布
    if (e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      setCursorStyle('grabbing');
      return;
    }

    // 左键点击画布空白处，启动拖动画布并清除激活的节点
    if (e.button === 0 && (e.target === canvasRef.current || e.target.classList.contains('canvas'))) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      setCursorStyle('grabbing');
      setActiveNode(null);
    }
  }, [offset, setActiveNode]);
  
  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      // 使用 requestAnimationFrame 节流更新，提高性能
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        setOffset({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y
        });
      });
    }
  }, [isPanning, panStart, setOffset]);
  
  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      setCursorStyle('default');
      // 平移结束时保存状态
      setTimeout(() => {
        saveCanvasState();
      }, 100);
    }
  }, [isPanning, saveCanvasState]);

  // 允许右键菜单 - 右键拖动已在节点的 handleMouseDown 中被禁用
  const handleContextMenu = useCallback(() => {
    // 不阻止默认行为，允许显示系统右键菜单
    // 右键拖动节点的功能已在 Node 组件的 handleMouseDown 中被禁用（只允许左键 button === 0）
  }, []);
  
  const handleZoomIn = () => {
    setScale(scale + 0.2);
    setTimeout(() => saveCanvasState(), 100);
  };
  const handleZoomOut = () => {
    setScale(scale - 0.2);
    setTimeout(() => saveCanvasState(), 100);
  };
  const handleZoomReset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setTimeout(() => saveCanvasState(), 100);
  };

  const handleReorganize = () => {
    reorganizeLayout();
    setTimeout(() => saveCanvasState(), 100);
  };

  // 清理 requestAnimationFrame
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // 生成连接线（简化逻辑：只基于 parentNodeId）- 使用 useMemo 缓存结果
  const connections = useMemo(() => {
    const connections = [];

    // 创建节点映射，方便查找
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // 计算从选中节点到根节点的路径
    const ancestorPath = new Set();
    if (selectedNodeId) {
      let currentId = selectedNodeId;
      while (currentId) {
        ancestorPath.add(currentId);
        const currentNode = nodeMap.get(currentId);
        currentId = currentNode?.parentNodeId;
      }
    }

    // 辅助函数：获取节点尺寸（使用估算高度）
    const getNodeSize = (node) => {
      if (node.type === 'intent') {
        return node.expanded === false
          ? { width: 60, height: 60 }
          : { width: 600, height: 200 };
      }
      // 使用存储的估算高度，或默认120
      const height = node.estimatedHeight || 120;
      return { width: 600, height };
    };

    // 辅助函数：获取节点中心位置
    const getNodeCenter = (node) => {
      const size = getNodeSize(node);
      return { x: node.x + size.width / 2, y: node.y + size.height / 2 };
    };

    // 绘制连接线：使用节点中心位置
    const drawConnection = (startNode, endNode, key, isHighlighted) => {
      const startCenter = getNodeCenter(startNode);
      const endCenter = getNodeCenter(endNode);

      // 判断是否是分支连接（x坐标不同）
      const isBranch = Math.abs(startCenter.x - endCenter.x) > 50;

      let pathData;

      if (isBranch) {
        // 分支连接：使用更优雅的曲线
        const horizontalDistance = Math.abs(endCenter.x - startCenter.x);
        const verticalDistance = Math.abs(endCenter.y - startCenter.y);

        // 根据距离调整控制点
        const controlOffset = Math.min(horizontalDistance * 0.3, verticalDistance * 0.5, 100);

        let control1, control2;
        if (endCenter.x > startCenter.x) {
          // 向右分支
          control1 = { x: startCenter.x + controlOffset, y: startCenter.y };
          control2 = { x: endCenter.x - controlOffset, y: endCenter.y };
        } else {
          // 向左分支（不太常见，但保持对称）
          control1 = { x: startCenter.x - controlOffset, y: startCenter.y };
          control2 = { x: endCenter.x + controlOffset, y: endCenter.y };
        }

        pathData = `M ${startCenter.x} ${startCenter.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${endCenter.x} ${endCenter.y}`;
      } else {
        // 垂直连接：简单的垂直贝塞尔曲线，从中心到中心
        const distance = endCenter.y - startCenter.y;
        const control1 = { x: startCenter.x, y: startCenter.y + distance * 0.4 };
        const control2 = { x: endCenter.x, y: endCenter.y - distance * 0.4 };
        pathData = `M ${startCenter.x} ${startCenter.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${endCenter.x} ${endCenter.y}`;
      }

      return [
        <path
          key={key}
          d={pathData}
          stroke={isHighlighted ? "#3b82f6" : "#94a3b8"}
          strokeWidth={isHighlighted ? 3 : 2}
          fill="none"
          opacity={isHighlighted ? "1" : "0.5"}
          strokeDasharray={isHighlighted ? "0" : (isBranch ? "8,4" : "4,4")} // 激活时实线，非激活时虚线
          style={{ pointerEvents: 'none' }}
        />
      ];
    };

    // 记录已处理的连接
    const processedConnections = new Set();

    // 遍历所有节点（包括意图节点，因为需要追溯parentNodeId链）
    nodes.forEach(node => {
      // 跳过意图节点本身（不为其绘制连接）
      if (node.type === 'intent') return;

      if (!node.parentNodeId || !nodeMap.has(node.parentNodeId)) return;

      let parentNode = nodeMap.get(node.parentNodeId);

      // 如果父节点是意图节点，追溯到意图节点的父节点（用户节点）
      if (parentNode.type === 'intent') {
        if (parentNode.parentNodeId && nodeMap.has(parentNode.parentNodeId)) {
          parentNode = nodeMap.get(parentNode.parentNodeId);
        } else {
          // 意图节点没有父节点，跳过
          return;
        }
      }

      const connectionKey = `${parentNode.id}-${node.id}`;
      if (!processedConnections.has(connectionKey)) {
        processedConnections.add(connectionKey);
        const isHighlighted = ancestorPath.has(node.id) && ancestorPath.has(parentNode.id);
        connections.push(...drawConnection(parentNode, node, connectionKey, isHighlighted));
      }
    });

    return connections;
  }, [nodes, selectedNodeId]);
  
  return (
    <div
      className="canvas-container"
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={handleContextMenu}
      style={{ cursor: cursorStyle }}
    >
      <div 
        className="canvas"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
        }}
      >
        {/* 连接线 */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '5000px',
            height: '5000px',
            pointerEvents: 'none',
            zIndex: 1,
            overflow: 'visible'
          }}
        >
          {connections}
        </svg>
        
        {/* 节点 */}
        {nodes
          .filter(node => node.type !== 'intent') // 过滤掉意图节点，不再单独渲染
          .map(node => (
            <Node
              key={node.id}
              node={node}
              onClose={() => removeNode(node.id)}
              send={send}
            />
          ))}
      </div>
      
      <div className="zoom-controls">
        <button className="zoom-btn" onClick={handleZoomIn}>+</button>
        <button className="zoom-btn" onClick={handleZoomReset}>⟲</button>
        <button className="zoom-btn" onClick={handleZoomOut}>−</button>
      </div>

      <div className="reorganize-controls">
        <button className="reorganize-btn" onClick={handleReorganize} title="Reorganize layout">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <span>Reorganize</span>
        </button>
      </div>
    </div>
  );
}
