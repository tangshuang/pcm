import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';

import { initDatabase } from './memory/sqlite.js';
import { initLevelDB } from './memory/leveldb.js';
import { IntentEngine } from './core/intent-engine.js';
import { ContextBuilder } from './core/context-builder.js';
import { TaskOrchestrator } from './core/task-orchestrator.js';
import { LLMService } from './llm/service.js';
import { FileWatcher } from './sensors/file-watcher.js';
import { SubscriptionManager } from './sensors/subscription.js';
import { ApiPoller } from './sensors/api-poller.js';
import { setupRoutes } from './api/routes.js';

// Message queue class - supports concurrent processing
class MessageQueue {
  constructor(maxConcurrency = 3) {
    this.queue = [];
    this.running = 0;
    this.maxConcurrency = maxConcurrency;
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { fn, resolve, reject } = this.queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();  // Process next task in queue
    }
  }

  getStats() {
    return {
      running: this.running,
      queued: this.queue.length,
      total: this.running + this.queue.length
    };
  }
}

const app = express();
app.use(cors());
// Increase request body size limit to 10MB (for saving canvas data with large content)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Global service instances
const services = {
  clients: new Map(),
  clientQueues: new Map(),  // Message queue for each client
  broadcast: (type, data, excludeClient = null) => {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    services.clients.forEach((client, id) => {
      if (client.readyState === 1 && id !== excludeClient) {
        client.send(message);
      }
    });
  }
};

async function init() {
  console.log('🚀 Initializing Intelligent Context System...');

  // Initialize databases
  services.sqlite = await initDatabase();
  services.leveldb = await initLevelDB();
  console.log('✅ Database initialization complete');

  // Initialize core services
  services.llm = new LLMService();
  services.intentEngine = new IntentEngine(services);
  services.contextBuilder = new ContextBuilder(services);
  services.taskOrchestrator = new TaskOrchestrator(services);
  console.log('✅ Core services initialization complete');

  // Initialize environment sensors
  services.fileWatcher = new FileWatcher(services);
  services.subscriptionManager = new SubscriptionManager(services);
  services.apiPoller = new ApiPoller(services);
  console.log('✅ Environment sensors initialization complete');
  
  // Setup API routes
  setupRoutes(app, services);

  // WebSocket connection handling
  wss.on('connection', (ws) => {
    const clientId = uuidv4();
    services.clients.set(clientId, ws);

    // Create message queue for each client (max 3 concurrent tasks)
    const maxConcurrency = parseInt(process.env.MAX_CONCURRENT_TASKS_PER_CLIENT) || 3;
    const queue = new MessageQueue(maxConcurrency);
    services.clientQueues.set(clientId, queue);

    console.log(`📱 Client connected: ${clientId} (concurrency limit: ${maxConcurrency})`);

    ws.send(JSON.stringify({
      type: 'connected',
      data: { clientId, maxConcurrency },
      timestamp: Date.now()
    }));

    // Non-blocking message processing - using queue
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        // Add to queue, return immediately (non-blocking)
        queue.add(() => handleWebSocketMessage(clientId, data, services))
          .catch(err => {
            console.error('Message processing error:', err);
            // Send error message to client
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({
                type: 'error',
                data: {
                  error: err.message,
                  messageId: data.messageId || null
                },
                timestamp: Date.now()
              }));
            }
          });
      } catch (err) {
        console.error('Message parsing error:', err);
      }
    });

    ws.on('close', () => {
      services.clients.delete(clientId);
      services.clientQueues.delete(clientId);
      console.log(`📴 Client disconnected: ${clientId}`);
    });
  });

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`🌐 Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket running on ws://localhost:${PORT}`);
  });
}

async function handleWebSocketMessage(clientId, message, services) {
  const { type, data } = message;
  const client = services.clients.get(clientId);

  switch (type) {
    case 'chat':
      await services.taskOrchestrator.handleUserInput(clientId, data);
      break;
    case 'reexecute':
      await services.taskOrchestrator.handleReexecute(clientId, data);
      break;
    case 'subscribe':
      await services.subscriptionManager.addSubscription(data);
      break;
    case 'poll_api':
      await services.apiPoller.addPoller(data);
      break;
    default:
      console.log('Unknown message type:', type);
  }
}

init().catch(console.error);
