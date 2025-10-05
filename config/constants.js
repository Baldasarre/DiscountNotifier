
module.exports = {
  // API Request Timeouts (milliseconds)
  TIMEOUTS: {
    API_REQUEST: 30000,        // 30 seconds for external API calls
    DATABASE_QUERY: 10000,     // 10 seconds for database operations
  },

  // Session Configuration
  SESSION: {
    MAX_AGE: 24 * 60 * 60 * 1000,  // 24 hours
    SECRET: process.env.SESSION_SECRET || "fallback-secret-key",
  },

  // Rate Limiting
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000,  // 15 minutes
    MAX_REQUESTS: 150,           // Max requests per window
  },

  // Compression Settings
  COMPRESSION: {
    LEVEL: 6,                    // 0-9 compression level (6 = balanced)
    THRESHOLD: 1024,             // 1KB - don't compress smaller responses
  },

  // Cache Configuration
  CACHE: {
    PRODUCT_TTL: 5 * 60 * 1000,      // 5 minutes
    IMAGE_TTL: 24 * 60 * 60 * 1000,  // 24 hours
    STATS_TTL: 2 * 60 * 1000,        // 2 minutes
  },

  // Scraper Delays
  SCRAPER: {
    CHUNK_SIZE: 50,              // Process items in chunks of 50
    DELAY_BETWEEN_CHUNKS: 2000,  // 2 seconds between chunks
    DELAY_BETWEEN_REQUESTS: 100, // 100ms between individual requests
  },

  // Code Verification
  VERIFICATION: {
    CODE_LENGTH: 6,
    CODE_VALIDITY_SECONDS: 300,  // 5 minutes
    MAX_ATTEMPTS: 3,
  },

  // Tracking Limits
  TRACKING: {
    FREE_LIMIT: 10,              // Free users can track 10 products
    PREMIUM_LIMIT: 100,          // Premium users can track 100 products
  },
};
