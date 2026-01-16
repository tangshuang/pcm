import { v4 as uuidv4 } from 'uuid';
import { run, all } from '../memory/sqlite.js';

export class ApiPoller {
  constructor(services) {
    this.services = services;
    this.pollers = new Map();
    this.lastValues = new Map();
    this.init();
  }
  
  async init() {
    // Load existing API polling configurations
    const subscriptions = await all(
      'SELECT * FROM subscriptions WHERE type = ? AND status = ?',
      ['api', 'active']
    );

    for (const sub of subscriptions) {
      const config = JSON.parse(sub.config);
      this.startPolling(sub.id, config);
    }
  }
  
  async addPoller(data) {
    const { name, url, method = 'GET', headers = {}, interval = 60000, extractPath } = data;
    
    const id = uuidv4();
    const config = { name, url, method, headers, interval, extractPath };
    
    await run(
      'INSERT INTO subscriptions (id, type, config) VALUES (?, ?, ?)',
      [id, 'api', JSON.stringify(config)]
    );
    
    this.startPolling(id, config);
    
    this.services.broadcast('api_poller_added', { id, ...config });
    
    return id;
  }
  
  startPolling(id, config) {
    const poll = async () => {
      try {
        const response = await fetch(config.url, {
          method: config.method,
          headers: config.headers
        });
        
        const data = await response.json();
        const value = config.extractPath ? this.extractValue(data, config.extractPath) : data;

        // Detect changes
        const lastValue = this.lastValues.get(id);
        const hasChanged = JSON.stringify(lastValue) !== JSON.stringify(value);

        if (hasChanged) {
          this.lastValues.set(id, value);
          await this.processUpdate(id, config, value, lastValue);
        }

        await run(
          'UPDATE subscriptions SET last_check = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );
      } catch (err) {
        console.error(`API polling failed [${id}]:`, err.message);
      }
    };
    
    poll();
    
    const intervalId = setInterval(poll, config.interval);
    this.pollers.set(id, intervalId);
  }
  
  extractValue(data, path) {
    const keys = path.split('.');
    let value = data;
    for (const key of keys) {
      value = value?.[key];
    }
    return value;
  }
  
  async processUpdate(pollerId, config, newValue, oldValue) {
    const eventId = uuidv4();
    
    await run(
      'INSERT INTO environment_events (id, source, type, data) VALUES (?, ?, ?, ?)',
      [eventId, 'api_poller', 'value_changed', JSON.stringify({
        pollerId,
        name: config.name,
        url: config.url,
        newValue,
        oldValue,
        timestamp: Date.now()
      })]
    );
    
    this.services.broadcast('environment_event', {
      id: eventId,
      source: 'api_poller',
      type: 'value_changed',
      data: {
        name: config.name,
        newValue,
        oldValue,
        change: typeof newValue === 'number' && typeof oldValue === 'number'
          ? newValue - oldValue
          : null
      }
    });

    console.log(`📊 API data changed [${config.name}]: ${JSON.stringify(oldValue)} -> ${JSON.stringify(newValue)}`);
  }
  
  async removePoller(id) {
    const intervalId = this.pollers.get(id);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollers.delete(id);
    }
    
    this.lastValues.delete(id);
    
    await run('UPDATE subscriptions SET status = ? WHERE id = ?', ['inactive', id]);
    
    this.services.broadcast('api_poller_removed', { id });
  }
}
