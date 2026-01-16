import { v4 as uuidv4 } from 'uuid';
import { getUserMemories } from '../memory/leveldb.js';
import { all } from '../memory/sqlite.js';

export class IntentEngine {
  constructor(services) {
    this.services = services;
  }
  
  async analyze(userId, userInput, sessionContext = {}) {
    const llm = this.services.llm;

    // Get user historical memories
    const memories = await getUserMemories(userId);
    const recentTasks = await all(
      'SELECT * FROM tasks WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?) ORDER BY created_at DESC LIMIT 10',
      [userId]
    );

    // Use LLM to analyze intent
    const intentAnalysis = await llm.analyzeIntent(userInput, {
      memories: memories.slice(-5),
      recentTasks: recentTasks.map(t => ({ type: t.type, status: t.status })),
      sessionContext
    });
    const normalized = this.normalizeIntentAnalysis(intentAnalysis, userInput);

    // Enrich intent analysis results
    const enrichedIntent = {
      id: uuidv4(),
      ...normalized,
      userId,
      sessionId: sessionContext.sessionId || null,
      userInput,
      timestamp: Date.now(),
      // Preserve parentNodeId for context building (obtained from sessionContext)
      parentNodeId: sessionContext.parentNodeId || null,
      anchorNodeId: sessionContext.parentNodeId || null, // Anchor point for context construction
      contextHints: await this.extractContextHints(normalized, memories)
    };

    return enrichedIntent;
  }

  normalizeIntentAnalysis(intentAnalysis = {}, userInput) {
    const normalized = { ...intentAnalysis };

    normalized.intent = normalized.intent || 'question';
    normalized.topic = normalized.topic || userInput.slice(0, 50);
    normalized.urgency = normalized.urgency || 'medium';
    normalized.requiresAction = typeof normalized.requiresAction === 'boolean'
      ? normalized.requiresAction
      : normalized.intent !== 'question';
    normalized.relatedTopics = this.asArray(normalized.relatedTopics);
    normalized.sentiment = normalized.sentiment || 'neutral';
    normalized.confidence = this.toNumber(normalized.confidence, 0.5);
    normalized.intentStruct = this.normalizeIntentStruct(
      normalized.intentStruct,
      normalized,
      userInput
    );

    return normalized;
  }

  normalizeIntentStruct(intentStruct = {}, intentAnalysis, userInput) {
    const struct = typeof intentStruct === 'object' && intentStruct ? intentStruct : {};
    const goal = this.toText(struct.goal, intentAnalysis.topic || userInput.slice(0, 50));

    return {
      goal,
      constraints: this.asArray(struct.constraints),
      entities: this.asArray(struct.entities),
      planHints: this.asArray(struct.planHints),
      evidence: Array.isArray(struct.evidence) && struct.evidence.length > 0
        ? struct.evidence
        : [{ source: 'user_input', span: userInput.slice(0, 100) }],
      confidence: this.toNumber(struct.confidence, intentAnalysis.confidence || 0.5),
      uncertaintyReasons: this.asArray(struct.uncertaintyReasons)
    };
  }

  asArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  toNumber(value, fallback) {
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return fallback;
  }

  toText(value, fallback) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text ? text : fallback;
  }
  
  async extractContextHints(intent, memories) {
    // Extract context hints based on intent
    const hints = {
      shouldIncludeUserProfile: true,
      shouldIncludeRecentHistory: intent.intent !== 'interrupt',
      shouldIncludeRelatedMemories: true,
      shouldIncludeEnvironmentState: intent.urgency === 'high',
      memoryTypes: this.determineRelevantMemoryTypes(intent),
      timeRange: this.determineTimeRange(intent)
    };

    return hints;
  }

  determineRelevantMemoryTypes(intent) {
    const typeMap = {
      question: ['knowledge', 'conversation'],
      task: ['task', 'project', 'code'],
      feedback: ['conversation', 'task'],
      clarification: ['conversation'],
      interrupt: ['task', 'conversation']
    };

    return typeMap[intent.intent] || ['conversation'];
  }

  determineTimeRange(intent) {
    // Determine time range based on urgency level
    const ranges = {
      high: { hours: 1 },
      medium: { hours: 24 },
      low: { days: 7 }
    };

    return ranges[intent.urgency] || ranges.medium;
  }
}
