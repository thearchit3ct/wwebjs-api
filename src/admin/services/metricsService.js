const os = require('os');
const { broadcastSystemMetrics } = require('../utils/websocketIntegration');
const { logger } = require('../../logger');

class MetricsService {
  constructor() {
    this.interval = null;
  }

  start() {
    // Send metrics every 5 seconds
    this.interval = setInterval(() => {
      this.collectAndBroadcast();
    }, 5000);
    
    logger.info('Admin metrics service started');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    logger.info('Admin metrics service stopped');
  }

  collectAndBroadcast() {
    try {
      const metrics = {
        cpu: {
          usage: this.getCPUUsage(),
          cores: os.cpus().length,
        },
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
          usage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };

      broadcastSystemMetrics(metrics);
    } catch (error) {
      logger.error('Failed to collect metrics', { error: error.message });
    }
  }

  getCPUUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~((idle / total) * 100);

    return usage;
  }
}

module.exports = new MetricsService();