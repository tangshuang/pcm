import sqlite3 from 'sqlite3';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

const dbPath = process.env.SQLITE_PATH || './data/sqlite/main.db';

let db = null;

export async function initDatabase() {
  await mkdir(dirname(dbPath), { recursive: true });
  
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, async (err) => {
      if (err) return reject(err);
      
      await runMigrations();
      resolve(db);
    });
  });
}

async function runMigrations() {
  const migrations = [
    // 用户画像表
    `CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      name TEXT,
      preferences TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // 会话表
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT,
      status TEXT DEFAULT 'active',
      context_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user_profiles(id)
    )`,
    
    // 任务表
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      type TEXT,
      status TEXT DEFAULT 'pending',
      priority INTEGER DEFAULT 0,
      input TEXT,
      output TEXT,
      progress INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )`,
    
    // 环境订阅表
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      type TEXT,
      config TEXT,
      last_check DATETIME,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // 环境事件表
    `CREATE TABLE IF NOT EXISTS environment_events (
      id TEXT PRIMARY KEY,
      source TEXT,
      type TEXT,
      data TEXT,
      processed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // 意图表
    `CREATE TABLE IF NOT EXISTS intents (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      user_message_id TEXT,
      intent_type TEXT,
      topic TEXT,
      urgency TEXT DEFAULT 'medium',
      related_topics TEXT,
      confidence REAL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )`
  ];
  
  for (const sql of migrations) {
    await run(sql);
  }
}

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export { db };
