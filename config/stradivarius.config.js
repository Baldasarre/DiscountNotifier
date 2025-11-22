module.exports = {
  api: {
    baseUrl:
      process.env.STRADIVARIUS_BASE_URL ||
      "https://www.stradivarius.com/itxrest",
    storeId: process.env.STRADIVARIUS_STORE_ID || "54009571",
    catalogId: process.env.STRADIVARIUS_CATALOG_ID || "50331068",
    languageId: process.env.STRADIVARIUS_LANGUAGE_ID || "-43",
    appId: process.env.STRADIVARIUS_APP_ID || "1",
  },
  scraping: {
    chunkSize: parseInt(process.env.STRADIVARIUS_CHUNK_SIZE) || 100,
    batchSize: parseInt(process.env.STRADIVARIUS_BATCH_SIZE) || 500,
    maxRetries: parseInt(process.env.STRADIVARIUS_MAX_RETRIES) || 3,
    delay: parseInt(process.env.STRADIVARIUS_DELAY) || 200,
    batchDelay: parseInt(process.env.STRADIVARIUS_BATCH_DELAY) || 2000,
    progressInterval:
      parseInt(process.env.STRADIVARIUS_PROGRESS_INTERVAL) || 100,
  },
  timeouts: {
    categoryRequest:
      parseInt(process.env.STRADIVARIUS_CATEGORY_TIMEOUT) || 15000,
    productRequest: parseInt(process.env.STRADIVARIUS_PRODUCT_TIMEOUT) || 30000,
  },
  headers: {
    "User-Agent":
      process.env.STRADIVARIUS_USER_AGENT || "PostmanRuntime/7.36.0",
    Accept: "*/*",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
  },
};
