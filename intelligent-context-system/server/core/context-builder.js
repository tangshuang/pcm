import { getUserMemories, getSessionMessages, searchSimilar, getCanvasGraph } from '../memory/leveldb.js';
import { get, all } from '../memory/sqlite.js';

export class ContextBuilder {
  constructor(services) {
    this.services = services;
  }
  
  async build(intent, sessionId) {
    const { userId, contextHints } = intent;
    const historyAnchorId = intent.anchorNodeId || intent.parentNodeId || null;

    // Fetch various context data in parallel
    const [
      userProfile,
      sessionInfo,
      relevantMemories,
      recentMessages,
      environmentState,
      relatedTasks
    ] = await Promise.all([
      this.getUserProfile(userId),
      this.getSessionInfo(sessionId),
      this.getRelevantMemories(userId, intent),
      contextHints.shouldIncludeRecentHistory
        ? historyAnchorId
          ? this.getMessagesUpToNode(sessionId, historyAnchorId) // If anchor exists, get history up to that node
          : getSessionMessages(sessionId, 10) // Otherwise get recent 10 messages
        : [],
      contextHints.shouldIncludeEnvironmentState ? this.getEnvironmentState() : null,
      this.getRelatedTasks(sessionId, intent)
    ]);

    const contextSpec = this.buildSpec ? this.buildSpec(intent, sessionId) : null;
    const compiledContext = await this.compileContext({
      intent,
      contextSpec,
      userProfile,
      sessionInfo,
      relevantMemories,
      recentMessages,
      environmentState,
      relatedTasks
    });

    // Build structured context
    const context = this.composeContext({
      userProfile,
      sessionInfo,
      relevantMemories,
      recentMessages,
      environmentState,
      relatedTasks,
      intent,
      contextSpec,
      compiledContext
    });

    return context;
  }

  buildSpec(intent, sessionId) {
    const historyAnchorId = intent.anchorNodeId || intent.parentNodeId || null;
    const defaultMaxTokens = parseInt(process.env.CONTEXT_MAX_TOKENS, 10) || 6000;
    const defaultMaxMemories = parseInt(process.env.CONTEXT_MAX_MEMORIES, 10) || 10;

    return {
      intentId: intent.id,
      sessionId,
      required: this.deriveRequired(intent),
      constraints: intent.intentStruct?.constraints || [],
      timeScope: 'session',
      memoryTypes: intent.contextHints?.memoryTypes || [],
      historyPolicy: {
        includeRecent: intent.contextHints?.shouldIncludeRecentHistory ?? true,
        anchorNodeId: historyAnchorId,
        maxTurns: 10
      },
      budget: {
        maxTokens: defaultMaxTokens,
        maxMemories: defaultMaxMemories
      },
      scoring: {
        wSim: 0.35,
        wCover: 0.25,
        wImportance: 0.2,
        wRecency: 0.2,
        wDup: 0.1
      }
    };
  }

  deriveRequired(intent) {
    const map = {
      task: ['task_state', 'project_context', 'related_tasks'],
      question: ['relevant_facts', 'recent_history'],
      feedback: ['recent_history'],
      clarification: ['recent_history'],
      interrupt: ['running_tasks', 'recent_history']
    };
    const required = new Set(map[intent.intent] || ['recent_history']);
    if (intent.topic) {
      required.add(`topic:${intent.topic}`);
    }
    return Array.from(required);
  }
  
  async getUserProfile(userId) {
    const profile = await get('SELECT * FROM user_profiles WHERE id = ?', [userId]);
    if (!profile) {
      return { id: userId, name: 'User', preferences: {} };
    }
    return {
      ...profile,
      preferences: JSON.parse(profile.preferences || '{}')
    };
  }

  async getSessionInfo(sessionId) {
    const session = await get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    return session || { id: sessionId, title: 'New Session', status: 'active' };
  }

