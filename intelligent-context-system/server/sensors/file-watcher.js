import chokidar from 'chokidar';
import { v4 as uuidv4 } from 'uuid';
import { run } from '../memory/sqlite.js';

export class FileWatcher {
  constructor(services) {
    this.services = services;
    this.watchers = new Map();
    this.init();
  }
  
  init() {
    const watchPaths = process.env.WATCH_PATHS?.split(',').map(p => p.trim()) || [];
    
    for (const path of watchPaths) {
      this.addWatcher(path);
    }
  }
  
  addWatcher(path) {
    if (this.watchers.has(path)) return;
    
    const watcher = chokidar.watch(path, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });
    
    watcher.on('add', (filePath) => this.handleEvent('file_added', path, filePath));
    watcher.on('change', (filePath) => this.handleEvent('file_changed', path, filePath));
    watcher.on('unlink', (filePath) => this.handleEvent('file_deleted', path, filePath));

    this.watchers.set(path, watcher);
    console.log(`👁️ Watching directory: ${path}`);
  }

  async handleEvent(type, watchPath, filePath) {
    const eventId = uuidv4();
    const eventData = {
      watchPath,
      filePath,
      timestamp: Date.now()
    };

    // Save to database
    await run(
      'INSERT INTO environment_events (id, source, type, data) VALUES (?, ?, ?, ?)',
      [eventId, 'file_watcher', type, JSON.stringify(eventData)]
    );

    // Broadcast event
    this.services.broadcast('environment_event', {
      id: eventId,
      source: 'file_watcher',
      type,
      data: eventData
    });

    console.log(`📁 File event: ${type} - ${filePath}`);
  }
  
  removeWatcher(path) {
    const watcher = this.watchers.get(path);
    if (watcher) {
      watcher.close();
      this.watchers.delete(path);
    }
  }
}
