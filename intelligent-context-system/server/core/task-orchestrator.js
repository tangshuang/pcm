import { v4 as uuidv4 } from 'uuid';
import { run, get, all } from '../memory/sqlite.js';
import { saveMessage, saveMemory, saveIntentContext, saveIntentMeta, saveContextSpec } from '../memory/leveldb.js';

export class TaskOrchestrator {
  constructor(services) {
    this.services = services;
    this.activeTasks = new Map();
    this.MAX_TASKS_PER_SESSION = parseInt(process.env.MAX_TASKS_PER_SESSION) || 5;

    // Start timeout monitoring
    this.startTimeoutMonitor();
  }

  // Timeout monitor - checks every minute
  startTimeoutMonitor() {
    setInterval(() => {
      const now = Date.now();
      const TIMEOUT = parseInt(process.env.TASK_TIMEOUT_MS) || 5 * 60 * 1000; // Default 5 minutes

      for (const [taskId, task] of this.activeTasks.entries()) {
        if (now - task.startTime > TIMEOUT) {
          console.warn(`Task ${taskId} timed out, cleaning up...`);
          this.activeTasks.delete(taskId);

          // Update database
          run('UPDATE tasks SET status = ? WHERE id = ?', ['timeout', taskId])
            .catch(err => console.error('Failed to update timeout task status:', err));

          // Notify client
          const client = this.services.clients.get(task.clientId);
          this.sendError(client, taskId, new Error('Task timeout (5 minutes)'));
        }
      }
    }, 60000); // Check every minute
  }
  
  async handleUserInput(clientId, data) {
    const { messageId, sessionId, userId, content, parentNodeId } = data;
    const client = this.services.clients.get(clientId);

    // Ensure session exists
    await this.ensureSession(sessionId, userId);

    // Save user message (use frontend-provided messageId or generate new ID)
    const userMessage = {
      id: messageId || uuidv4(), // Prioritize frontend-provided messageId
      role: 'user',
      content,
      timestamp: Date.now(),
      parentNodeId: parentNodeId || null // If creating branch from a node, record parent node ID
    };
    await saveMessage(sessionId, userMessage);

    // Send intent analysis start status
    this.sendMessageStatus(client, userMessage.id, 'analyzing', 'Analyzing intent...');

    // Analyze user intent
    const intent = await this.services.intentEngine.analyze(userId, content, { sessionId, parentNodeId });
    
    // Save intent to database
    await run(
      'INSERT INTO intents (id, session_id, user_message_id, intent_type, topic, urgency, related_topics, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        intent.id,
        sessionId,
        userMessage.id,
        intent.intent,
        intent.topic,
        intent.urgency,
        JSON.stringify(intent.relatedTopics || []),
        typeof intent.confidence === 'number' ? intent.confidence : 0.0
      ]
    );

    await saveIntentMeta(intent.id, {
      intentStruct: intent.intentStruct,
      confidence: intent.confidence,
      contextHints: intent.contextHints
    });

    const contextSpec = this.services.contextBuilder.buildSpec
      ? this.services.contextBuilder.buildSpec(intent, sessionId)
      : null;
    if (contextSpec) {
      await saveContextSpec(intent.id, contextSpec);
    }

    // Build context (for saving and display)
    const context = await this.services.contextBuilder.build(intent, sessionId);

    // Save context to LevelDB
    await saveIntentContext(intent.id, context);

    // Send intent analysis result to current client
    // No longer send context, frontend loads on demand
    // Intent node's parentNodeId should be the user message's ID
    this.sendToClient(client, 'intent_analyzed', {
      messageId: userMessage.id, // Associate with original user message
      intentId: intent.id,
      intent: intent.intent,
      topic: intent.topic,
      urgency: intent.urgency,
      confidence: typeof intent.confidence === 'number' ? intent.confidence : 0.0,
      relatedTopics: intent.relatedTopics,
      relatedMessageId: userMessage.id, // Associated user message ID
      parentNodeId: userMessage.id // Intent node's parent is the user message
      // context no longer sent, frontend loads on demand
    });

    // Key change: don't await task execution, return immediately (allows next message processing)
    // This way users can send multiple messages consecutively without being blocked
    if (intent.intent === 'interrupt') {
      this.handleInterrupt(clientId, intent, sessionId, userMessage.id)
        .catch(err => this.sendError(client, userMessage.id, err));
    } else if (intent.requiresAction) {
      this.createAndExecuteTask(clientId, intent, sessionId, userMessage.id)
        .catch(err => this.sendError(client, userMessage.id, err));
    } else {
      this.handleSimpleQuery(clientId, intent, sessionId, userMessage.id)
        .catch(err => this.sendError(client, userMessage.id, err));
    }