  /**
   * Get all messages from root node to specified node (for branch context)
   * @param {string} sessionId - Session ID
   * @param {string} targetNodeId - Target node ID (parent node ID)
   * @returns {Array} Time-sorted message list
   */
  async getMessagesUpToNode(sessionId, targetNodeId) {
    const canvasGraph = await getCanvasGraph(sessionId);
    const graphNodes = canvasGraph?.nodes || [];

    if (graphNodes.length > 0) {
      const nodeMap = new Map(graphNodes.map(n => [n.id, n]));
      const targetNode = nodeMap.get(targetNodeId);

      if (targetNode) {
        const nodePath = [];
        let current = targetNode;

        while (current) {
          nodePath.unshift(current);
          if (current.parentNodeId && nodeMap.has(current.parentNodeId)) {
            current = nodeMap.get(current.parentNodeId);
          } else {
            break;
          }
        }

        const messages = nodePath
          .filter(n => n && (n.type === 'chat' || n.type === 'task'))
          .map(n => ({
            id: n.id,
            role: n.type === 'chat' && n.title === 'User' ? 'user' : 'assistant',
            content: n.content,
            timestamp: n.timestamp || Date.now(),
            parentNodeId: n.parentNodeId || null,
            editHistory: n.editHistory || []
          }));

        if (messages.length > 20) return messages.slice(-20);
        return messages;
      }
    }

    const allMessages = await getSessionMessages(sessionId, 1000);
    const messageMap = new Map(allMessages.map(m => [m.id, m]));
    const targetMessage = messageMap.get(targetNodeId);
    if (!targetMessage) {
      return allMessages.slice(-10);
    }

    const messagePath = [];
    let currentMessage = targetMessage;

    while (currentMessage) {
      messagePath.unshift(currentMessage);
      if (currentMessage.parentNodeId && messageMap.has(currentMessage.parentNodeId)) {
        currentMessage = messageMap.get(currentMessage.parentNodeId);
      } else {
        break;
      }
    }

    if (messagePath.length > 20) {
      return messagePath.slice(-20);
    }

    return messagePath;
  }
  
  async getRelevantMemories(userId, intent) {
    const memories = await getUserMemories(userId);

    // Filter relevant memories based on intent
    const relevantTypes = intent.contextHints.memoryTypes;
    const filtered = memories.filter(m => relevantTypes.includes(m.type));

    // If vector search capability is available, perform semantic matching
    if (intent.userInput && this.services.llm) {
      try {
        const embedding = await this.services.llm.getEmbedding(intent.userInput);
        const similar = await searchSimilar(embedding, 5);
        return [...filtered.slice(-5), ...similar.map(s => s.metadata)];
      } catch {
        return filtered.slice(-10);
      }
    }

    return filtered.slice(-10);
  }
  
  async getEnvironmentState() {
    const recentEvents = await all(
      'SELECT * FROM environment_events WHERE processed = 0 ORDER BY created_at DESC LIMIT 20'
    );
    
    return {
      events: recentEvents.map(e => ({
        source: e.source,
        type: e.type,
        data: JSON.parse(e.data || '{}'),
        time: e.created_at
      })),
      timestamp: Date.now()
    };
  }
  
  async getRelatedTasks(sessionId, intent) {
    const tasks = await all(
      'SELECT * FROM tasks WHERE session_id = ? AND status IN (?, ?) ORDER BY created_at DESC LIMIT 5',
      [sessionId, 'running', 'pending']
    );
    
    return tasks.map(t => ({
      id: t.id,
      type: t.type,
      status: t.status,
      progress: t.progress,
      input: t.input?.slice(0, 100)
    }));
  }
  
