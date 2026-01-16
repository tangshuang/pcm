import Parser from 'rss-parser';
import { v4 as uuidv4 } from 'uuid';
import { run, all } from '../memory/sqlite.js';

export class SubscriptionManager {
  constructor(services) {
    this.services = services;
    this.parser = new Parser();
    this.intervals = new Map();
    this.init();
  }
  
  async init() {
    // Load existing subscriptions
    const subscriptions = await all('SELECT * FROM subscriptions WHERE status = ?', ['active']);

    for (const sub of subscriptions) {
      const config = JSON.parse(sub.config);
      this.startPolling(sub.id, config);
    }
  }

  async addSubscription(data) {
    const { type, url, interval = 300000, name } = data; // Default 5 minutes

    const id = uuidv4();
    const config = { type, url, interval, name };

    await run(
      'INSERT INTO subscriptions (id, type, config) VALUES (?, ?, ?)',
      [id, type, JSON.stringify(config)]
    );

    this.startPolling(id, config);

    this.services.broadcast('subscription_added', { id, ...config });

    return id;
  }
  
  startPolling(id, config) {
    const poll = async () => {
      try {
        let data;
        
        if (config.type === 'rss') {
          data = await this.fetchRSS(config.url);
        } else if (config.type === 'webpage') {
          data = await this.fetchWebpage(config.url);
        }
        
        if (data) {
          await this.processUpdate(id, config, data);
        }
        
        await run(
          'UPDATE subscriptions SET last_check = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );
      } catch (err) {
        console.error(`Subscription update failed [${id}]:`, err.message);
      }
    };

    // Execute immediately once
    poll();

    // Set periodic polling
    const intervalId = setInterval(poll, config.interval);
    this.intervals.set(id, intervalId);
  }
  
  async fetchRSS(url) {
    const feed = await this.parser.parseURL(url);
    return {
      title: feed.title,
      items: feed.items.slice(0, 10).map(item => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        contentSnippet: item.contentSnippet?.slice(0, 200)
      }))
    };
  }
  
  async fetchWebpage(url) {
    const response = await fetch(url);
    const text = await response.text();
    return {
      url,
      contentLength: text.length,
      snippet: text.slice(0, 500),
      fetchedAt: Date.now()
    };
  }
  
  async processUpdate(subscriptionId, config, data) {
    const eventId = uuidv4();
    
    await run(
      'INSERT INTO environment_events (id, source, type, data) VALUES (?, ?, ?, ?)',
      [eventId, 'subscription', config.type, JSON.stringify({ subscriptionId, config, data })]
    );
    
    this.services.broadcast('environment_event', {
      id: eventId,
      source: 'subscription',
      type: config.type,
      data: {
        name: config.name,
        url: config.url,
        update: data
      }
    });
  }
  
  async removeSubscription(id) {
    const intervalId = this.intervals.get(id);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(id);
    }
    
    await run('UPDATE subscriptions SET status = ? WHERE id = ?', ['inactive', id]);
    
    this.services.broadcast('subscription_removed', { id });
  }
}
