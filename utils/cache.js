const NodeCache = require('node-cache');
const { createServiceLogger } = require('./logger');

const logger = createServiceLogger('cache');

class CacheManager {
  constructor() {
    // Product cache - 1 saat TTL
    this.productCache = new NodeCache({
      stdTTL: 3600, // 1 saat
      checkperiod: 600, // 10 dakikada bir temizlik
      useClones: false, // Memory optimization
      maxKeys: 1000 // Max 1000 farklı cache key
    });

    // Image cache - 24 saat TTL
    this.imageCache = new NodeCache({
      stdTTL: 86400, // 24 saat
      checkperiod: 3600,
      useClones: false,
      maxKeys: 5000 // Daha fazla image cache'lenebilir
    });

    // Stats cache - 30 dakika TTL
    this.statsCache = new NodeCache({
      stdTTL: 1800, // 30 dakika
      checkperiod: 300,
      useClones: false,
      maxKeys: 100
    });

    // Manual stats tracking
    this.stats = {
      products: { hits: 0, misses: 0 },
      images: { hits: 0, misses: 0 },
      stats: { hits: 0, misses: 0 }
    };

    // Event listeners for monitoring
    this.productCache.on('set', (key) => {
      logger.debug('Product cache set', { key });
    });

    this.productCache.on('del', (key) => {
      logger.debug('Product cache deleted', { key });
    });

    this.productCache.on('expired', (key) => {
      logger.debug('Product cache expired', { key });
    });

    logger.info('CacheManager initialized');
  }

  // Product list cache
  getCachedProducts(filters) {
    const key = this.generateCacheKey('products', filters);
    const cached = this.productCache.get(key);

    if (cached) {
      this.stats.products.hits++;
      logger.info('Product cache HIT', { key });
    } else {
      this.stats.products.misses++;
      logger.info('Product cache MISS', { key });
    }

    return cached;
  }

  setCachedProducts(filters, data) {
    const key = this.generateCacheKey('products', filters);
    this.productCache.set(key, data);
    logger.info('Products cached', { key, count: data.length });
  }

  // Image cache
  getCachedImage(url) {
    const key = `image:${url}`;
    const cached = this.imageCache.get(key);

    if (cached) {
      this.stats.images.hits++;
      logger.info('Image cache HIT', { url });
    } else {
      this.stats.images.misses++;
      logger.info('Image cache MISS', { url });
    }

    return cached;
  }

  setCachedImage(url, buffer) {
    const key = `image:${url}`;
    this.imageCache.set(key, buffer);
    logger.info('Image cached', { url, size: buffer.length });
  }

  // Stats cache
  getCachedStats(brand) {
    const key = `stats:${brand}`;
    const cached = this.statsCache.get(key);

    if (cached) {
      this.stats.stats.hits++;
    } else {
      this.stats.stats.misses++;
    }

    return cached;
  }

  setCachedStats(brand, data) {
    const key = `stats:${brand}`;
    this.statsCache.set(key, data);
    logger.debug('Stats cached', { brand });
  }

  // Invalidation methods
  invalidateProductCache() {
    const keys = this.productCache.keys();
    this.productCache.flushAll();
    this.stats.products = { hits: 0, misses: 0 };
    logger.info('Product cache invalidated', { keysCleared: keys.length });
  }

  invalidateImageCache() {
    const keys = this.imageCache.keys();
    this.imageCache.flushAll();
    this.stats.images = { hits: 0, misses: 0 };
    logger.info('Image cache invalidated', { keysCleared: keys.length });
  }

  invalidateStatsCache() {
    const keys = this.statsCache.keys();
    this.statsCache.flushAll();
    this.stats.stats = { hits: 0, misses: 0 };
    logger.info('Stats cache invalidated', { keysCleared: keys.length });
  }

  invalidateAllCache() {
    this.invalidateProductCache();
    this.invalidateImageCache();
    this.invalidateStatsCache();
    logger.info('All caches invalidated');
  }

  // Cache key generator
  generateCacheKey(prefix, params) {
    // Parametreleri sıralı string'e çevir
    const sortedParams = Object.keys(params || {})
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');

    return `${prefix}:${sortedParams || 'all'}`;
  }

  // Monitoring - cache istatistikleri
  getStats() {
    return {
      products: this.stats.products,
      images: this.stats.images,
      stats: this.stats.stats
    };
  }

  // Cache hit rate hesaplama
  getHitRate() {
    const calculateRate = (stats) => {
      const total = stats.hits + stats.misses;
      return total > 0 ? ((stats.hits / total) * 100).toFixed(2) : 0;
    };

    return {
      products: calculateRate(this.stats.products),
      images: calculateRate(this.stats.images),
      stats: calculateRate(this.stats.stats),
      overall: calculateRate({
        hits: this.stats.products.hits + this.stats.images.hits + this.stats.stats.hits,
        misses: this.stats.products.misses + this.stats.images.misses + this.stats.stats.misses
      })
    };
  }
}

module.exports = new CacheManager();
