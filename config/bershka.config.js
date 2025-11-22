module.exports = {
  api: {
    baseUrl:
      process.env.BERSHKA_BASE_URL ||
      "https://www.bershka.com/itxrest/3/catalog/store/44109521/40259537",
    storeId: process.env.BERSHKA_STORE_ID || "44109521",
    catalogId: process.env.BERSHKA_CATALOG_ID || "40259537",
    languageId: process.env.BERSHKA_LANGUAGE_ID || "-43",
    appId: process.env.BERSHKA_APP_ID || "1",
    fallbackCategoryId:
      process.env.BERSHKA_FALLBACK_CATEGORY_ID || "1010193546",
  },
  scraping: {
    chunkSize: parseInt(process.env.BERSHKA_CHUNK_SIZE) || 100,
    batchSize: parseInt(process.env.BERSHKA_BATCH_SIZE) || 500,
    maxRetries: parseInt(process.env.BERSHKA_MAX_RETRIES) || 3,
    delay: parseInt(process.env.BERSHKA_DELAY) || 500,
    chunkDelay: parseInt(process.env.BERSHKA_CHUNK_DELAY) || 3000,
    progressInterval: parseInt(process.env.BERSHKA_PROGRESS_INTERVAL) || 100,
  },
  timeouts: {
    categoryRequest: parseInt(process.env.BERSHKA_CATEGORY_TIMEOUT) || 15000,
    productRequest: parseInt(process.env.BERSHKA_PRODUCT_TIMEOUT) || 30000,
  },
  headers: {
    "User-Agent":
      process.env.BERSHKA_USER_AGENT ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    Accept: "application/json",
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    Referer: "https://www.bershka.com/",
    "Cache-Control": "no-cache",
  },
  brand: {
    name: "bershka",
    displayName: "Bershka",
    imageBaseUrl: "https://static.bershka.net",
  },
};
