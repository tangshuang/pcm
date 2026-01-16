import OpenAI from 'openai';

export class LLMService {
  constructor() {
    this.client = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = process.env.OPENAI_MODEL || 'gpt-4';
  }
  
  async chat(messages, options = {}) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
      stream: options.stream ?? false
    });
    
    if (options.stream) {
      return response;
    }
    
    return response.choices[0].message.content;
  }
  
  async streamChat(messages, onChunk, options = {}) {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
      stream: true
    });
    
    let fullContent = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      fullContent += content;
      if (content) {
        onChunk(content, fullContent);
      }
    }
    
    return fullContent;
  }
  
  async getEmbedding(text) {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text
    });
    return response.data[0].embedding;
  }
  
  async analyzeIntent(userInput, context = {}) {
    const systemPrompt = `You are an intent analysis expert. Analyze user input and return only JSON, no extra text.

Determination rules:
- intent is "task": User requests specific operations, content creation, problem analysis, planning, etc.
- requiresAction is true: AI needs to perform specific work, not just answer questions
- Contains action verbs (create, analyze, design, write, develop, generate, optimize, etc.) typically indicates a task

Return format:
{
  "intent": "Primary intent type: question/task/feedback/clarification/interrupt",
  "topic": "Topic keywords",
  "urgency": "Urgency level: low/medium/high",
  "requiresAction": true/false,
  "relatedTopics": ["Array of related topics"],
  "sentiment": "Sentiment: positive/neutral/negative",
  "confidence": 0.0-1.0,
  "intentStruct": {
    "goal": "User's core objective",
    "constraints": ["Array of constraint conditions"],
    "entities": ["Array of key entities"],
    "planHints": ["Possible steps or planning hints"],
    "evidence": [{"source": "user_input", "span": "Intent evidence fragment"}],
    "uncertaintyReasons": ["Array of uncertainty reasons"]
  }
}

Examples:
- "What is AI?" → intent: "question", requiresAction: false
- "Help me write a plan" → intent: "task", requiresAction: true
- "Analyze this data" → intent: "task", requiresAction: true`;

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `User input: ${userInput}\n\nCurrent context: ${JSON.stringify(context)}` }
    ], { temperature: 0.3 });
    
    try {
      return JSON.parse(response);
    } catch {
      return {
        intent: 'question',
        topic: userInput.slice(0, 50),
        urgency: 'medium',
        requiresAction: false,
        relatedTopics: [],
        sentiment: 'neutral',
        confidence: 0.5,
        intentStruct: {
          goal: userInput.slice(0, 50),
          constraints: [],
          entities: [],
          planHints: [],
          evidence: [{ source: 'user_input', span: userInput.slice(0, 50) }],
          uncertaintyReasons: []
        }
      };
    }
  }
}
