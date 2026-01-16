import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

// ========== 布局工具函数（共享） ==========
const LayoutUtils = {
  // 布局常量
  GRID_SIZE: 50,
  NODE_WIDTH: 600,
  MIN_NODE_HEIGHT: 120,
  VERTICAL_GAP_USER_TO_AI: 24, // 用户消息到AI回复的间距
  VERTICAL_GAP_AI_TO_USER: 128, // AI回复到用户消息的间距
  VERTICAL_GAP: 48, // 默认间距（其他情况）
  INTENT_EXPANDED_HEIGHT: 200, // 意图节点展开后的高度
  INTENT_RESERVED_SPACE: 248, // 为意图节点预留的空间（展开高度200 + 间距48）
  BRANCH_HORIZONTAL_SPACING: 120,

  // 对齐到网格（x坐标用网格，y坐标不用网格以保持精确间距）
  snapToGrid(value, useGrid = true) {
    if (!useGrid) return value;
    return Math.round(value / this.GRID_SIZE) * this.GRID_SIZE;
  },

  // x坐标对齐到网格
  snapXToGrid(x) {
    return this.snapToGrid(x, true);
  },

  // y坐标不使用网格对齐，保持精确间距
  snapYToGrid(y) {
    return y;
  },

  // 计算两个节点之间的间距（根据节点类型）
  getGapBetweenNodes(parentNode, childNode) {
    // 跳过意图节点
    if (parentNode.type === 'intent' || childNode.type === 'intent') {
      return this.VERTICAL_GAP;
    }

    // 判断父节点是否是用户消息
    const parentIsUser = parentNode.type === 'chat' && parentNode.title === 'User';
    // 判断子节点是否是用户消息
    const childIsUser = childNode.type === 'chat' && childNode.title === 'User';

    // 判断是否是AI回复或任务
    const parentIsAI = parentNode.type === 'chat' && parentNode.title !== 'User';
    const parentIsTask = parentNode.type === 'task';
    const childIsAI = childNode.type === 'chat' && childNode.title !== 'User';
    const childIsTask = childNode.type === 'task';

    // 用户消息 → AI回复/任务
    if (parentIsUser && (childIsAI || childIsTask)) {
      return this.VERTICAL_GAP_USER_TO_AI;
    }

    // AI回复/任务 → 用户消息
    if ((parentIsAI || parentIsTask) && childIsUser) {
      return this.VERTICAL_GAP_AI_TO_USER;
    }

    // 其他情况：默认间距
    return this.VERTICAL_GAP;
  },

  // 检查节点是否可见（收起的意图节点不可见）
  isNodeVisible(node) {
    if (node.type === 'intent' && node.expanded === false) {
      return false;
    }
    return true;
  },

  // 根据内容估算节点高度（不使用缓存的estimatedHeight，每次重新计算）
  estimateNodeHeight(node) {
    // 收起的意图节点不渲染，高度为0
    if (node.type === 'intent' && node.expanded === false) {
      return 0;
    }
    // 展开的意图节点
    if (node.type === 'intent') {
      return 200;
    }
    
    const content = node.content || '';
    if (!content) return this.MIN_NODE_HEIGHT;
    
    const headerHeight = 40;
    const padding = 32;
    const lineHeight = 24;
    const charsPerLine = 45; // 每行约45个字符（考虑中文字符宽度）
    
    const lines = content.split('\n');
    let totalLines = 0;
    for (const line of lines) {
      // 中文字符算2个字符宽度
      const charCount = line.split('').reduce((count, char) => {
        return count + (/[\u4e00-\u9fa5]/.test(char) ? 2 : 1);
      }, 0);
      totalLines += Math.max(1, Math.ceil(charCount / charsPerLine));
    }
    
    const codeBlockCount = (content.match(/```/g) || []).length / 2;
    const codeBlockExtra = codeBlockCount * 60;
    
    const estimatedHeight = headerHeight + padding + (totalLines * lineHeight) + codeBlockExtra;
    return Math.max(this.MIN_NODE_HEIGHT, Math.min(estimatedHeight, 400));
  },

  // 计算节点的底部y坐标
  getNodeBottom(node) {
    const height = this.estimateNodeHeight(node);
    return node.y + height;
  },

  // ========== 碰撞检测相关函数 ==========

  /**
   * 检测两个矩形是否重叠（考虑间距）
   * @param {Object} rect1 - {x, y, width, height}
   * @param {Object} rect2 - {x, y, width, height}
   * @param {number} margin - 最小间距（默认为 VERTICAL_GAP）
   * @returns {boolean} - 是否重叠
   */
  isRectOverlapping(rect1, rect2, margin = this.VERTICAL_GAP) {
    // 收起的意图节点不参与碰撞检测
    if (rect1.height === 0 || rect2.height === 0) {
      return false;
    }

    // 水平方向检测
    const horizontalOverlap = !(
      rect1.x + rect1.width + margin <= rect2.x ||
      rect2.x + rect2.width + margin <= rect1.x
    );

    // 垂直方向检测
    const verticalOverlap = !(
      rect1.y + rect1.height + margin <= rect2.y ||
      rect2.y + rect2.height + margin <= rect1.y
    );

    return horizontalOverlap && verticalOverlap;
  },

  /**
   * 获取节点的矩形区域
   * @param {Object} node - 节点对象
   * @returns {Object} - {x, y, width, height}
   */
  getNodeRect(node) {
    const height = this.estimateNodeHeight(node);
    return {
      x: node.x,
      y: node.y,
      width: this.NODE_WIDTH,
      height: height
    };
  },

  /**
   * 检测特定位置是否与现有节点冲突
   * @param {number} x - 目标x坐标
   * @param {number} y - 目标y坐标
   * @param {number} width - 目标宽度
   * @param {number} height - 目标高度
   * @param {Array} existingNodes - 已存在的节点数组
   * @param {Set} excludeNodeIds - 要排除的节点ID（例如自身）
   * @returns {boolean} - 是否有冲突
   */
  hasCollision(x, y, width, height, existingNodes, excludeNodeIds = new Set()) {
    const testRect = { x, y, width, height };

    for (const node of existingNodes) {
      // 跳过要排除的节点
      if (excludeNodeIds.has(node.id)) continue;

      // 跳过不可见的节点（收起的意图节点）
      if (!this.isNodeVisible(node)) continue;

      const nodeRect = this.getNodeRect(node);
      if (this.isRectOverlapping(testRect, nodeRect)) {
        return true;
      }
    }

    return false;
  },

  /**
   * 查找列中所有节点的最大底部y坐标
   * @param {number} columnX - 列的x坐标
   * @param {Array} existingNodes - 已存在的节点数组
   * @param {number} tolerance - x坐标的容差（默认25px）
   * @returns {number} - 该列的最大底部y坐标，如果列为空则返回0
   */
  getColumnMaxBottom(columnX, existingNodes, tolerance = 25) {
    let maxBottom = 0;

    for (const node of existingNodes) {
      // 检查节点是否在该列（考虑容差）
      if (Math.abs(node.x - columnX) <= tolerance) {
        // 跳过不可见的节点
        if (!this.isNodeVisible(node)) continue;

        const bottom = this.getNodeBottom(node);
        maxBottom = Math.max(maxBottom, bottom);
      }
    }

    return maxBottom;
  },

  /**
   * 从起始位置向下寻找第一个无碰撞位置
   * @param {number} startX - 起始x坐标
   * @param {number} startY - 起始y坐标
   * @param {number} width - 节点宽度
   * @param {number} height - 节点高度
   * @param {Array} existingNodes - 已存在的节点数组
   * @param {Set} excludeNodeIds - 要排除的节点ID
   * @returns {Object} - {x, y} 无碰撞的位置
   */
  findAvailablePosition(startX, startY, width, height, existingNodes, excludeNodeIds = new Set()) {
    let testY = startY; // y坐标不使用网格对齐
    const maxAttempts = 100; // 防止无限循环
    let attempts = 0;

    while (attempts < maxAttempts) {
      if (!this.hasCollision(startX, testY, width, height, existingNodes, excludeNodeIds)) {
        return { x: startX, y: testY };
      }

      // 向下移动一个间距单位
      testY += this.VERTICAL_GAP;
      attempts++;
    }

    // 降级策略：找不到位置时返回最后测试位置并输出警告
    console.warn('无法找到无碰撞位置，使用降级策略');
    return { x: startX, y: testY };
  }
};

export const useStore = create((set, get) => ({
  // 连接状态
  connected: false,
  clientId: null,

  // 会话
  sessionId: null,
  userId: 'default',

  // 画布状态
  nodes: [],
  scale: 1,
  offset: { x: 0, y: 0 },

  // 任务
  tasks: [],

  // 环境事件
  events: [],

  // 订阅
  subscriptions: [],

  // 全局状态（兼容旧代码，逐步废弃）
  status: { stage: 'idle', message: '' },

  // 并发状态管理（新架构）
  streamingNodes: new Set(),  // 多个节点同时流式传输
  messageStatuses: new Map(),  // Map<messageId, {stage, message, timestamp}>
  activeProcessing: new Set(),  // 正在处理的消息ID集合
  stats: {
    totalProcessing: 0,
    totalStreaming: 0,
  },

  // 激活的节点（用于控制滚轮行为）
  activeNodeId: null,

  // 选中的节点（用于创建分支）
  selectedNodeId: null,

  // 获取节点的编号映射表（根据时间戳排序）
  getNodeNumberMap: () => {
    const state = get();
    const sortedNodes = [...state.nodes].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const numberMap = {};
    sortedNodes.forEach((node, index) => {
      numberMap[node.id] = index + 1; // 编号从1开始
    });
    return numberMap;
  },

  // 获取指定节点的编号
  getNodeNumber: (nodeId) => {
    const numberMap = get().getNodeNumberMap();
    return numberMap[nodeId] || null;
  },

  // Actions
  setConnected: (connected, clientId) => set({ connected, clientId }),
  
  setSession: (sessionId) => set({ sessionId }),
  
  setStatus: (status) => set({ status }),
  
  // 加载历史节点
  loadHistoryNodes: async (sessionId) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/nodes`);
      if (response.ok) {
        const historyNodes = await response.json();
        // 设置节点
        set({ nodes: historyNodes });
        
        // 尝试加载画布状态（缩放和偏移）
        try {
          const canvasResponse = await fetch(`/api/sessions/${sessionId}/canvas`);
          if (canvasResponse.ok) {
            const canvasData = await canvasResponse.json();
            if (canvasData.scale !== undefined) {
              set({ scale: canvasData.scale });
            }
            if (canvasData.offset) {
              set({ offset: canvasData.offset });
            }
          }
        } catch (_) {
          // 忽略画布状态加载错误
        }
      }
    } catch (_) {
      // 忽略节点加载错误
    }
  },
  
  // 节点管理 - 添加新节点
  addNode: (node) => set((state) => {
    const { NODE_WIDTH, VERTICAL_GAP, BRANCH_HORIZONTAL_SPACING, INTENT_RESERVED_SPACE } = LayoutUtils;

    // 计算某个节点及其子树占用的最大x坐标
    const getSubtreeRightBoundary = (nodeId) => {
      const n = state.nodes.find(nd => nd.id === nodeId);
      if (!n) return 0;
      let maxX = n.x + NODE_WIDTH;
      const children = state.nodes.filter(nd => nd.parentNodeId === nodeId);
      for (const child of children) {
        maxX = Math.max(maxX, getSubtreeRightBoundary(child.id));
      }
      return maxX;
    };

    // 向上查找最近的可见祖先节点
    const findNearestVisibleAncestor = (nodeId) => {
      let current = state.nodes.find(n => n.id === nodeId);
      while (current) {
        if (LayoutUtils.isNodeVisible(current)) {
          return current;
        }
        if (current.parentNodeId) {
          current = state.nodes.find(n => n.id === current.parentNodeId);
        } else {
          break;
        }
      }
      return null;
    };

    // 计算新节点位置
    const calculatePosition = () => {
      const { parentNodeId, type } = node;

      // 没有父节点：第一个节点或新话题的根节点
      if (!parentNodeId) {
        // 非对话类型节点（如环境事件）放在左侧
        if (type !== 'chat' && type !== 'task' && type !== 'intent') {
          return { x: LayoutUtils.snapXToGrid(-200), y: 100 };
        }
        
        // 如果画布上没有任何节点，放在默认位置
        if (state.nodes.length === 0) {
          return { x: LayoutUtils.snapXToGrid(100), y: 100 };
        }
        
        // 新话题：计算所有现有节点的最右边界，将新节点放在最右方
        let maxRightX = 0;
        for (const existingNode of state.nodes) {
          // 只考虑可见节点
          if (!LayoutUtils.isNodeVisible(existingNode)) continue;
          const nodeRight = existingNode.x + NODE_WIDTH;
          maxRightX = Math.max(maxRightX, nodeRight);
        }
        
        // 新话题放在最右边界 + 分支间距的位置，y坐标与画布顶端对齐（100）
        const newX = LayoutUtils.snapXToGrid(maxRightX + BRANCH_HORIZONTAL_SPACING);
        return { x: newX, y: 100 };
      }

      const parentNode = state.nodes.find(n => n.id === parentNodeId);
      if (!parentNode) {
        return { x: LayoutUtils.snapXToGrid(100), y: 100 };
      }

      // **关键修改**：如果父节点是意图节点，需要特殊处理
      // 将所有以该意图节点为父的AI回复节点视为兄弟节点
      // 并基于意图节点的父节点（用户节点）来计算位置
      let effectiveParentId = parentNodeId;
      let effectiveParentNode = parentNode;

      if (parentNode.type === 'intent') {
        // 找到意图节点的父节点（用户节点）作为实际参考
        if (parentNode.parentNodeId) {
          const userNode = state.nodes.find(n => n.id === parentNode.parentNodeId);
          if (userNode) {
            effectiveParentNode = userNode;
            // 注意：effectiveParentId仍然是意图节点ID，用于查找兄弟节点
          }
        }
      }

      // 检查是否是分支的第一个节点（父节点已经有其他子节点）
      const existingSiblings = state.nodes.filter(n => n.parentNodeId === effectiveParentId);
      const isFirstBranchNode = existingSiblings.length > 0;

      // 找到最近的可见祖先节点作为参考
      const visibleAncestor = findNearestVisibleAncestor(effectiveParentNode.id);
      const referenceNode = visibleAncestor || effectiveParentNode;

      let x, y;

      if (isFirstBranchNode) {
        // 这是分支的第一个节点：放在右侧
        // 计算所有已存在兄弟节点子树的最右边界
        let maxRightX = referenceNode.x + NODE_WIDTH;
        for (const sibling of existingSiblings) {
          const siblingRight = getSubtreeRightBoundary(sibling.id);
          maxRightX = Math.max(maxRightX, siblingRight);
        }
        x = LayoutUtils.snapXToGrid(maxRightX + BRANCH_HORIZONTAL_SPACING);
        y = referenceNode.y; // y坐标不使用网格对齐

        // ========== 碰撞检测 ==========
        // 计算新节点高度用于碰撞检测
        const newNodeHeight = LayoutUtils.estimateNodeHeight({
          ...node,
          type,
          content: node.content || '',
          expanded: type === 'intent' ? false : true
        });

        // 检查是否有碰撞
        if (LayoutUtils.hasCollision(x, y, NODE_WIDTH, newNodeHeight, state.nodes, new Set())) {
          // 找到该列的最大底部位置
          const columnBottom = LayoutUtils.getColumnMaxBottom(x, state.nodes);
          const suggestedY = columnBottom > 0
            ? columnBottom + VERTICAL_GAP
            : y;

          // 从建议位置开始向下寻找可用位置
          const availablePos = LayoutUtils.findAvailablePosition(
            x,
            suggestedY,
            NODE_WIDTH,
            newNodeHeight,
            state.nodes,
            new Set()
          );
          y = availablePos.y;
        }
        // ========== 碰撞检测结束 ==========
      } else {
        // 不是分支的第一个节点：直接继承参考节点的 x 坐标
        // 这样可以确保分支中的所有后续节点都在同一列
        x = LayoutUtils.snapXToGrid(referenceNode.x);

        // 新节点是否可见
        const newNodeVisible = type !== 'intent';

        // 检查原始父节点是否是意图节点
        const parentIsIntent = parentNode.type === 'intent';

        if (newNodeVisible) {
          if (parentIsIntent) {
            // 父节点是意图节点：根据意图节点是否展开决定预留空间
            // 注意：这里使用effectiveParentNode（用户节点）来计算底部位置
            const referenceBottom = LayoutUtils.getNodeBottom(effectiveParentNode);
            // 计算用户消息到AI回复的间距（意图节点收起时从用户消息到AI回复）
            // 使用effectiveParentNode（用户节点）和当前节点来计算间距
            const gap = LayoutUtils.getGapBetweenNodes(effectiveParentNode, { ...node, type });
            if (parentNode.expanded) {
              // 意图节点展开：预留展开高度 + 上下间距
              y = referenceBottom + gap + INTENT_EXPANDED_HEIGHT + gap;
            } else {
              // 意图节点收起：只预留基本间距（从用户消息直接到AI回复）
              y = referenceBottom + gap;
            }
          } else {
            // 普通情况：放在参考节点底部 + 间距
            const referenceBottom = LayoutUtils.getNodeBottom(referenceNode);
            const gap = LayoutUtils.getGapBetweenNodes(referenceNode, { ...node, type });
            y = referenceBottom + gap;
          }
        } else {
          // 不可见节点（收起的意图节点）：放在参考节点底部
          y = LayoutUtils.getNodeBottom(referenceNode);
        }
      }

      return { x, y };
    };

    const finalPosition = calculatePosition();
    const newNodeHeight = LayoutUtils.estimateNodeHeight({
      ...node,
      expanded: node.type === 'intent' ? false : true
    });

    const newNode = {
      id: node.id || uuidv4(),
      x: finalPosition.x,
      y: finalPosition.y,
      timestamp: Date.now(),
      expanded: node.type === 'intent' ? false : true,
      estimatedHeight: newNodeHeight,
      ...node
    };

    // 添加节点到状态
    const newState = {
      nodes: [...state.nodes, newNode]
    };

    const currentSessionId = state.sessionId;

    // 立即同步保存画布状态
    // 优化：只保存必要的节点字段，减少数据量，排除 context 字段
    const optimizedNodes = newState.nodes.map(node => ({
      id: node.id,
      type: node.type,
      title: node.title,
      content: node.content,
      timestamp: node.timestamp,
      parentNodeId: node.parentNodeId,
      x: node.x,
      y: node.y,
      expanded: node.expanded,
      estimatedHeight: node.estimatedHeight,
      messageId: node.messageId,
      intentId: node.intentId,
      relatedMessageId: node.relatedMessageId,
      editHistory: node.editHistory,
      // context 字段太大，不保存
      intent: node.intent,
      topic: node.topic,
      urgency: node.urgency,
      relatedTopics: node.relatedTopics
    }));
    
    if (currentSessionId) {
      // 使用 Promise 但不等待，确保保存请求被发送
      fetch(`/api/sessions/${currentSessionId}/canvas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: optimizedNodes,
          scale: state.scale,
          offset: state.offset
        })
      }).then(response => {
        if (!response.ok) {
          console.error('addNode 保存失败:', response.status);
        } else {
          console.info(`addNode 保存成功: ${optimizedNodes.length} 个节点`);
        }
      }).catch(err => {
        console.error('addNode 保存错误:', err);
      });
    } else {
      console.warn('addNode: sessionId 为空，跳过保存');
    }

    // 延迟处理：聚焦
    setTimeout(() => {
      const currentState = get();
      // 只对可见节点进行聚焦
      if (LayoutUtils.isNodeVisible(newNode)) {
        currentState.centerOnNode(newNode.id, true);
      }
    }, 100);

    return newState;
  }),
  
  updateNode: (id, updates) => set((state) => ({
    nodes: state.nodes.map(n => n.id === id ? { ...n, ...updates } : n)
  })),
  
  moveNode: (id, x, y) => set((state) => ({
    nodes: state.nodes.map(n => n.id === id ? { ...n, x, y } : n)
  })),

  // 一键整理布局：重新计算所有节点位置
  reorganizeLayout: () => set((state) => {
    const { NODE_WIDTH, VERTICAL_GAP, BRANCH_HORIZONTAL_SPACING, INTENT_RESERVED_SPACE } = LayoutUtils;

    // 位置映射表：nodeId -> { x, y }
    const positionMap = new Map();
    const processedNodes = new Set();

    // ========== 新增：跟踪已分配的节点矩形 ==========
    const allocatedRects = [];

    /**
     * 记录节点占用的空间
     */
    const recordAllocatedSpace = (nodeId, x, y) => {
      const node = state.nodes.find(n => n.id === nodeId);
      if (!node || !LayoutUtils.isNodeVisible(node)) return;

      const height = LayoutUtils.estimateNodeHeight(node);
      allocatedRects.push({
        nodeId,
        x,
        y,
        width: NODE_WIDTH,
        height
      });
    };

    /**
     * 检查位置是否与已分配空间冲突
     */
    const hasCollisionWithAllocated = (x, y, width, height, excludeNodeId = null) => {
      const testRect = { x, y, width, height };

      for (const rect of allocatedRects) {
        if (rect.nodeId === excludeNodeId) continue;
        if (rect.height === 0) continue;

        if (LayoutUtils.isRectOverlapping(testRect, rect)) {
          return true;
        }
      }

      return false;
    };
    // ========== 新增结束 ==========

    // 获取子节点（按时间戳排序）
    const getChildrenSorted = (parentId) => {
      return state.nodes
        .filter(n => n.parentNodeId === parentId)
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    };

    // 计算子树的最大x坐标
    const getSubtreeRightBoundary = (nodeId) => {
      const pos = positionMap.get(nodeId);
      const node = state.nodes.find(n => n.id === nodeId);
      if (!pos || !node) return 0;
      
      let maxX = LayoutUtils.isNodeVisible(node) ? pos.x + NODE_WIDTH : pos.x;
      const children = getChildrenSorted(nodeId);
      for (const child of children) {
        maxX = Math.max(maxX, getSubtreeRightBoundary(child.id));
      }
      return maxX;
    };

    // 递归处理节点及其子树
    // 参数：
    //   node: 当前节点
    //   columnX: 当前列的x坐标
    //   availableY: 可用的起始y坐标（上一个可见节点的底部 + 间距）
    // 返回：该子树占用的最大底部y坐标
    const processNode = (node, columnX, availableY) => {
      if (processedNodes.has(node.id)) {
        const pos = positionMap.get(node.id);
        if (pos) {
          const height = LayoutUtils.estimateNodeHeight(node);
          return LayoutUtils.isNodeVisible(node) ? pos.y + height : availableY;
        }
        return availableY;
      }
      processedNodes.add(node.id);

      const isVisible = LayoutUtils.isNodeVisible(node);
      const isIntent = node.type === 'intent';
      const height = LayoutUtils.estimateNodeHeight(node);

      // 计算当前节点位置
      const x = LayoutUtils.snapXToGrid(columnX);
      const y = availableY; // y坐标不使用网格对齐，保持精确间距

      positionMap.set(node.id, { x, y });

      // ========== 新增：记录节点占用空间 ==========
      recordAllocatedSpace(node.id, x, y);
      // ========== 新增结束 ==========

      // 获取子节点
      const children = getChildrenSorted(node.id);
      
      if (children.length === 0) {
        // 叶子节点：返回底部位置
        return isVisible ? y + height : availableY;
      }

      // 计算下一个节点的可用y坐标
      let nextAvailableY;
      if (isIntent) {
        // 意图节点：根据是否展开决定预留空间
        if (node.expanded) {
          // 展开状态：预留展开高度 + 下方间距（使用默认间距）
          nextAvailableY = y + INTENT_EXPANDED_HEIGHT + VERTICAL_GAP;
        } else {
          // 收起状态：不预留空间，直接从当前位置开始
          nextAvailableY = y;
        }
      } else if (isVisible) {
        // 其他可见节点：从当前节点底部 + 间距开始
        // 需要根据下一个子节点的类型决定间距
        const children = getChildrenSorted(node.id);
        const firstChild = children[0];
        let gap = VERTICAL_GAP; // 默认间距
        if (firstChild) {
          gap = LayoutUtils.getGapBetweenNodes(node, firstChild);
        }
        nextAvailableY = y + height + gap;
      } else {
        // 不可见节点：从当前可用位置开始
        nextAvailableY = availableY;
      }

      // 处理主链（第一个子节点）
      const mainChild = children[0];
      let maxBottomY = processNode(mainChild, columnX, nextAvailableY);

      // 处理分支（其他子节点）
      for (let i = 1; i < children.length; i++) {
        const branchChild = children[i];
        // 分支的x坐标：当前子树最右边界 + 间距
        const rightBoundary = getSubtreeRightBoundary(node.id);
        const branchX = Math.max(rightBoundary + BRANCH_HORIZONTAL_SPACING, columnX + BRANCH_HORIZONTAL_SPACING);
        // 分支的初始y坐标
        let branchStartY = isVisible ? y : availableY;

        // ========== 新增：碰撞检测 ==========
        const branchHeight = LayoutUtils.estimateNodeHeight(branchChild);

        // 检查是否有碰撞
        if (hasCollisionWithAllocated(branchX, branchStartY, NODE_WIDTH, branchHeight)) {
          // 找到该列的最大底部位置
          const columnBottom = LayoutUtils.getColumnMaxBottom(branchX,
            allocatedRects.map(r => ({
              id: r.nodeId,
              x: r.x,
              y: r.y,
              estimatedHeight: r.height
            }))
          );

          branchStartY = columnBottom > 0
            ? columnBottom + VERTICAL_GAP  // y坐标不使用网格对齐
            : branchStartY;
        }
        // ========== 碰撞检测结束 ==========

        const branchBottomY = processNode(branchChild, branchX, branchStartY);
        maxBottomY = Math.max(maxBottomY, branchBottomY);
      }

      return maxBottomY;
    };

    // 找到所有根节点（没有父节点，或父节点不存在）
    let rootNodes = state.nodes.filter(n => {
      if (!n.parentNodeId) return true;
      return !state.nodes.some(pn => pn.id === n.parentNodeId);
    });

    // 按时间戳排序根节点
    rootNodes = rootNodes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    if (rootNodes.length === 0) {
      // 如果没有根节点，尝试找第一个用户消息
      const userNodes = state.nodes
        .filter(n => n.type === 'chat' && n.title === 'User')
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      if (userNodes.length > 0) {
        rootNodes = [userNodes[0]];
      } else {
        return { nodes: state.nodes };
      }
    }

    // 处理所有对话树
    let currentX = 100;
    const startY = 100;
    
    for (const rootNode of rootNodes) {
      processNode(rootNode, currentX, startY);
      const treeRight = getSubtreeRightBoundary(rootNode.id);
      currentX = treeRight + BRANCH_HORIZONTAL_SPACING;
    }

    // 更新所有节点位置
    const updatedNodes = state.nodes.map(node => {
      const newPos = positionMap.get(node.id);
      if (newPos) {
        return { 
          ...node, 
          x: newPos.x, 
          y: newPos.y,
          estimatedHeight: LayoutUtils.estimateNodeHeight(node)
        };
      }
      return node;
    });

    return { nodes: updatedNodes };
  }),

  // 保存画布状态到后端
  saveCanvasState: async () => {
    const state = get();
    if (!state.sessionId) {
      console.warn('saveCanvasState: sessionId 为空，跳过保存');
      return;
    }
    
    // 优化：只保存必要的节点字段，减少数据量
    // 排除 context 字段（包含大量消息历史，不需要持久化）
    const optimizedNodes = state.nodes.map(node => ({
      id: node.id,
      type: node.type,
      title: node.title,
      content: node.content,
      timestamp: node.timestamp,
      parentNodeId: node.parentNodeId,
      x: node.x,
      y: node.y,
      expanded: node.expanded,
      estimatedHeight: node.estimatedHeight,
      // 保留其他必要字段
      messageId: node.messageId,
      intentId: node.intentId,
      relatedMessageId: node.relatedMessageId,
      editHistory: node.editHistory,
      // context 字段太大，不保存（可以从后端重新获取）
      // 意图相关字段
      intent: node.intent,
      topic: node.topic,
      urgency: node.urgency,
      relatedTopics: node.relatedTopics,
      confidence: node.confidence
    }));
    
    try {
      const response = await fetch(`/api/sessions/${state.sessionId}/canvas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: optimizedNodes,
          scale: state.scale,
          offset: state.offset
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('saveCanvasState: 保存失败', response.status, errorText);
      }
    } catch (err) {
      console.error('saveCanvasState: 网络错误', err);
    }
  },
  
  // 删除节点及其所有后代节点（不影响父节点或祖先节点）
  removeNode: (id) => {
    const state = get();
    const nodesToDelete = new Set();

    // 递归查找所有子节点
    const findAllChildren = (nodeId) => {
      nodesToDelete.add(nodeId);
      const children = state.nodes.filter(n => n.parentNodeId === nodeId);
      children.forEach(child => findAllChildren(child.id));
    };

    // 查找要删除的节点
    const nodeToDelete = state.nodes.find(n => n.id === id);
    if (!nodeToDelete) return;

    // 查找所有子节点
    findAllChildren(id);

    // 删除所有节点
    set({
      nodes: state.nodes.filter(n => !nodesToDelete.has(n.id))
    });

    // 如果删除的是选中节点，清除选中状态
    if (nodesToDelete.has(state.selectedNodeId)) {
      set({ selectedNodeId: null });
    }

    // 如果删除的是激活节点，清除激活状态
    if (nodesToDelete.has(state.activeNodeId)) {
      set({ activeNodeId: null });
    }

    // 调用后端API删除节点
    const sessionId = state.sessionId;
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}/nodes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeIds: Array.from(nodesToDelete) })
      }).catch(err => {});
    }
  },
  
  // 流式响应（新架构 - 支持并发）
  addStreamingNode: (nodeId) => set((state) => {
    const newSet = new Set(state.streamingNodes);
    newSet.add(nodeId);
    return {
      streamingNodes: newSet,
      stats: { ...state.stats, totalStreaming: newSet.size }
    };
  }),

  removeStreamingNode: (nodeId) => set((state) => {
    const newSet = new Set(state.streamingNodes);
    newSet.delete(nodeId);
    return {
      streamingNodes: newSet,
      stats: { ...state.stats, totalStreaming: newSet.size }
    };
  }),

  // 兼容旧代码（废弃，使用addStreamingNode/removeStreamingNode）
  startStreaming: (nodeId) => {
    const addStreamingNode = get().addStreamingNode;
    addStreamingNode(nodeId);
  },

  endStreaming: () => {
    // 清空所有流式节点（旧行为）
    set({ streamingNodes: new Set(), stats: { ...get().stats, totalStreaming: 0 } });
  },

  // 消息状态管理
  setMessageStatus: (messageId, status) => set((state) => {
    const newStatuses = new Map(state.messageStatuses);
    newStatuses.set(messageId, { ...status, timestamp: Date.now() });
    return { messageStatuses: newStatuses };
  }),

  removeMessageStatus: (messageId) => set((state) => {
    const newStatuses = new Map(state.messageStatuses);
    newStatuses.delete(messageId);
    return { messageStatuses: newStatuses };
  }),

  // 活跃处理追踪
  addActiveProcessing: (messageId) => set((state) => {
    const newSet = new Set(state.activeProcessing);
    newSet.add(messageId);
    return {
      activeProcessing: newSet,
      stats: { ...state.stats, totalProcessing: newSet.size }
    };
  }),

  removeActiveProcessing: (messageId) => set((state) => {
    const newSet = new Set(state.activeProcessing);
    newSet.delete(messageId);
    return {
      activeProcessing: newSet,
      stats: { ...state.stats, totalProcessing: newSet.size }
    };
  }),

  appendToNode: (nodeId, chunk) => set((state) => {
    return {
      nodes: state.nodes.map(n => {
        if (n.id === nodeId) {
          const newContent = (n.content || '') + chunk;
          const updatedNode = { ...n, content: newContent };
          return {
            ...updatedNode,
            estimatedHeight: LayoutUtils.estimateNodeHeight(updatedNode)
          };
        }
        return n;
      })
    };
  }),
  
  // 任务管理
  addTask: (task) => set((state) => {
    const exists = state.tasks.some(t => t.id === task.id);
    if (!exists) {
      return { tasks: [...state.tasks, task] };
    }
    return {
      tasks: state.tasks.map(t => t.id === task.id ? { ...t, ...task } : t)
    };
  }),
  
  updateTask: (id, updates) => set((state) => ({
    tasks: state.tasks.map(t => t.id === id ? { ...t, ...updates } : t)
  })),
  
  // 事件管理
  addEvent: (event) => set((state) => ({
    events: [event, ...state.events].slice(0, 50)
  })),
  
  // 订阅管理
  addSubscription: (sub) => set((state) => ({
    subscriptions: [...state.subscriptions, sub]
  })),
  
  removeSubscription: (id) => set((state) => ({
    subscriptions: state.subscriptions.filter(s => s.id !== id)
  })),
  
  // 画布控制
  setScale: (scale) => set({ scale: Math.max(0.25, Math.min(2, scale)) }),

  setOffset: (offset) => set({ offset }),

  // 将画布中心移动到指定节点（带平滑动画）
  centerOnNode: (nodeId, smooth = true) => {
    const state = get();
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // 获取节点尺寸
    let nodeWidth, nodeHeight;
    if (node.type === 'intent') {
      if (node.expanded) {
        nodeWidth = 600;
        nodeHeight = 200;
      } else {
        nodeWidth = 60;
        nodeHeight = 60;
      }
    } else if (node.type === 'chat' || node.type === 'task') {
      nodeWidth = 600;
      nodeHeight = LayoutUtils.estimateNodeHeight(node);
    } else {
      nodeWidth = 600;
      nodeHeight = 100;
    }

    // 计算节点在世界坐标系中的中心
    const nodeCenterX = node.x + nodeWidth / 2;
    const nodeCenterY = node.y + nodeHeight / 2;

    // 获取视口尺寸
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportCenterX = viewportWidth / 2;
    const viewportCenterY = viewportHeight / 2;

    // 计算所需的offset使节点中心对齐到视口中心
    // 公式: viewportCenter = offset + nodeCenter * scale
    // 所以: offset = viewportCenter - nodeCenter * scale
    const newOffsetX = viewportCenterX - nodeCenterX * state.scale;
    const newOffsetY = viewportCenterY - nodeCenterY * state.scale;

    if (smooth) {
      // 平滑动画
      const currentOffset = state.offset;
      const duration = 800; // 动画持续时间
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // 使用easeInOutCubic缓动函数
        const easeInOutCubic = (t) => {
          return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        };
        
        const easedProgress = easeInOutCubic(progress);
        
        const currentX = currentOffset.x + (newOffsetX - currentOffset.x) * easedProgress;
        const currentY = currentOffset.y + (newOffsetY - currentOffset.y) * easedProgress;
        
        set({ offset: { x: currentX, y: currentY } });
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // 动画完成后保存状态
          setTimeout(() => {
            get().saveCanvasState();
          }, 100);
        }
      };
      
      requestAnimationFrame(animate);
    } else {
      // 立即移动
      set({ offset: { x: newOffsetX, y: newOffsetY } });
      
      // 保存画布状态
      setTimeout(() => {
        get().saveCanvasState();
      }, 100);
    }
  },

  // 节点激活控制
  setActiveNode: (nodeId) => set({ activeNodeId: nodeId }),

  // 选中节点（用于创建分支）
  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),

  // 切换节点展开/收起状态
  toggleNodeExpanded: (nodeId) => set((state) => ({
    nodes: state.nodes.map(n =>
      n.id === nodeId ? { ...n, expanded: !n.expanded } : n
    )
  })),

  // 动态调整节点位置（当节点高度变化时）
  adjustNodePositions: (changedNodeId) => set((state) => {
    const { VERTICAL_GAP, INTENT_EXPANDED_HEIGHT } = LayoutUtils;
    const changedNode = state.nodes.find(n => n.id === changedNodeId);
    if (!changedNode) return { nodes: state.nodes };

    const updatedNodes = [...state.nodes];
    const nodeMap = new Map(updatedNodes.map(n => [n.id, n]));

    // 找到需要调整位置的起始节点
    // 如果变化的节点是用户消息，需要调整其意图节点和AI回复
    // 如果变化的节点是AI回复，需要调整其后续节点
    let adjustFromNode = changedNode;

    // 如果是用户消息节点，找到其意图节点作为调整起点
    if (changedNode.type === 'chat' && changedNode.title === 'User') {
      const intentNode = updatedNodes.find(n => n.type === 'intent' && n.parentNodeId === changedNodeId);
      if (intentNode) {
        adjustFromNode = changedNode; // 从用户消息开始调整
      }
    }

    // 递归调整节点及其后续节点的位置
    const adjustFollowingNodes = (nodeId) => {
      const node = nodeMap.get(nodeId);
      if (!node) return;

      // 找到该节点的直接子节点（包括意图节点）
      let children = updatedNodes
        .filter(n => n.parentNodeId === nodeId)
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      if (children.length === 0) return;

      // 计算子节点的起始位置
      const nodeBottom = LayoutUtils.getNodeBottom(node);
      let nextY;

      // 检查当前节点是否是意图节点
      if (node.type === 'intent') {
        if (node.expanded) {
          nextY = node.y + INTENT_EXPANDED_HEIGHT + VERTICAL_GAP;
        } else {
          nextY = node.y;
        }
      } else {
        // 计算到第一个子节点的间距
        const firstChild = children[0];
        let gap = VERTICAL_GAP; // 默认间距
        if (firstChild) {
          gap = LayoutUtils.getGapBetweenNodes(node, firstChild);
        }
        nextY = nodeBottom + gap;
      }

      // 分离意图节点和其他节点
      const intentChildren = children.filter(n => n.type === 'intent');
      const otherChildren = children.filter(n => n.type !== 'intent');

      // 先调整意图节点（如果有）
      if (intentChildren.length > 0) {
        const intentNode = intentChildren[0];
        const intentNodeObj = nodeMap.get(intentNode.id);
        if (intentNodeObj) {
          // 计算用户消息到意图节点的间距
          const gap = LayoutUtils.getGapBetweenNodes(node, intentNodeObj);
          // 意图节点紧跟在父节点后（收起状态时位置相同）
          if (!intentNodeObj.expanded) {
            intentNodeObj.y = nodeBottom;  // y坐标不使用网格对齐
          } else {
            intentNodeObj.y = nodeBottom + gap;  // y坐标不使用网格对齐
          }
          // 递归调整意图节点的子节点（AI回复）
          adjustFollowingNodes(intentNode.id);
        }
      }

      // 调整其他子节点
      if (otherChildren.length > 0) {
        // 第一个非意图子节点（主链）
        const mainChild = otherChildren[0];
        const mainChildNode = nodeMap.get(mainChild.id);
        if (mainChildNode) {
          mainChildNode.y = nextY;  // y坐标不使用网格对齐
          // 递归调整其子节点
          adjustFollowingNodes(mainChild.id);
        }

        // 分支节点保持与父节点y坐标对齐
        for (let i = 1; i < otherChildren.length; i++) {
          const branchChild = otherChildren[i];
          const branchNode = nodeMap.get(branchChild.id);
          if (branchNode) {
            branchNode.y = node.y;  // y坐标不使用网格对齐
            // 递归调整其子节点
            adjustFollowingNodes(branchChild.id);
          }
        }
      }
    };

    // 从变化的节点开始调整
    adjustFollowingNodes(adjustFromNode.id);

    return { nodes: updatedNodes };
  }),
  
  // 重置
  reset: () => set({
    nodes: [],
    tasks: [],
    events: [],
    status: { stage: 'idle', message: '' }
  }),

  // 清空所有节点
  clearAllNodes: () => set((state) => {
    // 清除激活和选中状态
    set({ 
      activeNodeId: null, 
      selectedNodeId: null,
      streamingNodeId: null 
    });

    // 调用后端API删除所有节点
    const sessionId = state.sessionId;
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}/nodes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeIds: state.nodes.map(n => n.id) })
      }).catch(err => {});
    }

    return { nodes: [] };
  })
}));