  composeContext(data) {
    const {
      userProfile,
      sessionInfo,
      relevantMemories,
      recentMessages,
      environmentState,
      relatedTasks,
      intent,
      contextSpec,
      compiledContext
    } = data;

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(userProfile, sessionInfo, relatedTasks, environmentState);

    // Build message list
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    const intentDirective = this.formatIntentDirective(intent);
    if (intentDirective) {
      messages.push({ role: 'system', content: intentDirective });
    }

    const specDirective = this.formatContextSpec(contextSpec);
    if (specDirective) {
      messages.push({ role: 'system', content: specDirective });
    }

    if (compiledContext) {
      messages.push({ role: 'system', content: compiledContext });
    }

    // Add relevant memories as background
    if (relevantMemories.length > 0) {
      messages.push({
        role: 'system',
        content: `[Relevant Historical Memories]\n${relevantMemories.map(m => `- ${m.content || JSON.stringify(m)}`).join('\n')}`
      });
    }

    // Add recent messages (if needed)
    if (recentMessages.length > 0) {
      // Check if the last message is the current user input (avoid duplication)
      const lastMessage = recentMessages[recentMessages.length - 1];
      const isLastMessageCurrentInput = lastMessage &&
        lastMessage.role === 'user' &&
        lastMessage.content === intent.userInput;

      // If the last message is the current input, include all messages; otherwise take only the previous ones
      const messagesToInclude = isLastMessageCurrentInput
        ? recentMessages.slice(-5)
        : recentMessages.slice(-4); // Reserve one spot for current input

      for (const msg of messagesToInclude) {
        // Use edited content (if available)
        const content = msg.editHistory && msg.editHistory.length > 0
          ? msg.editHistory[msg.editHistory.length - 1].newContent
          : msg.content;

        messages.push({
          role: msg.role,
          content: content
        });
      }

      // If the last message is not the current input, add the current user input
      if (!isLastMessageCurrentInput) {
        messages.push({
          role: 'user',
          content: intent.userInput
        });
      }
    } else {
      // No history messages, directly add current user input
      messages.push({
        role: 'user',
        content: intent.userInput
      });
    }
    
    return {
      messages,
      metadata: {
        intentId: intent.id,
        sessionId: sessionInfo.id,
        userId: userProfile.id,
        contextSize: messages.reduce((acc, m) => acc + m.content.length, 0),
        intentType: intent.intent,
        intentTopic: intent.topic,
        hasCompiledContext: Boolean(compiledContext)
      }
    };
  }
  
  buildSystemPrompt(userProfile, sessionInfo, relatedTasks, environmentState) {
    let prompt = `You are an intelligent assistant engaging in conversation with the user.

[User Profile]
- Username: ${userProfile.name}
- Preferences: ${JSON.stringify(userProfile.preferences)}

[Current Session]
- Session Topic: ${sessionInfo.title}
- Session Status: ${sessionInfo.status}
${sessionInfo.context_summary ? `- Background Summary: ${sessionInfo.context_summary}` : ''}`;

    if (relatedTasks.length > 0) {
      prompt += `\n\n[Ongoing Tasks]\n${relatedTasks.map(t => `- [${t.status}] ${t.type}: ${t.input}`).join('\n')}`;
    }

    if (environmentState?.events?.length > 0) {
      prompt += `\n\n[Environment Changes]\n${environmentState.events.slice(0, 5).map(e => `- [${e.source}] ${e.type}: ${JSON.stringify(e.data)}`).join('\n')}`;
    }

    prompt += `\n\nPlease answer the user's questions or execute their requests based on the above background information.`;

    return prompt;
  }

  formatIntentDirective(intent) {
    if (!intent) return null;
    const struct = intent.intentStruct || {};
    const goal = struct.goal || intent.topic || intent.userInput?.slice(0, 50) || 'Not provided';
    const constraints = this.formatList(struct.constraints);
    const planHints = this.formatList(struct.planHints);
    const entities = this.formatList(struct.entities);
    const uncertainty = this.formatList(struct.uncertaintyReasons);

    return [
      '[Structured Intent]',
      `- Intent Type: ${intent.intent || 'question'}`,
      `- Goal: ${goal}`,
      `- Constraints: ${constraints}`,
      `- Plan Hints: ${planHints}`,
      `- Key Entities: ${entities}`,
      `- Uncertainty Reasons: ${uncertainty}`
    ].join('\n');
  }

