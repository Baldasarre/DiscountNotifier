const axios = require("axios");
const fs = require("fs");
const db = require("../config/database");
const { dbManager } = require("../config/database");
const config = require("../config/bershka.config");
const { createServiceLogger } = require("../utils/logger");

const logger = createServiceLogger("bershka");

class BershkaService {
  constructor() {
    this.baseUrl = config.api.baseUrl;
    this.brand = config.brand.name;
    this.storeId = config.api.storeId;
    this.catalogId = config.api.catalogId;
    this.languageId = config.api.languageId;
    this.appId = config.api.appId;
    this.fallbackCategoryId = config.api.fallbackCategoryId;
    this.chunkSize = config.scraping.chunkSize;
    this.batchSize = config.scraping.batchSize;
    this.maxRetries = config.scraping.maxRetries;
    this.productDelay = config.scraping.delay;
    this.chunkDelay = config.scraping.chunkDelay;
    this.progressInterval = config.scraping.progressInterval;
    this.categoryTimeout = config.timeouts.categoryRequest;
    this.productTimeout = config.timeouts.productRequest;
    this.headers = config.headers;
    this.imageBaseUrl = config.brand.imageBaseUrl;
    this.allProductIds = new Set();

    this.initializeTables();
  }

  initializeTables() {
    logger.info("Creating Bershka database tables...");

    const tables = [
      {
        name: "bershka_categories",
        sql: `CREATE TABLE IF NOT EXISTS bershka_categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category_id TEXT UNIQUE NOT NULL,
                    product_count INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT 1,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
      },
      {
        name: "bershka_unique_products",
        sql: `CREATE TABLE IF NOT EXISTS bershka_unique_products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id TEXT UNIQUE NOT NULL,
                    categories TEXT NOT NULL,
                    category_count INTEGER DEFAULT 0,
                    is_processed BOOLEAN DEFAULT 0,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
      },
      {
        name: "bershka_unique_product_details",
        sql: `CREATE TABLE IF NOT EXISTS bershka_unique_product_details (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id TEXT UNIQUE NOT NULL,
                    reference TEXT NOT NULL,
                    name TEXT NOT NULL,
                    nameEn TEXT,
                    brand TEXT DEFAULT 'bershka',
                    price INTEGER NOT NULL,
                    old_price INTEGER,
                    currency TEXT DEFAULT 'TL',
                    availability TEXT,
                    colors TEXT,
                    color_name TEXT,
                    color_id TEXT,
                    image_url TEXT,
                    product_url TEXT,
                    category_id TEXT,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
      },
    ];

    tables.forEach((table) => {
      db.run(table.sql, (err) => {
        if (err) {
          logger.error(`Error creating ${table.name} table:`, err.message);
        } else {
          logger.info(`${table.name} table created successfully`);
        }
      });
    });

    // Create indexes
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_bershka_unique_product ON bershka_unique_products(product_id)",
      "CREATE INDEX IF NOT EXISTS idx_bershka_details_product ON bershka_unique_product_details(product_id)",
      "CREATE INDEX IF NOT EXISTS idx_bershka_details_reference ON bershka_unique_product_details(reference)",
      "CREATE INDEX IF NOT EXISTS idx_bershka_categories ON bershka_categories(category_id)",
    ];

    indexes.forEach((indexSql) => {
      db.run(indexSql, (err) => {
        if (err) {
          logger.error("Error creating index:", err.message);
        } else {
          logger.info("Index created successfully");
        }
      });
    });
  }

  async loadCategoriesFromFile() {
    try {
      const paths = [
        "bershka-test-data.json",
        "backup/bershka/bershka-test-data.json",
      ];

      let testDataPath = null;
      for (const path of paths) {
        if (fs.existsSync(path)) {
          testDataPath = path;
          break;
        }
      }

      if (!testDataPath) {
        throw new Error("bershka-test-data.json dosyası bulunamadı");
      }

      const testData = JSON.parse(fs.readFileSync(testDataPath, "utf8"));
      logger.info("Test verisi başarıyla okundu");

      const categories = this.extractCategoriesFromData(testData);
      return categories;
    } catch (error) {
      logger.error("Dosyadan kategori okuma hatası:", error.message);
      throw error;
    }
  }

  extractCategoriesFromData(data) {
    const allCategories = new Set();

    function extractCategories(obj) {
      if (typeof obj !== "object" || obj === null) return;

      if (obj.categories && typeof obj.categories === "string") {
        const cats = obj.categories.split(",").map((cat) => cat.trim());
        cats.forEach((cat) => {
          if (cat) allCategories.add(cat);
        });
      }

      for (const key in obj) {
        if (obj[key] && typeof obj[key] === "object") {
          extractCategories(obj[key]);
        }
      }
    }

    extractCategories(data);
    const uniqueCategories = Array.from(allCategories).sort();

    logger.info(`Toplam ${uniqueCategories.length} benzersiz kategori çıkarıldı`);
    return uniqueCategories;
  }

  async fetchCategoryProducts(categoryId) {
    try {
      const url = `${this.baseUrl}/category/${categoryId}/product?showProducts=true&showNoStock=true&appId=1&languageId=-43&locale=tr_TR`;

      const response = await axios.get(url, {
        headers: this.headers,
        timeout: this.categoryTimeout,
      });

      if (response.data && response.data.productIds) {
        const productIds = response.data.productIds;
        logger.info(`Kategori ${categoryId}: ${productIds.length} ürün bulundu`);

        productIds.forEach((id) => this.allProductIds.add(id));

        return {
          categoryId,
          productCount: productIds.length,
          productIds: productIds,
          success: true,
        };
      } else {
        return {
          categoryId,
          productCount: 0,
          productIds: [],
          success: false,
          error: "productIds field not found",
        };
      }
    } catch (error) {
      logger.error(`Kategori ${categoryId} hata: ${error.message}`);
      return {
        categoryId,
        productCount: 0,
        productIds: [],
        success: false,
        error: error.message,
      };
    }
  }

  async fetchAllCategoriesProducts() {
    try {
      const categories = await this.loadCategoriesFromFile();
      logger.info(`${categories.length} kategori için ürün listeleri çekiliyor...`);

      const results = [];
      let successCount = 0;
      let totalProducts = 0;

      for (let i = 0; i < categories.length; i++) {
        const categoryId = categories[i];
        const result = await this.fetchCategoryProducts(categoryId);
        results.push(result);

        if (result.success) {
          successCount++;
          totalProducts += result.productCount;
        }

        if ((i + 1) % 50 === 0) {
          logger.info(`İlerleme: ${i + 1}/${categories.length} kategori tamamlandı`);
          logger.info(`Şu ana kadar toplanan benzersiz ürün: ${this.allProductIds.size}`);

          const batchResults = results.slice(i - 49, i + 1);
          await this.saveProductIdsToDatabase(batchResults);
        }

        await this._delay(this.productDelay);
      }

      const remainingStart = Math.floor(results.length / 50) * 50;
      if (remainingStart < results.length) {
        const remainingResults = results.slice(remainingStart);
        await this.saveProductIdsToDatabase(remainingResults);
      }

      const uniqueProductCount = this.allProductIds.size;

      logger.info("Özet:");
      logger.info(`Başarılı kategoriler: ${successCount}/${categories.length}`);
      logger.info(`Toplam ürün sayısı (tekrarlı): ${totalProducts}`);
      logger.info(`Benzersiz ürün sayısı: ${uniqueProductCount}`);

      return {
        summary: {
          totalCategories: categories.length,
          successfulCategories: successCount,
          totalProductsWithDuplicates: totalProducts,
          uniqueProducts: uniqueProductCount,
          timestamp: new Date().toISOString(),
        },
        allUniqueProductIds: Array.from(this.allProductIds),
        categoryResults: results,
      };
    } catch (error) {
      logger.error("Genel hata:", error.message);
      throw error;
    }
  }

  async saveProductIdsToDatabase(categoryResults) {
    return new Promise((resolve, reject) => {
      if (!categoryResults || categoryResults.length === 0) {
        resolve(0);
        return;
      }

      const uniqueProductsMap = new Map();

      categoryResults.forEach((result) => {
        if (
          result.success &&
          result.productIds &&
          result.productIds.length > 0
        ) {
          result.productIds.forEach((productId) => {
            const productIdStr = productId.toString();
            if (!uniqueProductsMap.has(productIdStr)) {
              uniqueProductsMap.set(productIdStr, new Set());
            }
            uniqueProductsMap.get(productIdStr).add(result.categoryId);
          });
        }
      });

      const insertQuery = `
                INSERT OR REPLACE INTO bershka_unique_products (
                    product_id, categories, category_count, is_processed, last_updated, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
            `;

      const stmt = db.prepare(insertQuery);
      let savedCount = 0;

      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        uniqueProductsMap.forEach((categorySet, productId) => {
          const categories = Array.from(categorySet).join(",");
          const categoryCount = categorySet.size;
          const now = new Date().toISOString();

          stmt.run(
            [productId, categories, categoryCount, 0, now, now],
            function (err) {
              if (err) {
                logger.error(`Unique ürün kaydetme hatası (${productId}):`, err.message);
              } else {
                savedCount++;
              }
            }
          );
        });

        db.run("COMMIT", (err) => {
          stmt.finalize();
          if (err) {
            logger.error("Transaction commit hatası:", err.message);
            reject(err);
          } else {
            logger.info(`${savedCount} unique ürün veritabanına kaydedildi`);
            resolve(savedCount);
          }
        });
      });
    });
  }

  _chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _extractColorsFromProduct(product) {
    if (!product) return [];

    if (
      product.bundleProductSummaries &&
      product.bundleProductSummaries.length > 0
    ) {
      const firstBundle = product.bundleProductSummaries[0];

      if (
        firstBundle.detail &&
        firstBundle.detail.colors &&
        Array.isArray(firstBundle.detail.colors)
      ) {
        return firstBundle.detail.colors;
      }

      if (firstBundle.colors && Array.isArray(firstBundle.colors)) {
        return firstBundle.colors;
      }
    }

    if (product.colors && Array.isArray(product.colors)) {
      return product.colors;
    }

    return [];
  }

  _extractReferenceFromProduct(product, colorsArray) {
    if (!product || !colorsArray || colorsArray.length === 0) {
      return null;
    }

    const firstColor = colorsArray[0];

    if (firstColor.image && firstColor.image.url) {
      const url = firstColor.image.url;
      const match = url.match(/\/p\/(\d+\/\d+\/\d+)\//);
      if (match) {
        return match[1];
      }
    }

    if (firstColor.reference) {
      const refMatch = firstColor.reference.match(/^C[01](\d+)-I\d{4}$/);
      if (refMatch) {
        const digits = refMatch[1];
        if (digits.length >= 9) {
          return `${digits.slice(0, 4)}/${digits.slice(4, 7)}/${digits.slice(
            -3
          )}`;
        }
      }
    }

    return null;
  }

  _calculateProductPrice(colorsArray) {
    if (!colorsArray || colorsArray.length === 0) return null;

    const firstColor = colorsArray[0];
    if (!firstColor.sizes || firstColor.sizes.length === 0) return null;

    const firstSize = firstColor.sizes[0];
    if (firstSize.price) {
      return Math.round(parseInt(firstSize.price));
    }
    return null;
  }

  _calculateColorSpecificPrice(color) {
    if (!color) return null;

    if (color.sizes && color.sizes.length > 0) {
      const firstSize = color.sizes[0];
      if (firstSize.price) {
        return Math.round(parseInt(firstSize.price));
      }
    }

    return null;
  }

  _extractReferenceFromColor(color) {
    if (!color) return null;

    if (color.image && color.image.url) {
      const url = color.image.url;
      const match = url.match(/\/p\/(\d+\/\d+\/\d+)\//);
      if (match) {
        return match[1];
      }
    }

    if (color.reference) {
      const refMatch = color.reference.match(/^C[01](\d+)-I\d{4}$/);
      if (refMatch) {
        const digits = refMatch[1];
        if (digits.length >= 9) {
          return `${digits.slice(0, 4)}/${digits.slice(4, 7)}/${digits.slice(
            -3
          )}`;
        }
      }
    }

    return null;
  }

  _buildProcessedProduct(product, color, reference, price, allColorsArray) {
    const productUrl = `https://www.bershka.com/tr/product/${product.id}`;
    const imageUrl = this._buildImageUrl(product, color);
    const catentryIds = [];

    if (allColorsArray && allColorsArray.length > 1) {
      for (const otherColor of allColorsArray) {
        if (otherColor.id !== color.id && otherColor.catentryId) {
          catentryIds.push({
            id: otherColor.id.toString(),
            name: otherColor.name || "",
            catentryId: otherColor.catentryId.toString(),
          });
        }
      }
    }

    const actualProductId = color.catentryId
      ? color.catentryId.toString()
      : product.id.toString();

    return {
      product_id: actualProductId,
      reference: reference,
      name: product.name || "",
      nameEn: product.nameEn || "",
      brand: "bershka",
      price: price,
      old_price: null,
      currency: "TL",
      availability: null,
      colors: JSON.stringify([
        {
          id: color.id,
          name: color.name,
        },
      ]),
      color_name: color.name || "",
      color_id: color.id || "",
      image_url: imageUrl,
      product_url: productUrl,
      category_id: null,
      catentryIds: JSON.stringify(catentryIds),
    };
  }

  _buildImageUrl(product, color) {
    let xmediaArray = null;
    if (
      product.bundleProductSummaries &&
      product.bundleProductSummaries.length > 0
    ) {
      const firstBundle = product.bundleProductSummaries[0];
      if (
        firstBundle.detail &&
        firstBundle.detail.xmedia &&
        firstBundle.detail.xmedia.length > 0
      ) {
        xmediaArray = firstBundle.detail.xmedia;
      }
    }

    if (xmediaArray && color.image && color.image.url) {
      const colorPath = color.image.url.replace(/\/[^\/]*$/, "");

      const matchingXmedia = xmediaArray.find(
        (xmediaItem) => xmediaItem.path === colorPath
      );

      if (
        matchingXmedia &&
        matchingXmedia.xmediaItems &&
        matchingXmedia.xmediaItems.length > 0
      ) {
        for (const xmediaItemContent of matchingXmedia.xmediaItems) {
          if (xmediaItemContent.medias && xmediaItemContent.medias.length > 0) {
            const a4oMedia = xmediaItemContent.medias.find(
              (media) =>
                media.extraInfo && media.extraInfo.originalName === "a4o"
            );
            if (
              a4oMedia &&
              a4oMedia.extraInfo &&
              a4oMedia.extraInfo.deliveryUrl
            ) {
              return a4oMedia.extraInfo.deliveryUrl;
            }

            const anyMediaWithDelivery = xmediaItemContent.medias.find(
              (media) => media.extraInfo && media.extraInfo.deliveryUrl
            );
            if (
              anyMediaWithDelivery &&
              anyMediaWithDelivery.extraInfo.deliveryUrl
            ) {
              return anyMediaWithDelivery.extraInfo.deliveryUrl;
            }
          }
        }
      }
    }

    if (color.image && color.image.url) {
      const baseUrl = this.imageBaseUrl;
      const url = color.image.url;

      if (url.includes("://")) {
        return url;
      }

      const fallbackUrl = baseUrl + url.replace(/\?.*$/, "");
      return fallbackUrl;
    }

    return null;
  }

  async _processProductsWithUniqueColors(products) {
    if (!products || products.length === 0) return [];

    logger.info(`${products.length} ürün renk varyantları ile işleniyor...`);
    logger.info("Her 100 üründe ilerleme raporu verilecek...");

    const processedProducts = [];
    let processedCount = 0;

    for (const product of products) {
      try {
        const colorsArray = this._extractColorsFromProduct(product);

        if (colorsArray.length === 0) {
          continue;
        }

        const reference = this._extractReferenceFromProduct(
          product,
          colorsArray
        );
        if (!reference) {
          continue;
        }

        const price = this._calculateProductPrice(colorsArray);
        if (!price) {
          continue;
        }

        for (const color of colorsArray) {
          const colorPrice = this._calculateColorSpecificPrice(color) || price;
          const colorReference =
            this._extractReferenceFromColor(color) || reference;

          const processedProduct = this._buildProcessedProduct(
            product,
            color,
            colorReference,
            colorPrice,
            colorsArray
          );

          if (
            processedProduct.name &&
            processedProduct.reference &&
            processedProduct.price
          ) {
            processedProducts.push(processedProduct);
          }
        }

        processedCount++;
        if (processedCount % 100 === 0) {
          logger.info(`İlerleme: ${processedCount}/${products.length} ürün işlendi (${processedProducts.length} renk varyantı)`);
        }
      } catch (error) {
        logger.error("Ürün işleme hatası (${product.id}):", error.message);
        continue;
      }
    }

    if (products.length <= 100 || processedCount % 100 !== 0) {
      logger.info(`İlerleme: ${processedCount}/${products.length} ürün işlendi (${processedProducts.length} renk varyantı)`);
    }

    logger.info(`${processedProducts.length} renk varyantı işlendi`);
    return processedProducts;
  }

  async saveUniqueProductDetails(processedProducts) {
    if (!processedProducts || processedProducts.length === 0) {
      logger.warn("Kaydedilecek ürün detayı yok");
      return 0;
    }

    logger.info(`${processedProducts.length} ürün detayı (renk varyantları) veritabanına kaydediliyor...`);

    const insertQuery = `
            INSERT OR REPLACE INTO bershka_unique_product_details (
                product_id, reference, name, nameEn, brand, price, old_price, 
                currency, availability, colors, color_name, color_id, image_url, product_url, catentryIds, last_updated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;

    let savedCount = 0;

    for (const product of processedProducts) {
      try {
        await new Promise((resolve, reject) => {
          db.run(
            insertQuery,
            [
              product.product_id,
              product.reference,
              product.name,
              product.nameEn,
              product.brand,
              product.price,
              product.old_price,
              product.currency,
              product.availability,
              product.colors,
              product.color_name,
              product.color_id,
              product.image_url,
              product.product_url,
              product.catentryIds,
            ],
            function (err) {
              if (err) {
                reject(err);
              } else {
                savedCount++;
                resolve();
              }
            }
          );
        });
      } catch (error) {
        logger.error(`Ürün kaydetme hatası (${product.product_id}):`, error.message);
      }
    }

    logger.info(`${savedCount} ürün detayı veritabanına kaydedildi`);
    return savedCount;
  }

  async fetchProductDetails(productIds) {
    if (!productIds || productIds.length === 0) return [];

    try {
      const productIdsParam = productIds.join("%2C");
      const url = `${this.baseUrl}/productsArray?productIds=${productIdsParam}&appId=1&languageId=-43&locale=tr_TR`;

      logger.info(`🌐 [BERSHKA API] Fetching: ${url}`);

      const response = await axios.get(url, {
        headers: this.headers,
        timeout: this.productTimeout,
      });

      if (response.data && response.data.products) {
        logger.info(`✅ [BERSHKA API] Found ${response.data.products.length} product(s)`);
        return response.data.products;
      }

      logger.warn(`⚠️ [BERSHKA API] No products found in response`);
      return [];
    } catch (error) {
      logger.error(`❌ [BERSHKA API] Fetch error: ${error.message}`);
      return [];
    }
  }

  async loadProductIdsFromDatabase() {
    logger.info("Bershka unique products tablosundan ürün ID'leri yükleniyor...");

    return new Promise((resolve, reject) => {
      db.all(
        "SELECT product_id FROM bershka_unique_products ORDER BY id",
        (err, rows) => {
          if (err) {
            logger.error("Veritabanı okuma hatası:", err.message);
            reject(err);
          } else {
            const productIds = rows.map((row) => row.product_id);
            logger.info(`Bershka unique products tablosundan ${productIds.length} unique ürün ID'si yüklendi`);
            resolve(productIds);
          }
        }
      );
    });
  }

  async getProductDetails(productIds) {
    if (!productIds || productIds.length === 0) return [];

    logger.info(`${productIds.length} ürün ${Math.ceil(
        productIds.length / this.chunkSize
      )} chunk'ta işlenecek (chunk boyutu: ${this.chunkSize})...`);

    const allProducts = [];
    const totalChunks = Math.ceil(productIds.length / this.chunkSize);

    for (let i = 0; i < productIds.length; i += this.chunkSize) {
      const chunk = productIds.slice(i, i + this.chunkSize);
      const chunkIndex = Math.floor(i / this.chunkSize) + 1;

      logger.info(`Chunk ${chunkIndex}/${totalChunks} işleniyor (${chunk.length} ürün)...`);

      try {
        const chunkProducts = await this.fetchProductDetails(chunk);
        allProducts.push(...chunkProducts);
        logger.info(`${chunkProducts.length} ürün detayı alındı (Toplam: ${allProducts.length})`);

        if (i + this.chunkSize < productIds.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.productDelay)
          );
        }
      } catch (error) {
        logger.error(`Chunk ${chunkIndex} hatası:`, error.message);
      }
    }

    logger.info(`Toplam ${allProducts.length} ürün detayı alındı`);
    return allProducts;
  }

  async scrapeAll() {
    logger.info("Bershka tam scraping başlatılıyor...");

    try {
      logger.info("1. AŞAMA: Kategoriler ve ürün ID'leri çekiliyor...");
      await this.fetchAllCategoriesProducts();

      const allProductIds = await this.loadProductIdsFromDatabase();

      if (allProductIds.length === 0) {
        logger.info("Kategori scraping tamamlandı ama ürün ID'si bulunamadı.");
        return;
      }

      logger.info(`Toplam ${allProductIds.length} unique ürün ID'si veritabanında`);
      logger.info("2. AŞAMA: Ürün detayları ve renk varyantları çekiliyor...");

      const totalBatches = Math.ceil(allProductIds.length / this.batchSize);

      logger.info(`${allProductIds.length} ürün, ${this.batchSize}'lük batch'ler halinde işlenecek...`);
      logger.info(`${totalBatches} batch oluşturuldu\n`);

      let totalProcessed = 0;

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * this.batchSize;
        const endIndex = Math.min(
          startIndex + this.batchSize,
          allProductIds.length
        );
        const batchProductIds = allProductIds.slice(startIndex, endIndex);

        logger.info(`BATCH ${batchIndex + 1}/${totalBatches} işleniyor (${
            batchProductIds.length
          } ürün)...`);

        try {
          const batchProducts = await this.getProductDetails(batchProductIds);

          if (batchProducts.length === 0) {
            logger.info(`Batch ${batchIndex + 1}: API'den ürün detayı alınamadı`);
            continue;
          }

          const batchProcessedProducts =
            await this._processProductsWithUniqueColors(batchProducts);

          if (batchProcessedProducts.length === 0) {
            logger.info(`Batch ${batchIndex + 1}: İşlenecek ürün bulunamadı`);
            continue;
          }

          const savedCount = await this.saveUniqueProductDetails(
            batchProcessedProducts
          );
          totalProcessed += savedCount;

          logger.info(`Batch ${
              batchIndex + 1
            }/${totalBatches} tamamlandı: ${savedCount} ürün kaydedildi`);
          logger.info(`Toplam işlenen: ${totalProcessed} ürün\n`);

          if (batchIndex < totalBatches - 1) {
            logger.info(`Batch arası bekleme: ${this.chunkDelay}ms...`);
            await new Promise((resolve) =>
              setTimeout(resolve, this.chunkDelay)
            );
          }
        } catch (error) {
          logger.error(`Batch ${batchIndex + 1} hatası:`, error.message);
          continue;
        }
      }

      logger.info("\nBershka scraping tamamlandı!");
      logger.info("ÖZET SONUÇ: {");
      logger.info(`totalUniqueProducts: ${allProductIds.length},`);
      logger.info(`totalProcessedProducts: ${totalProcessed}`);
      logger.info("}");
    } catch (error) {
      logger.error("Scraping genel hatası:", error.message);
      throw error;
    }
  }

  async scrapeAllProductDetails() {
    try {
      const startTime = Date.now();
      logger.info("Bershka ürün detayları scraping başlatılıyor (BATCH MODE)...");
      const allProductIds = await this.loadProductIdsFromDatabase();

      if (allProductIds.length === 0) {
        throw new Error("Veritabanında ürün ID'si bulunamadı");
      }

      logger.info(`${allProductIds.length} unique ürün için detay scraping başlatılıyor...`);

      const totalBatches = Math.ceil(allProductIds.length / this.batchSize);
      let totalProcessed = 0;

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * this.batchSize;
        const endIndex = Math.min(
          startIndex + this.batchSize,
          allProductIds.length
        );
        const batchProductIds = allProductIds.slice(startIndex, endIndex);

        logger.info(`BATCH ${batchIndex + 1}/${totalBatches} işleniyor (${
            batchProductIds.length
          } ürün)...`);

        try {
          const batchProducts = await this.getProductDetails(batchProductIds);

          if (batchProducts.length === 0) {
            logger.info(`Batch ${batchIndex + 1}: API'den ürün detayı alınamadı`);
            continue;
          }

          const batchProcessedProducts =
            await this._processProductsWithUniqueColors(batchProducts);

          if (batchProcessedProducts.length === 0) {
            logger.info(`Batch ${batchIndex + 1}: İşlenecek ürün bulunamadı`);
            continue;
          }

          const savedCount = await this.saveUniqueProductDetails(
            batchProcessedProducts
          );
          totalProcessed += savedCount;

          logger.info(`Batch ${
              batchIndex + 1
            }/${totalBatches} tamamlandı: ${savedCount} ürün kaydedildi`);
          logger.info(`Toplam işlenen: ${totalProcessed} ürün\n`);

          if (batchIndex < totalBatches - 1) {
            logger.info(`Batch arası bekleme: ${this.chunkDelay}ms...`);
            await new Promise((resolve) =>
              setTimeout(resolve, this.chunkDelay)
            );
          }
        } catch (error) {
          logger.error(`Batch ${batchIndex + 1} hatası:`, error.message);
          continue;
        }
      }

      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);

      const result = {
        success: true,
        totalUniqueProducts: allProductIds.length,
        totalProcessedProducts: totalProcessed,
        duration: `${duration} seconds`,
        timestamp: new Date().toISOString(),
      };

      logger.info("Bershka ürün detayları scraping tamamlandı!");
      logger.info("ÖZET SONUÇ:", result);

      return result;
    } catch (error) {
      logger.error("Bershka ürün detayları scraping hatası:", error.message);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Fetch single product from API and save to DB
   * @param {string} productId - Product ID
   * @param {string} colorId - Color ID (optional)
   * @returns {Promise<Object|null>} Formatted product or null
   */
  async fetchSingleProduct(productId, colorId = null) {
    logger.info(`🔍 [API] Fetching single Bershka product: ${productId}`);

    const startTime = Date.now();

    try {
      const products = await this.fetchProductDetails([productId]);

      if (!products || products.length === 0) {
        logger.error(`❌ [API] Bershka product ${productId} not found`);
        return null;
      }

      logger.info(`✅ [API] Product fetched in ${Date.now() - startTime}ms`);

      const processedProducts = await this._processProductsWithUniqueColors(products);

      if (!processedProducts || processedProducts.length === 0) {
        logger.error(`❌ [API] Failed to process product ${productId}`);
        return null;
      }

      const savedCount = await this.saveUniqueProductDetails(processedProducts);
      logger.info(`💾 Saved ${savedCount} color variant(s) to DB`);

      logger.info(`⏱️ Total fetchSingleProduct time: ${Date.now() - startTime}ms`);

      return processedProducts[0];

    } catch (error) {
      logger.error(`❌ [API] Error fetching product ${productId}:`, error.message);
      return null;
    }
  }
}

module.exports = BershkaService;

if (require.main === module) {
  const service = new BershkaService();
  const arg = process.argv[2];

  if (arg === "all") {
    logger.info("Bershka tam veri tarama başlatılıyor...");
    service
      .scrapeAll()
      .then(() => {
        logger.info("Bershka tam veri tarama tamamlandı.");
        process.exit(0);
      })
      .catch((error) => {
        logger.error("Bershka tarama hatası:", error);
        process.exit(1);
      });
  } else if (arg === "details") {
    logger.info("Bershka ürün detayları tarama başlatılıyor...");
    service
      .scrapeAllProductDetails()
      .then(() => {
        logger.info("Bershka ürün detayları tarama tamamlandı.");
        process.exit(0);
      })
      .catch((error) => {
        logger.error("Bershka ürün detayları tarama hatası:", error);
        process.exit(1);
      });
  } else {
    logger.info("Kullanım: node services/bershka.service.js [all|details]");
    logger.info("all - Tüm kategoriler ve ürün ID leri tara");
    logger.info("details - Var olan ürün ID leri için renk detayları tara");
  }
}