    // Function returns immediately, doesn't wait for task completion
  }
  
  async handleInterrupt(clientId, intent, sessionId, userMessageId) {
    const client = this.services.clients.get(clientId);

    // Send status update
    this.sendMessageStatus(client, userMessageId, 'context_building', 'Building context...');

    // Get currently running tasks
    const runningTasks = await all(
      'SELECT * FROM tasks WHERE session_id = ? AND status = ?',
      [sessionId, 'running']
    );

    // Build interrupt context
    const context = await this.services.contextBuilder.build(intent, sessionId);
    context.messages.push({
      role: 'system',
      content: `User asked a question during task execution. Currently running tasks: ${JSON.stringify(runningTasks.map(t => ({ type: t.type, progress: t.progress })))}`
    });

    // Use independent LLM instance to answer
    this.sendMessageStatus(client, userMessageId, 'responding', 'Answering your question...');

    await this.streamResponse(client, context, {
      nodeType: 'interrupt_response',
      relatedTaskIds: runningTasks.map(t => t.id),
      parentNodeId: intent.id, // AI reply's parent node is the intent node
      relatedMessageId: userMessageId // Trace back to original user message
    });
  }
  
  async createAndExecuteTask(clientId, intent, sessionId, userMessageId) {
    const client = this.services.clients.get(clientId);

    // Check session task limit
    const sessionTasks = Array.from(this.activeTasks.values())
      .filter(t => t.sessionId === sessionId);

    if (sessionTasks.length >= this.MAX_TASKS_PER_SESSION) {
      this.sendToClient(client, 'task_limit_reached', {
        messageId: userMessageId,
        limit: this.MAX_TASKS_PER_SESSION,
        message: `Session task limit reached (${this.MAX_TASKS_PER_SESSION}), please wait for current tasks to complete`
      });
      return;
    }

    // Create task
    const taskId = uuidv4();
    await run(
      'INSERT INTO tasks (id, session_id, type, status, input) VALUES (?, ?, ?, ?, ?)',
      [taskId, sessionId, intent.intent, 'running', intent.userInput]
    );

    this.activeTasks.set(taskId, {
      intent,
      sessionId,
      clientId,
      startTime: Date.now() // For timeout detection
    });

    // Broadcast task creation
    this.services.broadcast('task_created', {
      taskId,
      type: intent.intent,
      topic: intent.topic
    });

    // Build context
    this.sendMessageStatus(client, userMessageId, 'context_building', 'Building context...');
    const context = await this.services.contextBuilder.build(intent, sessionId);

    // Broadcast context info (for canvas display)
    this.services.broadcast('context_built', {
      taskId,
      contextSize: context.metadata.contextSize,
      memoryCount: context.messages.length - 2
    });

    // Execute task
    this.sendMessageStatus(client, userMessageId, 'executing', 'Executing task...');

    await this.streamResponse(client, context, {
      nodeType: 'task_response',
      taskId,
      parentNodeId: intent.id, // AI reply's parent node is the intent node
      relatedMessageId: userMessageId // Trace back to original user message
    });

    // Update task status
    await run(
      'UPDATE tasks SET status = ?, progress = 100, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['completed', taskId]
    );

    this.activeTasks.delete(taskId);

    // Broadcast task completion
    this.services.broadcast('task_completed', { taskId });
  }
  
  async handleSimpleQuery(clientId, intent, sessionId, userMessageId) {
    const client = this.services.clients.get(clientId);

    // Build context
    this.sendMessageStatus(client, userMessageId, 'building_context', 'Preparing answer...');
    const context = await this.services.contextBuilder.build(intent, sessionId);

    // Stream response
    await this.streamResponse(client, context, {
      nodeType: 'simple_response',
      parentNodeId: intent.id, // AI reply's parent node is the intent node
      relatedMessageId: userMessageId // Trace back to original user message
    });
  }

  async streamResponse(client, context, metadata) {
    const messageId = uuidv4();

    // Send start signal (includes relatedMessageId and parentNodeId)
    this.sendToClient(client, 'response_start', {
      messageId,
      relatedMessageId: metadata.relatedMessageId, // Trace back to original user message
      parentNodeId: metadata.parentNodeId, // AI reply's parent node (intent node ID)
      ...metadata
    });

    let fullContent = '';

    await this.services.llm.streamChat(
      context.messages,
      (chunk, accumulated) => {
        fullContent = accumulated;
        this.sendToClient(client, 'response_chunk', {
          messageId,
          chunk,
          accumulated
        });
      }
    );

    // Save assistant message, including parentNodeId
    await saveMessage(context.metadata.sessionId, {
      id: messageId,
      role: 'assistant',
      content: fullContent,
      timestamp: Date.now(),
      parentNodeId: metadata.parentNodeId || null, // AI reply's parent node is the intent node
      metadata
    });

    // Extract and save memory
    await this.extractAndSaveMemory(context.metadata.userId, fullContent, metadata);

    // Send completion signal (includes relatedMessageId)
    this.sendToClient(client, 'response_end', {
      messageId,
      relatedMessageId: metadata.relatedMessageId, // Trace back to original user message
      totalLength: fullContent.length
    });
  }

  async extractAndSaveMemory(userId, content, metadata) {
    // Simple memory extraction logic, can be enhanced later
    if (content.length > 100) {
      await saveMemory(userId, {
        type: metadata.nodeType === 'task_response' ? 'task' : 'conversation',
        content: content.slice(0, 500),
        timestamp: Date.now()
      });
    }
  }

  async ensureSession(sessionId, userId) {
    const existing = await get('SELECT id FROM sessions WHERE id = ?', [sessionId]);
    if (!existing) {
      await run(
        'INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)',
        [sessionId, userId, 'New Session']
      );
    }

    // Ensure user exists
    const user = await get('SELECT id FROM user_profiles WHERE id = ?', [userId]);
    if (!user) {
      await run(
        'INSERT INTO user_profiles (id, name, preferences) VALUES (?, ?, ?)',
        [userId, 'User', '{}']
      );
    }
  }
  
  async handleReexecute(clientId, data) {
    const { sessionId, userId, intentNodeId, context, userContent } = data;
    const client = this.services.clients.get(clientId);

    // Ensure session exists
    await this.ensureSession(sessionId, userId);

    // Get intent information from intent node (read from database)
    const originalIntent = await get('SELECT * FROM intents WHERE id = ?', [intentNodeId]);

    if (!originalIntent) {
      console.error('Intent node not found:', intentNodeId);
      this.sendError(client, intentNodeId, new Error('Intent information not found'));
      return;
    }

    // Construct intent object (directly use existing intent node information)
    const intent = {
      id: intentNodeId, // Use existing intent node ID
      intent: originalIntent.intent_type,
      topic: originalIntent.topic,
      urgency: originalIntent.urgency,
      relatedTopics: JSON.parse(originalIntent.related_topics || '[]'),
      requiresAction: originalIntent.intent_type !== 'question',
      userInput: userContent
    };

    // Execute corresponding processing based on intent type, generate new AI reply branch
    // New AI reply's parentNodeId will be intentNodeId
    if (intent.intent === 'interrupt') {
      this.handleInterrupt(clientId, intent, sessionId, intentNodeId)
        .catch(err => this.sendError(client, intentNodeId, err));
    } else if (intent.requiresAction) {
      this.createAndExecuteTaskWithContext(clientId, intent, sessionId, intentNodeId, context)
        .catch(err => this.sendError(client, intentNodeId, err));
    } else {
      this.handleSimpleQueryWithContext(clientId, intent, sessionId, intentNodeId, context)
        .catch(err => this.sendError(client, intentNodeId, err));
    }
  }

  // Create and execute task using existing context
  async createAndExecuteTaskWithContext(clientId, intent, sessionId, userMessageId, context) {
    const client = this.services.clients.get(clientId);

    // Check session task limit
    const sessionTasks = Array.from(this.activeTasks.values())
      .filter(t => t.sessionId === sessionId);

    if (sessionTasks.length >= this.MAX_TASKS_PER_SESSION) {
      this.sendToClient(client, 'task_limit_reached', {
        messageId: userMessageId,
        limit: this.MAX_TASKS_PER_SESSION,
        message: `Session task limit reached (${this.MAX_TASKS_PER_SESSION}), please wait for current tasks to complete`
      });
      return;
    }

    // Create task
    const taskId = uuidv4();
    await run(
      'INSERT INTO tasks (id, session_id, type, status, input) VALUES (?, ?, ?, ?, ?)',
      [taskId, sessionId, intent.intent, 'running', intent.userInput]
    );

    this.activeTasks.set(taskId, {
      intent,
      sessionId,
      clientId,
      startTime: Date.now()
    });

    // Broadcast task creation
    this.services.broadcast('task_created', {
      taskId,
      type: intent.intent,
      topic: intent.topic
    });

    // Directly use provided context, no need to rebuild
    this.sendMessageStatus(client, userMessageId, 'executing', 'Executing task...');

    await this.streamResponse(client, context, {
      nodeType: 'task_response',
      taskId,
      parentNodeId: intent.id,
      relatedMessageId: userMessageId
    });

    // Update task status
    await run(
      'UPDATE tasks SET status = ?, progress = 100, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['completed', taskId]
    );

    this.activeTasks.delete(taskId);

    // Broadcast task completion
    this.services.broadcast('task_completed', { taskId });
  }

  // Handle simple query using existing context
  async handleSimpleQueryWithContext(clientId, intent, sessionId, userMessageId, context) {
    const client = this.services.clients.get(clientId);

    // Directly use provided context
    this.sendMessageStatus(client, userMessageId, 'responding', 'Answering...');

    await this.streamResponse(client, context, {
      nodeType: 'simple_response',
      parentNodeId: intent.id,
      relatedMessageId: userMessageId
    });
  }

  // Send message status update
  sendMessageStatus(client, messageId, stage, message) {
    this.sendToClient(client, 'message_status', {
      messageId,
      stage,
      message,
      timestamp: Date.now()
    });
  }

  // Send error information
  sendError(client, messageId, error) {
    this.sendToClient(client, 'error', {
      messageId,
      error: error.message || String(error),
      timestamp: Date.now()
    });
  }

  sendToClient(client, type, data) {
    if (client && client.readyState === 1) {
      client.send(JSON.stringify({ type, data, timestamp: Date.now() }));
    }
  }
}
