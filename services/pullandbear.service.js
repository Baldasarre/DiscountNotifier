const axios = require("axios");
const db = require("../config/database");
const config = require("../config/pullandbear.config");
const { createServiceLogger } = require("../utils/logger");

const logger = createServiceLogger("pullandbear");

class PullAndBearService {
  constructor() {
    this.baseUrl = config.api.baseUrl;
    this.brand = config.brand.name;
    this.storeId = config.api.storeId;
    this.catalogId = config.api.catalogId;
    this.languageId = config.api.languageId;
    this.appId = config.api.appId;
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
    logger.info("Creating Pull&Bear database tables...");

    const tables = [
      {
        name: "pullandbear_categories",
        sql: `CREATE TABLE IF NOT EXISTS pullandbear_categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category_id TEXT UNIQUE NOT NULL,
                    product_count INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT 1,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
      },
      {
        name: "pullandbear_unique_products",
        sql: `CREATE TABLE IF NOT EXISTS pullandbear_unique_products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id TEXT UNIQUE NOT NULL,
                    categories TEXT,
                    category_count INTEGER DEFAULT 0,
                    is_processed BOOLEAN DEFAULT 0,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
      },
      {
        name: "pullandbear_unique_product_details",
        sql: `CREATE TABLE IF NOT EXISTS pullandbear_unique_product_details (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id TEXT NOT NULL,
                    reference TEXT,
                    name TEXT,
                    nameEn TEXT,
                    brand TEXT DEFAULT 'pullandbear',
                    price REAL,
                    old_price REAL,
                    currency TEXT DEFAULT 'TRY',
                    availability TEXT DEFAULT 'in_stock',
                    colors TEXT,
                    color_name TEXT,
                    color_id TEXT,
                    image_url TEXT,
                    product_url TEXT,
                    category_id TEXT,
                    catentryIds TEXT,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
      },
    ];

    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_pullandbear_product_id ON pullandbear_unique_product_details(product_id)`,
      `CREATE INDEX IF NOT EXISTS idx_pullandbear_reference ON pullandbear_unique_product_details(reference)`,
      `CREATE INDEX IF NOT EXISTS idx_pullandbear_category ON pullandbear_unique_product_details(category_id)`,
      `CREATE INDEX IF NOT EXISTS idx_pullandbear_color_id ON pullandbear_unique_product_details(color_id)`,
    ];

    tables.forEach(({ name, sql }) => {
      db.run(sql, (err) => {
        if (err) {
          logger.error(`Error creating ${name} table:`, err.message);
        } else {
          logger.info(`${name} table created successfully`);
        }
      });
    });

    indexes.forEach((indexSql, idx) => {
      db.run(indexSql, (err) => {
        if (err) {
          logger.error(`Error creating index ${idx + 1}:`, err.message);
        } else {
          logger.info(`Index created successfully`);
        }
      });
    });

    // Create FTS5 virtual table for full-text search
    const ftsTable = `
      CREATE VIRTUAL TABLE IF NOT EXISTS pullandbear_products_fts
      USING fts5(
        product_id UNINDEXED,
        name,
        nameEn,
        reference UNINDEXED,
        color_name,
        tokenize = 'unicode61 remove_diacritics 2'
      )
    `;

    db.run(ftsTable, (err) => {
      if (err) {
        logger.error("Error creating FTS table:", err.message);
      } else {
        logger.info("FTS table created successfully");

        // Create triggers to keep FTS in sync with main table
        const triggers = [
          `CREATE TRIGGER IF NOT EXISTS pullandbear_products_fts_insert
           AFTER INSERT ON pullandbear_unique_product_details BEGIN
             INSERT INTO pullandbear_products_fts(product_id, name, nameEn, reference, color_name)
             VALUES (new.product_id, new.name, new.nameEn, new.reference, new.color_name);
           END`,

          `CREATE TRIGGER IF NOT EXISTS pullandbear_products_fts_update
           AFTER UPDATE ON pullandbear_unique_product_details BEGIN
             UPDATE pullandbear_products_fts
             SET name = new.name, nameEn = new.nameEn, reference = new.reference, color_name = new.color_name
             WHERE product_id = new.product_id;
           END`,

          `CREATE TRIGGER IF NOT EXISTS pullandbear_products_fts_delete
           AFTER DELETE ON pullandbear_unique_product_details BEGIN
             DELETE FROM pullandbear_products_fts WHERE product_id = old.product_id;
           END`,
        ];

        triggers.forEach((triggerSql, idx) => {
          db.run(triggerSql, (err) => {
            if (err) {
              logger.error(`Error creating FTS trigger ${idx + 1}:`, err.message);
            } else {
              logger.info(`FTS trigger ${idx + 1} created successfully`);
            }
          });
        });
      }
    });
  }

  async getAllCategories() {
    try {
      const url = `${this.baseUrl}/2/catalog/store/${this.storeId}/${this.catalogId}/category?languageId=${this.languageId}&typeCatalog=1&appId=${this.appId}`;
      logger.info("Pull&Bear kategorileri çekiliyor...");

      const response = await axios.get(url, {
        headers: this.headers,
        timeout: this.categoryTimeout,
      });

      const categories = response.data.categories || [];
      logger.info(`${categories.length} kategori bulundu`);

      return categories;
    } catch (error) {
      logger.error("Kategori çekme hatası:", error.message);
      throw error;
    }
  }

  extractCategoryIds(categories, parentId = null) {
    let categoryIds = [];

    for (const category of categories) {
      if (category.id) {
        categoryIds.push(category.id);
      }

      if (category.subcategories && category.subcategories.length > 0) {
        const subIds = this.extractCategoryIds(category.subcategories, category.id);
        categoryIds = categoryIds.concat(subIds);
      }
    }

    return categoryIds;
  }

  async saveCategories(categoryIds) {
    logger.info(`${categoryIds.length} kategori veritabanına kaydediliyor...`);

    for (const categoryId of categoryIds) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO pullandbear_categories (category_id, last_updated)
           VALUES (?, CURRENT_TIMESTAMP)`,
          [categoryId],
          (err) => {
            if (err) {
              logger.error(`Kategori ${categoryId} kaydetme hatası:`, err.message);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    }

    logger.info("Kategoriler başarıyla kaydedildi");
  }

  async getProductIdsByCategory(categoryId) {
    try {
      const url = `${this.baseUrl}/3/catalog/store/${this.storeId}/${this.catalogId}/category/${categoryId}/product?languageId=${this.languageId}&showProducts=false&priceFilter=true&appId=${this.appId}`;

      const response = await axios.get(url, {
        headers: this.headers,
        timeout: this.productTimeout,
      });

      const productIds = response.data.productIds || [];
      return productIds;
    } catch (error) {
      if (error.response?.status === 404) {
        logger.warn(`Kategori ${categoryId} bulunamadı (404)`);
        return [];
      }
      logger.error(`Kategori ${categoryId} ürünleri çekme hatası:`, error.message);
      return [];
    }
  }

  async processAllCategories() {
    logger.info("Tüm kategoriler işleniyor ve ürün ID'leri çekiliyor...");

    const categories = await new Promise((resolve, reject) => {
      db.all(
        "SELECT category_id FROM pullandbear_categories WHERE is_active = 1",
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    logger.info(`${categories.length} aktif kategori bulundu`);

    for (let i = 0; i < categories.length; i++) {
      const { category_id: categoryId } = categories[i];
      logger.info(`[${i + 1}/${categories.length}] Kategori ${categoryId} işleniyor...`);

      const productIds = await this.getProductIdsByCategory(categoryId);

      if (productIds.length === 0) {
        logger.info(`Kategori ${categoryId}: 0 ürün bulundu`);
        continue;
      }

      logger.info(`Kategori ${categoryId}: ${productIds.length} ürün bulundu`);

      for (const productId of productIds) {
        this.allProductIds.add(productId.toString());

        await new Promise((resolve, reject) => {
          db.run(
            `INSERT OR IGNORE INTO pullandbear_unique_products (product_id, categories, category_count)
             VALUES (?, ?, 1)`,
            [productId.toString(), categoryId.toString()],
            (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            }
          );
        });
      }

      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE pullandbear_categories SET product_count = ?, last_updated = CURRENT_TIMESTAMP
           WHERE category_id = ?`,
          [productIds.length, categoryId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise((resolve) => setTimeout(resolve, this.productDelay));
    }

    logger.info(`Toplam ${this.allProductIds.size} benzersiz ürün ID'si bulundu`);
    return Array.from(this.allProductIds);
  }

  parseReference(apiRef) {
    if (!apiRef) return null;
    // "C07683329401-I2025" -> "7683329401"
    // Remove C prefix, leading zeros, and -I suffix
    return apiRef.replace(/^C0?/, "").replace(/-I\d+$/, "");
  }

  extractProductData(productData, categoryId = null) {
    const products = [];

    try {
      if (!productData.bundleProductSummaries || productData.bundleProductSummaries.length === 0) {
        return products;
      }

      const bundleProduct = productData.bundleProductSummaries[0];
      const detail = bundleProduct.detail;

      if (!detail || !detail.colors || detail.colors.length === 0) {
        return products;
      }

      const productName = productData.name || bundleProduct.name;
      const productNameEn = productData.nameEn || bundleProduct.nameEn;
      const bundleId = productData.id;

      for (const color of detail.colors) {
        const colorId = color.id;
        const colorName = color.name;
        const catentryId = color.catentryId;

        let price = null;
        let oldPrice = null;

        if (color.sizes && color.sizes.length > 0) {
          const firstAvailableSize = color.sizes.find((s) => s.isBuyable);
          const sizeToUse = firstAvailableSize || color.sizes[0];

          if (sizeToUse.price) {
            price = parseFloat(sizeToUse.price);
          }
          if (sizeToUse.oldPrice) {
            oldPrice = parseFloat(sizeToUse.oldPrice);
          }
        }

        // Parse reference from color reference
        const reference = this.parseReference(color.reference);

        // Find a6m image from xmedia
        let imageUrl = null;
        if (detail.xmedia && detail.xmedia.length > 0) {
          for (const xmediaGroup of detail.xmedia) {
            if (xmediaGroup.xmediaItems && xmediaGroup.xmediaItems.length > 0) {
              for (const xmediaItem of xmediaGroup.xmediaItems) {
                if (xmediaItem.medias) {
                  const a6mMedia = xmediaItem.medias.find(
                    m => m.extraInfo?.originalName === "a6m"
                  );
                  if (a6mMedia && a6mMedia.extraInfo?.deliveryUrl) {
                    imageUrl = a6mMedia.extraInfo.deliveryUrl;
                    break;
                  }
                }
              }
              if (imageUrl) break;
            }
          }
        }

        // Fallback to old method if a6m not found
        if (!imageUrl && color.image && color.image.url) {
          const imagePath = color.image.url;
          imageUrl = `${this.imageBaseUrl}${imagePath}_2_1_8.jpg`;
        }

        const productUrl = `https://www.pullandbear.com/tr/product-l0${reference?.substring(0, reference.length - 3)}?cS=${colorId}&pelement=${catentryId}`;

        products.push({
          product_id: bundleProduct.id.toString(),
          reference: reference,
          name: productName,
          nameEn: productNameEn,
          brand: "pullandbear",
          price: price,
          old_price: oldPrice,
          currency: "TRY",
          availability: color.sizes?.some((s) => s.isBuyable) ? "in_stock" : "out_of_stock",
          colors: JSON.stringify(detail.colors.map((c) => ({ id: c.id, name: c.name }))),
          color_name: colorName,
          color_id: colorId,
          image_url: imageUrl,
          product_url: productUrl,
          catentryIds: catentryId?.toString(),
        });
      }
    } catch (error) {
      logger.error("Ürün verisi işleme hatası:", error.message);
    }

    return products;
  }

  async saveProductDetails(products, categoryId) {
    if (!products || products.length === 0) return 0;

    let savedCount = 0;
    let skippedCount = 0;

    // INSERT OR REPLACE now works correctly with UNIQUE(product_id, color_id) constraint
    const insertQuery = `
      INSERT OR REPLACE INTO pullandbear_unique_product_details
      (product_id, reference, name, nameEn, brand, price, old_price, currency,
       availability, colors, color_name, color_id, image_url, product_url, catentryIds, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    for (const product of products) {
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
                // If UNIQUE constraint violation, it means we already have this product+color
                if (err.code === 'SQLITE_CONSTRAINT') {
                  skippedCount++;
                  resolve();
                } else {
                  reject(err);
                }
              } else {
                savedCount++;
                resolve();
              }
            }
          );
        });
      } catch (error) {
        logger.error(`Ürün kaydetme hatası (${product.product_id}, color: ${product.color_id}):`, error.message);
      }
    }

    if (skippedCount > 0) {
      logger.info(`${savedCount} ürün detayı kaydedildi, ${skippedCount} duplicate atlandı`);
    } else {
      logger.info(`${savedCount} ürün detayı veritabanına kaydedildi`);
    }
    return savedCount;
  }

  async fetchProductDetails(productIds, categoryId = null) {
    if (!productIds || productIds.length === 0) return [];

    try {
      const productIdsParam = productIds.join("%2C");
      let url = `${this.baseUrl}/3/catalog/store/${this.storeId}/${this.catalogId}/productsArray?languageId=${this.languageId}&productIds=${productIdsParam}&appId=${this.appId}`;

      if (categoryId) {
        url += `&categoryId=${categoryId}`;
      }

      const response = await axios.get(url, {
        headers: this.headers,
        timeout: this.productTimeout,
      });

      if (response.data && response.data.products) {
        logger.info(`✅ [PULLANDBEAR API] ${response.data.products.length} ürün alındı`);
        return response.data.products;
      }

      return [];
    } catch (error) {
      logger.error("Ürün detayları çekme hatası:", error.message);
      return [];
    }
  }

  async fetchAndSaveProductDetails() {
    logger.info("Ürün detayları çekiliyor ve kaydediliyor...");

    const unprocessedProducts = await new Promise((resolve, reject) => {
      db.all(
        "SELECT product_id FROM pullandbear_unique_products WHERE is_processed = 0",
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    logger.info(`${unprocessedProducts.length} işlenmemiş ürün bulundu`);

    const productIds = unprocessedProducts.map((p) => p.product_id);
    let totalSaved = 0;

    for (let i = 0; i < productIds.length; i += this.chunkSize) {
      const chunk = productIds.slice(i, i + this.chunkSize);
      const chunkIndex = Math.floor(i / this.chunkSize) + 1;
      const totalChunks = Math.ceil(productIds.length / this.chunkSize);

      logger.info(
        `[${chunkIndex}/${totalChunks}] ${chunk.length} ürün detayı çekiliyor... (${i + 1}-${Math.min(i + this.chunkSize, productIds.length)}/${productIds.length})`
      );

      const products = await this.fetchProductDetails(chunk);

      for (const productData of products) {
        const extractedProducts = this.extractProductData(productData);
        const savedCount = await this.saveProductDetails(extractedProducts);
        totalSaved += savedCount;

        await new Promise((resolve, reject) => {
          db.run(
            "UPDATE pullandbear_unique_products SET is_processed = 1 WHERE product_id = ?",
            [productData.bundleProductSummaries?.[0]?.id?.toString()],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      await new Promise((resolve) => setTimeout(resolve, this.productDelay));

      if ((i + this.chunkSize) % this.batchSize === 0 && i + this.chunkSize < productIds.length) {
        logger.info(`⏸️  Batch tamamlandı, ${this.chunkDelay}ms bekleniyor...`);
        await new Promise((resolve) => setTimeout(resolve, this.chunkDelay));
      }
    }

    logger.info(`✅ Toplam ${totalSaved} ürün detayı kaydedildi`);
    return totalSaved;
  }

  async scrapeAllProducts() {
    try {
      logger.info("🚀 Pull&Bear scraping başlıyor...");
      const startTime = Date.now();

      logger.info("📋 1. Adım: Kategorileri çekme");
      const categories = await this.getAllCategories();
      const categoryIds = this.extractCategoryIds(categories);
      await this.saveCategories(categoryIds);

      logger.info("🔍 2. Adım: Kategorilerdeki ürün ID'lerini çekme");
      const productIds = await this.processAllCategories();

      logger.info("📦 3. Adım: Ürün detaylarını çekme ve kaydetme");
      const savedCount = await this.fetchAndSaveProductDetails();

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      logger.info("✅ Pull&Bear scraping tamamlandı!");
      logger.info(`⏱️  Süre: ${duration} saniye`);
      logger.info(`📊 Kategori: ${categoryIds.length}, Ürün: ${productIds.length}, Kaydedilen: ${savedCount}`);

      return {
        success: true,
        categories: categoryIds.length,
        products: productIds.length,
        saved: savedCount,
        duration: duration,
      };
    } catch (error) {
      logger.error("❌ Scraping hatası:", error.message);
      throw error;
    }
  }

  async fetchSingleProduct(productId, colorId = null) {
    try {
      logger.info(`Fetching single product: ${productId}${colorId ? ` with color ${colorId}` : ""}`);

      const products = await this.fetchProductDetails([productId]);

      if (!products || products.length === 0) {
        return null;
      }

      const productData = products[0];
      const extractedProducts = this.extractProductData(productData);

      if (extractedProducts.length === 0) {
        return null;
      }

      await this.saveProductDetails(extractedProducts);

      if (colorId) {
        const colorProduct = extractedProducts.find(p => p.color_id === colorId);
        return colorProduct || extractedProducts[0];
      }

      return extractedProducts[0];
    } catch (error) {
      logger.error(`Error fetching single product ${productId}:`, error.message);
      return null;
    }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const service = new PullAndBearService();

  if (command === "all") {
    service
      .scrapeAllProducts()
      .then(() => {
        logger.info("✅ Tüm işlemler tamamlandı");
        process.exit(0);
      })
      .catch((err) => {
        logger.error("❌ Hata:", err);
        process.exit(1);
      });
  } else if (command === "details") {
    service
      .fetchAndSaveProductDetails()
      .then(() => {
        logger.info("✅ Ürün detayları tamamlandı");
        process.exit(0);
      })
      .catch((err) => {
        logger.error("❌ Hata:", err);
        process.exit(1);
      });
  } else {
    logger.info("Kullanım: node services/pullandbear.service.js [all|details]");
    logger.info("  all     - Tüm kategorileri ve ürünleri çek");
    logger.info("  details - Sadece ürün detaylarını çek");
    process.exit(0);
  }
}

module.exports = PullAndBearService;
