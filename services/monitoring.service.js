const os = require("os");
const db = require("../config/database");
const { createServiceLogger } = require("../utils/logger");
const cache = require("../utils/cache");

const logger = createServiceLogger("monitoring");

class MonitoringService {
  constructor() {
    this.startTime = Date.now();
    this.requestCount = 0;
    this.errorCount = 0;
    this.responseTimeHistory = [];
    this.maxHistorySize = 250;

    this.activeUsers = new Map();
    this.userActivityWindow = 5 * 60 * 1000;

    this.requestBuckets = [];
    this.bucketDuration = 60 * 1000;
    this.maxBuckets = 360; 
    this.currentBucket = {
      timestamp: Date.now(),
      count: 0,
    };


    this.memoryPeak = 0;
    this.memoryPeakResetTime = Date.now();
    this.peakResetInterval = 6 * 60 * 60 * 1000; 
  }

  /**
   * Get process-specific metrics (this app only)
   */
  getSystemMetrics() {
    const usage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Calculate CPU percentage (approximation)
    const totalCPU = cpuUsage.user + cpuUsage.system;
    const cpuPercent = (totalCPU / 1000000 / os.cpus().length).toFixed(2);

    // Track memory peak
    const currentMemory = usage.heapUsed / 1024 / 1024; // MB
    const now = Date.now();

    // Reset peak every 6 hours
    if (now - this.memoryPeakResetTime >= this.peakResetInterval) {
      this.memoryPeak = currentMemory;
      this.memoryPeakResetTime = now;
    } else if (currentMemory > this.memoryPeak) {
      this.memoryPeak = currentMemory;
    }

    return {
      cpu: {
        usage: cpuPercent,
        cores: os.cpus().length,
        model: os.cpus()[0].model,
      },
      memory: {
        current: currentMemory.toFixed(2),
        peak: this.memoryPeak.toFixed(2),
        rss: (usage.rss / 1024 / 1024).toFixed(2),
      },
      uptime: {
        system: os.uptime(),
        app: Math.floor((Date.now() - this.startTime) / 1000),
        appFormatted: this.formatUptime(
          Math.floor((Date.now() - this.startTime) / 1000)
        ),
      },
      platform: {
        type: os.type(),
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
      },
    };
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats() {
    return new Promise((resolve, reject) => {
      const queries = {
        users: "SELECT COUNT(*) as count FROM users",
        verifiedUsers: "SELECT COUNT(*) as count FROM users WHERE verified = 1",
        zaraProducts: "SELECT COUNT(*) as count FROM zara_products WHERE 1=1",
        bershkaProducts: "SELECT COUNT(*) as count FROM bershka_unique_product_details",
        stradivariusProducts: "SELECT COUNT(DISTINCT reference) as count FROM stradivarius_unique_product_details",
        pullandbearProducts: "SELECT COUNT(*) as count FROM pullandbear_unique_product_details",
        massimoduttiProducts: "SELECT COUNT(*) as count FROM massimodutti_unique_product_details",
        hmProducts: "SELECT COUNT(*) as count FROM hm_products"
      };

      const results = {};
      const queryKeys = Object.keys(queries);
      let completed = 0;

      queryKeys.forEach((key) => {
        db.get(queries[key], [], (err, row) => {
          if (err) {
            logger.error(`Database stats error for ${key}:`, err);
            results[key] = 0;
          } else {
            results[key] = row.count || 0;
          }

          completed++;
          if (completed === queryKeys.length) {
            resolve(results);
          }
        });
      });
    });
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const stats = cache.getStats();
    const hitRates = cache.getHitRate();

    return {
      products: stats.products,
      images: stats.images,
      stats: stats.stats,
      hitRate: hitRates.overall,
      hitRates: hitRates,
      hits:
        (stats.products.hits || 0) +
        (stats.images.hits || 0) +
        (stats.stats.hits || 0),
      misses:
        (stats.products.misses || 0) +
        (stats.images.misses || 0) +
        (stats.stats.misses || 0),
    };
  }

  /**
   * Get API statistics
   */
  getApiStats() {
    const avgResponseTime =
      this.responseTimeHistory.length > 0
        ? (
            this.responseTimeHistory.reduce((a, b) => a + b, 0) /
            this.responseTimeHistory.length
          ).toFixed(2)
        : 0;

    return {
      totalRequests: this.requestCount,
      totalErrors: this.errorCount,
      errorRate:
        this.requestCount > 0
          ? ((this.errorCount / this.requestCount) * 100).toFixed(2)
          : 0,
      averageResponseTime: avgResponseTime,
      recentResponseTimes: this.responseTimeHistory.slice(-250),
    };
  }

  /**
   * Record API request
   */
  /**
   * Record user activity
   */
  recordUserActivity(userId) {
    if (userId) {
      this.activeUsers.set(userId, Date.now());
    }
  }

  /**
   * Remove user from active users (on logout)
   */
  removeUser(userId) {
    if (userId) {
      this.activeUsers.delete(userId);
      logger.info(`[MONITORING] User removed from active users: ${userId}`);
    }
  }

  /**
   * Get online users count (active in last 15 min)
   */
  getOnlineUsersCount() {
    const now = Date.now();
    const cutoff = now - this.userActivityWindow;

    // Clean up old users
    for (const [userId, lastActivity] of this.activeUsers.entries()) {
      if (lastActivity < cutoff) {
        this.activeUsers.delete(userId);
      }
    }

    return this.activeUsers.size;
  }

  recordRequest(responseTime, userId = null) {
    this.requestCount++;

    // Record user activity
    this.recordUserActivity(userId);

    // Update request bucket
    const now = Date.now();
    if (now - this.currentBucket.timestamp >= this.bucketDuration) {
      // Start new bucket
      this.requestBuckets.push({
        timestamp: this.currentBucket.timestamp,
        count: this.currentBucket.count,
      });

      // Limit bucket history
      if (this.requestBuckets.length > this.maxBuckets) {
        this.requestBuckets.shift();
      }

      this.currentBucket = {
        timestamp: now,
        count: 1,
      };
    } else {
      this.currentBucket.count++;
    }

    this.responseTimeHistory.push(responseTime);

    if (this.responseTimeHistory.length > this.maxHistorySize) {
      this.responseTimeHistory.shift();
    }
  }

  /**
   * Record API error
   */
  recordError() {
    this.errorCount++;
  }

  /**
   * Get request rate buckets for chart
   */
  getRequestBuckets() {
    return [...this.requestBuckets, this.currentBucket];
  }

  /**
   * Get complete monitoring dashboard data
   */
  async getDashboardData() {
    const [systemMetrics, dbStats] = await Promise.all([
      Promise.resolve(this.getSystemMetrics()),
      this.getDatabaseStats(),
    ]);

    return {
      system: systemMetrics,
      database: dbStats,
      cache: this.getCacheStats(),
      api: this.getApiStats(),
      onlineUsers: this.getOnlineUsersCount(),
      requestBuckets: this.getRequestBuckets(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Format uptime in human-readable format
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}g`);
    if (hours > 0) parts.push(`${hours}s`);
    if (minutes > 0) parts.push(`${minutes}d`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}sn`);

    return parts.join(" ");
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.requestCount = 0;
    this.errorCount = 0;
    this.responseTimeHistory = [];
    logger.info("Monitoring statistics reset");
  }
}

module.exports = new MonitoringService();
