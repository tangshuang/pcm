import { Level } from 'level';
import { mkdir } from 'fs/promises';

const dbPath = process.env.LEVELDB_PATH || './data/leveldb';

let db = null;

export async function initLevelDB() {
  await mkdir(dbPath, { recursive: true });
  db = new Level(dbPath, { valueEncoding: 'json' });
  await db.open();
  return db;
}

// 消息存储
export async function saveMessage(sessionId, message) {
  const key = `msg:${sessionId}:${Date.now()}:${message.id}`;
  await db.put(key, message);
  return key;
}

export async function getSessionMessages(sessionId, limit = 100) {
  const messages = [];
  const prefix = `msg:${sessionId}:`;
  
  for await (const [key, value] of db.iterator({
    gte: prefix,
    lte: prefix + '\xFF',
    limit,
    reverse: true
  })) {
    messages.unshift(value);
  }
  
  return messages;
}

// 记忆存储
export async function saveMemory(userId, memory) {
  const key = `mem:${userId}:${memory.type}:${Date.now()}`;
  await db.put(key, memory);
  return key;
}

export async function getUserMemories(userId, type = null) {
  const memories = [];
  const prefix = type ? `mem:${userId}:${type}:` : `mem:${userId}:`;
  
  for await (const [key, value] of db.iterator({
    gte: prefix,
    lte: prefix + '\xFF'
  })) {
    memories.push(value);
  }
  
  return memories;
}

// 上下文快照
export async function saveContextSnapshot(taskId, context) {
  const key = `ctx:${taskId}:${Date.now()}`;
  await db.put(key, context);
  return key;
}

// 意图上下文存储
export async function saveIntentContext(intentId, context) {
  const key = `intent:${intentId}`;
  await db.put(key, { ...context, savedAt: Date.now() });
  return key;
}

export async function getIntentContext(intentId) {
  try {
    const key = `intent:${intentId}`;
    return await db.get(key);
  } catch (err) {
    if (err.code === 'LEVEL_NOT_FOUND') {
      return null;
    }
    throw err;
  }
}

// 意图元信息存储（结构化意图、上下文提示等）
export async function saveIntentMeta(intentId, meta) {
  const key = `intentmeta:${intentId}`;
  await db.put(key, { ...meta, savedAt: Date.now() });
  return key;
}

export async function getIntentMeta(intentId) {
  try {
    const key = `intentmeta:${intentId}`;
    return await db.get(key);
  } catch (err) {
    if (err.code === 'LEVEL_NOT_FOUND') {
      return null;
    }
    throw err;
  }
}

// 上下文需求规格存储（CRS）
export async function saveContextSpec(intentId, spec) {
  const key = `ctxspec:${intentId}`;
  await db.put(key, { ...spec, savedAt: Date.now() });
  return key;
}

export async function getContextSpec(intentId) {
  try {
    const key = `ctxspec:${intentId}`;
    return await db.get(key);
  } catch (err) {
    if (err.code === 'LEVEL_NOT_FOUND') {
      return null;
    }
    throw err;
  }
}

// 向量索引存储（简化版，实际应用可接入专业向量数据库）
export async function saveEmbedding(id, embedding, metadata) {
  const key = `emb:${id}`;
  await db.put(key, { embedding, metadata, createdAt: Date.now() });
}

export async function searchSimilar(queryEmbedding, limit = 10) {
  const results = [];
  
  for await (const [key, value] of db.iterator({
    gte: 'emb:',
    lte: 'emb:\xFF'
  })) {
    const similarity = cosineSimilarity(queryEmbedding, value.embedding);
    results.push({ ...value, similarity });
  }
  
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 画布图存储
export async function saveCanvasGraph(sessionId, graphData) {
  const key = `graph:${sessionId}`;
  const dataToSave = {
    ...graphData,
    updatedAt: Date.now()
  };
  console.log(`LevelDB saveCanvasGraph: key=${key}, 节点数=${graphData.nodes?.length || 0}`);
  await db.put(key, dataToSave);
  
  // 验证保存是否成功
  try {
    const saved = await db.get(key);
    console.log(`LevelDB saveCanvasGraph 验证: 保存后节点数=${saved.nodes?.length || 0}`);
  } catch (err) {
    console.error(`LevelDB saveCanvasGraph 验证失败:`, err);
  }
  
  return key;
}

export async function getCanvasGraph(sessionId) {
  try {
    const key = `graph:${sessionId}`;
    const result = await db.get(key);
    console.log(`LevelDB getCanvasGraph: key=${key}, 节点数=${result.nodes?.length || 0}`);
    return result;
  } catch (err) {
    if (err.code === 'LEVEL_NOT_FOUND') {
      console.log(`LevelDB getCanvasGraph: key=graph:${sessionId} 不存在`);
      return null;
    }
    throw err;
  }
}

// 保存单个节点位置（用于实时更新）
export async function updateNodePosition(sessionId, nodeId, x, y) {
  const graph = await getCanvasGraph(sessionId);
  if (graph && graph.nodes) {
    const node = graph.nodes.find(n => n.id === nodeId);
    if (node) {
      node.x = x;
      node.y = y;
      await saveCanvasGraph(sessionId, graph);
    }
  }
}

export { db };