  formatContextSpec(spec) {
    if (!spec) return null;
    const required = this.formatList(spec.required);
    const constraints = this.formatList(spec.constraints);
    const memoryTypes = this.formatList(spec.memoryTypes);
    const includeRecent = spec.historyPolicy?.includeRecent ? 'Yes' : 'No';
    const maxTurns = spec.historyPolicy?.maxTurns ?? '-';
    const anchorNodeId = spec.historyPolicy?.anchorNodeId || '-';
    const maxTokens = spec.budget?.maxTokens ?? '-';
    const maxMemories = spec.budget?.maxMemories ?? '-';

    return [
      '[Context Requirement Specification (CRS)]',
      `- required: ${required}`,
      `- constraints: ${constraints}`,
      `- memoryTypes: ${memoryTypes}`,
      `- historyPolicy: includeRecent=${includeRecent}, maxTurns=${maxTurns}, anchorNodeId=${anchorNodeId}`,
      `- budget: maxTokens=${maxTokens}, maxMemories=${maxMemories}`
    ].join('\n');
  }

  formatList(items) {
    if (!items || items.length === 0) return 'None';
    return items.join('; ');
  }

  shouldCompileContext({ recentMessages, relevantMemories, relatedTasks }) {
    const mode = (process.env.CONTEXT_COMPILATION_MODE || 'auto').toLowerCase();
    if (mode === 'off') return false;
    if (mode === 'on') return true;

    const score = (recentMessages?.length || 0)
      + (relevantMemories?.length || 0)
      + (relatedTasks?.length || 0);
    return score >= 3;
  }

  async compileContext(payload) {
    if (!this.services.llm) return null;
    if (!this.shouldCompileContext(payload)) return null;

    const {
      intent,
      contextSpec,
      recentMessages,
      relevantMemories,
      relatedTasks,
      environmentState
    } = payload;

    const trim = (value, limit) => {
      if (!value) return '';
      const text = String(value);
      return text.length > limit ? `${text.slice(0, limit)}...` : text;
    };

    const compilerInput = {
      intent: {
        type: intent.intent,
        goal: intent.intentStruct?.goal || intent.topic || intent.userInput?.slice(0, 50),
        constraints: intent.intentStruct?.constraints || [],
        planHints: intent.intentStruct?.planHints || [],
        entities: intent.intentStruct?.entities || []
      },
      contextSpec: contextSpec
        ? {
          required: contextSpec.required || [],
          constraints: contextSpec.constraints || [],
          memoryTypes: contextSpec.memoryTypes || [],
          historyPolicy: contextSpec.historyPolicy || {}
        }
        : null,
      recentMessages: (recentMessages || []).slice(-8).map(m => ({
        role: m.role,
        content: trim(m.content, 600)
      })),
      memories: (relevantMemories || []).slice(-8).map(m => trim(m.content || JSON.stringify(m), 300)),
      relatedTasks: (relatedTasks || []).map(t => ({
        type: t.type,
        status: t.status,
        input: trim(t.input, 120)
      })),
      environment: (environmentState?.events || []).slice(0, 5)
    };

    const systemPrompt = `You are a context compiler. Based on input materials, output a high-quality context summary for the main model.
Requirements:
- Use only input materials, do not fabricate information
- Merge similar information, avoid duplication
- Identify constraints, goals, known facts, current progress, pending questions
- Be concise, prioritize bullet points
- Output format must use the following template:
[Context Compilation]
Goal:
Constraints:
Key Facts:
- ...
Current Progress:
- ...
Pending Questions:
- ...
Required Output:
[/Context Compilation]`;

    try {
      const response = await this.services.llm.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(compilerInput, null, 2) }
        ],
        { temperature: 0.2, maxTokens: 700 }
      );
      const compiled = String(response || '').trim();
      if (!compiled) return null;
      return compiled.startsWith('[Context Compilation]') ? compiled : `[Context Compilation]\n${compiled}`;
    } catch (err) {
      console.warn('Context compilation failed, falling back to raw context.', err);
      return null;
    }
  }
}
