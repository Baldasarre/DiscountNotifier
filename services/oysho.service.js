const axios = require("axios");
const db = require("../config/database");
const config = require("../config/oysho.config");
const { createServiceLogger } = require("../utils/logger");

const logger = createServiceLogger("oysho");

class OyshoService {
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
    this.delay = config.scraping.delay;
    this.batchDelay = config.scraping.batchDelay;
    this.progressInterval = config.scraping.progressInterval;
    this.categoryTimeout = config.timeouts.categoryRequest;
    this.productTimeout = config.timeouts.productRequest;
    this.headers = config.headers;
    this.imageBaseUrl = config.brand.imageBaseUrl;

    this.initializeTables();
  }

  initializeTables() {
    logger.info("[OYSHO-SERVICE] Creating Oysho database tables...");

    const tables = [
      {
        name: "oysho_categories",
        sql: `CREATE TABLE IF NOT EXISTS oysho_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category_id TEXT UNIQUE NOT NULL,
          category_name TEXT NOT NULL,
          category_url TEXT,
          gender TEXT,
          redirect_category_id TEXT,
          seo_keyword TEXT,
          path TEXT,
          product_count INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT 1,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
      },
      {
        name: "oysho_unique_products",
        sql: `CREATE TABLE IF NOT EXISTS oysho_unique_products (
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
        name: "oysho_unique_product_details",
        sql: `CREATE TABLE IF NOT EXISTS oysho_unique_product_details (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id TEXT NOT NULL,
          reference TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          nameEn TEXT,
          brand TEXT DEFAULT 'oysho',
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
      "CREATE INDEX IF NOT EXISTS idx_oysho_unique_product ON oysho_unique_products(product_id)",
      "CREATE INDEX IF NOT EXISTS idx_oysho_details_reference ON oysho_unique_product_details(reference)",
      "CREATE INDEX IF NOT EXISTS idx_oysho_details_product ON oysho_unique_product_details(product_id)",
      "CREATE INDEX IF NOT EXISTS idx_oysho_categories ON oysho_categories(category_id)",
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

  async getAllCategories() {
    try {
      const url = `${this.baseUrl}/2/catalog/store/${this.storeId}/${this.catalogId}/category?languageId=${this.languageId}&typeCatalog=1&appId=${this.appId}`;
      logger.debug("Oysho kategorileri çekiliyor...");

      const response = await axios.get(url, {
        headers: this.headers,
        timeout: this.categoryTimeout,
      });

      if (response.data && response.data.categories) {
        const allCategories = this._findAllProductCategories(
          response.data.categories
        );
        logger.info(`${allCategories.length} kategori bulundu`);
        return allCategories;
      } else {
        throw new Error("Kategoriler alınamadı");
      }
    } catch (error) {
      logger.error("Kategori çekme hatası:", error.message);
      throw error;
    }
  }

  _findAllProductCategories(categories, result = [], path = "") {
    for (const category of categories) {
      if (category.subcategories && category.subcategories.length > 0) {
        this._findAllProductCategories(
          category.subcategories,
          result,
          path + "/" + category.name
        );
      } else {
        // Son seviye kategoriler (ürün içeren)
        if (
          !category.name.includes("Landing") &&
          !category.name.includes("UGC")
        ) {
          result.push({
            category_id: category.id,
            category_name: category.name,
            category_url: category.categoryUrl || "",
            gender: category.gender || "unknown",
            redirect_category_id: category.redirectCategoryId || null,
            seo_keyword: category.seoKeyword || "",
            path: path + "/" + category.name,
          });
        }
      }
    }
    return result;
  }

  async getCategoryProducts(categoryId) {
    try {
      const url = `${this.baseUrl}/3/catalog/store/${this.storeId}/${this.catalogId}/category/${categoryId}/product?languageId=${this.languageId}&appId=${this.appId}`;

      const response = await axios.get(url, {
        headers: this.headers,
        timeout: this.categoryTimeout,
      });

      if (response.data && response.data.productIds) {
        return response.data.productIds;
      }

      return [];
    } catch (error) {
      if (error.response?.status === 404) {
        logger.warn(`Kategori ${categoryId} bulunamadı (404)`);
        return [];
      }
      logger.error(
        `Kategori ${categoryId} ürünleri çekme hatası:`,
        error.message
      );
      return [];
    }
  }

  async getProductDetails(productIds, categoryId = null) {
    try {
      const chunks = this._chunkArray(productIds, this.chunkSize);
      const allProducts = [];

      logger.info(
        `${productIds.length} ürün ${chunks.length} chunk'ta işlenecek (chunk boyutu: ${this.chunkSize})...`
      );

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        let retryCount = 0;

        logger.info(
          `Chunk ${i + 1}/${chunks.length} işleniyor (${chunk.length} ürün)...`
        );

        while (retryCount < this.maxRetries) {
          try {
            const productIdsParam = chunk.join("%2C");
            let url = `${this.baseUrl}/3/catalog/store/${this.storeId}/${this.catalogId}/productsArray?languageId=${this.languageId}&productIds=${productIdsParam}&appId=${this.appId}`;

            // Kategori ID'si varsa ekle
            if (categoryId) {
              url += `&categoryId=${categoryId}`;
            }

            const response = await axios.get(url, {
              headers: this.headers,
              timeout: this.productTimeout,
            });

            if (response.data.products) {
              allProducts.push(...response.data.products);
              logger.info(
                `${response.data.products.length} ürün detayı alındı (Toplam: ${allProducts.length})`
              );
            } else {
              logger.warn("Bu chunk'ta ürün detayı bulunamadı");
            }

            break;
          } catch (error) {
            retryCount++;
            logger.error(
              `Chunk ${i + 1} hatası (${retryCount}/${this.maxRetries}):`,
              error.message
            );

            if (retryCount >= this.maxRetries) {
              logger.error(`Chunk ${i + 1} atlandı (max retry aşıldı)`);
              break;
            }

            logger.info("⏳ 3 saniye bekleyip tekrar denenecek...");
            await this._delay(3000);
          }
        }

        if (i < chunks.length - 1) {
          await this._delay(this.delay);
        }
      }

      logger.info(`Toplam ${allProducts.length} ürün detayı alındı`);
      return allProducts;
    } catch (error) {
      logger.error("Ürün detayı çekme hatası:", error.message);
      throw error;
    }
  }

  _extractColorsFromProduct(product) {
    let colorsArray = [];

    // bundleProductSummaries içinde detail.colors kontrolü
    if (
      product.bundleProductSummaries &&
      product.bundleProductSummaries.length > 0
    ) {
      for (const bundleProduct of product.bundleProductSummaries) {
        if (
          bundleProduct.detail &&
          bundleProduct.detail.colors &&
          bundleProduct.detail.colors.length > 0
        ) {
          colorsArray.push(...bundleProduct.detail.colors);
        }
      }
    }

    // Fallback: product.bundleColors
    if (colorsArray.length === 0 && product.bundleColors && product.bundleColors.length > 0) {
      colorsArray.push(...product.bundleColors);
    }

    return colorsArray;
  }

  _extractReferenceFromColor(colorReference) {
    if (!colorReference) return null;

    // "C3128022680002-I2025" veya "31280226-I2025" → "1280226800"
    let cleaned = colorReference
      .replace(/^[CM]?0?/, "") // C3, M1, C0 prefix temizle
      .replace(/-I\d+$/, ""); // -I2025 suffix temizle

    // "1280226800" → "1280/226/800"
    if (cleaned.length >= 10) {
      return `${cleaned.slice(0, 4)}/${cleaned.slice(4, 7)}/${cleaned.slice(7, 10)}`;
    }

    return cleaned;
  }

  _calculateColorPrice(color) {
    if (!color) return 0;

    if (color.sizes && color.sizes.length > 0) {
      const firstSize = color.sizes[0];
      if (firstSize.price) {
        return parseInt(firstSize.price) || 0; // "179000" → 179000
      }
    }

    return 0;
  }

  _findImageForColor(colorId, xmedia) {
    try {
      if (!colorId || !xmedia || !Array.isArray(xmedia)) {
        return null;
      }

      // Color ID'yi 3 haneye pad: "800" → "800", "80" → "080"
      const colorIdStr = colorId.toString().padStart(3, "0");

      // xmedia içinde eşleşen renk kodunu ara
      for (const xmediaGroup of xmedia) {
        if (
          xmediaGroup.xmediaItems &&
          Array.isArray(xmediaGroup.xmediaItems)
        ) {
          for (const xmediaItem of xmediaGroup.xmediaItems) {
            if (xmediaItem.medias && Array.isArray(xmediaItem.medias)) {
              for (const media of xmediaItem.medias) {
                // idMedia formatı: "1280226800_4_1_"
                // Son 3 hane öncesi renk kodu kontrol et
                if (
                  media.idMedia &&
                  media.extraInfo &&
                  media.extraInfo.originalName === "m1"
                ) {
                  // idMedia'dan renk kodunu extract et
                  const idMediaParts = media.idMedia.split("_");
                  if (idMediaParts.length >= 1) {
                    const mediaColorCode = idMediaParts[0].slice(-3);
                    if (mediaColorCode === colorIdStr) {
                      const imageUrl =
                        media.extraInfo.deliveryUrl || media.url;
                      if (imageUrl) {
                        return imageUrl;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      logger.error(
        `Renk ${colorId} için fotoğraf bulma hatası:`,
        error.message
      );
      return null;
    }
  }

  _buildProductUrl(product) {
    try {
      // product.productUrl + "-l" + product.id
      if (product.productUrl && product.id) {
        return `https://www.oysho.com/tr/${product.productUrl}-l${product.id}`;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  _buildProcessedProduct(
    product,
    firstColor,
    colorsArray,
    reference,
    productPrice,
    oldPrice,
    fullImageUrl,
    categoryId
  ) {
    const productId = product.id;
    const colorId = firstColor.id;

    return {
      product_id: productId ? productId.toString() : "unknown",
      reference: reference,
      name: product.name || firstColor.name || "Unknown",
      nameEn: product.nameEn || null,
      brand: "oysho",
      price: productPrice,
      old_price: oldPrice,
      currency: "TL",
      availability: "in_stock",
      colors: JSON.stringify(
        colorsArray.map((c) => ({ id: c.id, name: c.name }))
      ),
      color_name: firstColor.name || "Unknown",
      color_id: colorId ? colorId.toString() : "default",
      image_url: fullImageUrl,
      product_url: this._buildProductUrl(product),
      category_id: categoryId ? categoryId.toString() : null,
      last_updated: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
  }

  async _processProductsWithUniqueColors(products, categoryId = null) {
    if (!products || !Array.isArray(products)) {
      logger.error("products parametresi geçersiz!");
      return [];
    }

    const processedProducts = [];
    let processedCount = 0;

    logger.info(`${products.length} ürün renk varyantları ile işleniyor...`);
    logger.info(
      `Her ${this.progressInterval} üründe ilerleme raporu verilecek...`
    );

    for (let index = 0; index < products.length; index++) {
      const product = products[index];

      try {
        const colorsArray = this._extractColorsFromProduct(product);

        if (colorsArray && colorsArray.length > 0) {
          const firstColor = colorsArray[0];
          if (!firstColor || !firstColor.id) {
            continue;
          }

          const productId = product.id;
          const colorId = firstColor.id;

          // xmedia'dan image URL bul
          let fullImageUrl = null;
          if (
            product.bundleProductSummaries &&
            product.bundleProductSummaries.length > 0
          ) {
            const bundleDetail = product.bundleProductSummaries[0].detail;
            if (bundleDetail && bundleDetail.xmedia) {
              fullImageUrl = this._findImageForColor(
                colorId,
                bundleDetail.xmedia
              );
            }
          }

          // Fallback: color.image.url
          if (!fullImageUrl && firstColor.image && firstColor.image.url) {
            fullImageUrl = firstColor.image.url.startsWith("http")
              ? firstColor.image.url
              : `${this.imageBaseUrl}${firstColor.image.url}`;
          }

          // Price
          const productPrice = this._calculateColorPrice(firstColor);
          const oldPrice = null; // Oysho'da oldPrice yok gibi görünüyor

          // Reference
          const reference = this._extractReferenceFromColor(
            firstColor.reference
          );

          const processedProduct = this._buildProcessedProduct(
            product,
            firstColor,
            colorsArray,
            reference,
            productPrice,
            oldPrice,
            fullImageUrl,
            categoryId
          );

          processedProducts.push(processedProduct);
          processedCount++;
        }
      } catch (error) {
        logger.error(
          `Ürün işleme hatası (${product.id || "unknown"}):`,
          error.message
        );
      }

      if (
        (index + 1) % this.progressInterval === 0 ||
        index === products.length - 1
      ) {
        logger.info(
          `İlerleme: ${index + 1}/${products.length} ürün işlendi (${processedCount} renk varyantı)`
        );
      }
    }

    logger.info(`${processedCount} renk varyantı işlendi`);
    return processedProducts;
  }

  async saveCategoriesWithProducts(categoriesData) {
    return new Promise((resolve, reject) => {
      logger.info(
        `${categoriesData.length} kategori veritabanına kaydediliyor...`
      );

      const insertQuery = `
        INSERT OR REPLACE INTO oysho_categories (
          category_id, category_name, category_url, gender, redirect_category_id,
          seo_keyword, path, product_count, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      const stmt = db.prepare(insertQuery);
      let savedCount = 0;

      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        categoriesData.forEach((category) => {
          stmt.run(
            [
              category.category_id,
              category.category_name,
              category.category_url,
              category.gender,
              category.redirect_category_id,
              category.seo_keyword,
              category.path,
              category.product_count || 0,
            ],
            function (err) {
              if (err) {
                logger.error(
                  `Kategori kaydetme hatası (${category.category_id}):`,
                  err.message
                );
              } else {
                savedCount++;
              }
            }
          );
        });

        db.run("COMMIT", (err) => {
          stmt.finalize();
          if (err) {
            logger.error("Kategori transaction commit hatası:", err.message);
            reject(err);
          } else {
            logger.info(`${savedCount} kategori veritabanına kaydedildi`);
            resolve(savedCount);
          }
        });
      });
    });
  }

  async saveUniqueProducts(productIds, categoriesData) {
    return new Promise((resolve, reject) => {
      logger.info(
        `${productIds.length} benzersiz ürün veritabanına kaydediliyor...`
      );

      const productCategoryMap = new Map();

      categoriesData.forEach((category) => {
        if (category.productIds && category.productIds.length > 0) {
          category.productIds.forEach((productId) => {
            if (!productCategoryMap.has(productId)) {
              productCategoryMap.set(productId, []);
            }
            productCategoryMap.get(productId).push(category.category_id);
          });
        }
      });

      const insertQuery = `
        INSERT OR REPLACE INTO oysho_unique_products (
          product_id, categories, category_count, last_updated
        ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `;

      const stmt = db.prepare(insertQuery);
      let savedCount = 0;

      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        productIds.forEach((productId) => {
          const categories = productCategoryMap.get(productId) || [];
          const categoriesJson = categories.join(",");

          stmt.run(
            [productId.toString(), categoriesJson, categories.length],
            function (err) {
              if (err) {
                logger.error(
                  `Benzersiz ürün kaydetme hatası (${productId}):`,
                  err.message
                );
              } else {
                savedCount++;
              }
            }
          );
        });

        db.run("COMMIT", (err) => {
          stmt.finalize();
          if (err) {
            logger.error(
              "Benzersiz ürün transaction commit hatası:",
              err.message
            );
            reject(err);
          } else {
            logger.info(
              `${savedCount} benzersiz ürün veritabanına kaydedildi`
            );
            resolve(savedCount);
          }
        });
      });
    });
  }

  async saveUniqueProductDetails(processedProducts) {
    return new Promise((resolve, reject) => {
      logger.info(
        `${processedProducts.length} ürün detayı (renk varyantları) veritabanına kaydediliyor...`
      );

      const insertQuery = `
        INSERT OR REPLACE INTO oysho_unique_product_details (
          product_id, reference, name, nameEn, brand, price, old_price,
          currency, availability, colors, color_name, color_id, image_url, product_url, category_id, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      const stmt = db.prepare(insertQuery);
      let savedCount = 0;

      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        processedProducts.forEach((product) => {
          stmt.run(
            [
              product.product_id,
              product.reference,
              product.name,
              product.nameEn,
              product.brand || "oysho",
              product.price,
              product.old_price,
              product.currency || "TL",
              product.availability,
              product.colors,
              product.color_name,
              product.color_id,
              product.image_url,
              product.product_url,
              product.category_id,
            ],
            function (err) {
              if (err) {
                logger.error(
                  `Ürün detayı kaydetme hatası (${product.product_id}):`,
                  err.message
                );
              } else {
                savedCount++;
              }
            }
          );
        });

        db.run("COMMIT", (err) => {
          stmt.finalize();
          if (err) {
            logger.error(
              "Ürün detayı transaction commit hatası:",
              err.message
            );
            reject(err);
          } else {
            logger.info(`${savedCount} ürün detayı veritabanına kaydedildi`);
            resolve(savedCount);
          }
        });
      });
    });
  }

  async loadProductIdsFromDatabase() {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT DISTINCT product_id FROM oysho_unique_products ORDER BY product_id`,
        (err, rows) => {
          if (err) {
            logger.error("Ürün ID'leri yükleme hatası:", err.message);
            reject(err);
          } else {
            const productIds = rows.map((row) => row.product_id);
            logger.info(
              `Oysho unique products tablosundan ${productIds.length} unique ürün ID'si yüklendi`
            );
            resolve(productIds);
          }
        }
      );
    });
  }

  async scrapeAllProductDetails() {
    try {
      const startTime = Date.now();
      logger.info(
        "Oysho ürün detayları scraping başlatılıyor (BATCH MODE)..."
      );

      const allProductIds = await this.loadProductIdsFromDatabase();

      if (allProductIds.length === 0) {
        throw new Error("Veritabanında ürün ID'si bulunamadı");
      }

      logger.info(
        `Toplam ${allProductIds.length} ürün, ${this.batchSize}'lük batch'ler halinde işlenecek...`
      );

      const batches = [];
      for (let i = 0; i < allProductIds.length; i += this.batchSize) {
        batches.push(allProductIds.slice(i, i + this.batchSize));
      }

      logger.info(`${batches.length} batch oluşturuldu`);

      let totalProcessed = 0;
      let totalSaved = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchProductIds = batches[batchIndex];
        const batchNum = batchIndex + 1;

        logger.info(
          `\nBATCH ${batchNum}/${batches.length} işleniyor (${batchProductIds.length} ürün)...`
        );

        try {
          const batchProducts = await this.getProductDetails(batchProductIds);
          logger.info(
            `Batch ${batchNum}: ${batchProducts.length}/${batchProductIds.length} ürün API'den alındı`
          );

          const batchProcessedProducts =
            await this._processProductsWithUniqueColors(batchProducts);
          logger.info(
            `Batch ${batchNum}: ${batchProcessedProducts.length} ürün işlendi`
          );

          if (batchProcessedProducts.length > 0) {
            const batchSavedCount = await this.saveUniqueProductDetails(
              batchProcessedProducts
            );
            logger.info(
              `Batch ${batchNum}: ${batchSavedCount} ürün DB'ye kaydedildi`
            );

            totalProcessed += batchProcessedProducts.length;
            totalSaved += batchSavedCount;
          }
        } catch (batchError) {
          logger.error(`Batch ${batchNum} hatası:`, batchError.message);
          logger.info(
            `⏭️ Batch ${batchNum} atlanıyor, diğer batch'lere geçiliyor...`
          );
          continue;
        }

        if (batchIndex < batches.length - 1) {
          logger.info("Batch'ler arası 2 saniye bekleniyor...");
          await this._delay(this.batchDelay);
        }
      }

      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);

      const result = {
        success: true,
        totalBatches: batches.length,
        processedProducts: totalProcessed,
        savedProducts: totalSaved,
        duration: `${duration} seconds`,
        timestamp: new Date().toISOString(),
      };

      logger.info("\nBATCH MODE scraping tamamlandı!");
      logger.info("Sonuç:", result);

      return result;
    } catch (error) {
      logger.error("Oysho ürün detayları scraping hatası:", error.message);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async scrapeAll() {
    try {
      const startTime = Date.now();
      logger.info("Oysho tam scraping başlatılıyor...");

      logger.info("📋 1. AŞAMA: Kategoriler çekiliyor...");
      const categories = await this.getAllCategories();

      if (categories.length === 0) {
        throw new Error("Hiç kategori bulunamadı");
      }

      await this.saveCategoriesWithProducts(categories);

      logger.info("🔍 2. AŞAMA: Kategorilerden ürün ID'leri çekiliyor...");
      const allProductIds = new Set();
      const categoriesWithProducts = [];

      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        logger.info(
          `${i + 1}/${categories.length} - "${category.category_name}" kategorisi işleniyor...`
        );

        try {
          const categoryProductIds = await this.getCategoryProducts(
            category.category_id
          );
          categoryProductIds.forEach((id) => allProductIds.add(id));

          categoriesWithProducts.push({
            ...category,
            productIds: categoryProductIds,
          });

          logger.info(
            `    ${categoryProductIds.length} ürün ID'si eklendi (Toplam benzersiz: ${allProductIds.size})`
          );

          if (i < categories.length - 1) {
            await this._delay(this.delay);
          }
        } catch (error) {
          logger.error(
            `    Kategori ${category.category_id} hatası: ${error.message}`
          );
          categoriesWithProducts.push({
            ...category,
            productIds: [],
          });
        }
      }

      const uniqueProductIds = Array.from(allProductIds);
      logger.info(`📊 Toplam benzersiz ürün: ${uniqueProductIds.length}`);

      await this.saveUniqueProducts(uniqueProductIds, categoriesWithProducts);

      logger.info(
        "📦 3. AŞAMA: Ürün detayları ve renk varyantları çekiliyor (KATEGORI BAZLI)..."
      );

      // Kategori bazlı processing
      let totalProcessed = 0;
      let totalSaved = 0;

      for (let catIndex = 0; catIndex < categoriesWithProducts.length; catIndex++) {
        const category = categoriesWithProducts[catIndex];

        if (!category.productIds || category.productIds.length === 0) {
          continue;
        }

        logger.info(
          `\n📂 Kategori ${catIndex + 1}/${categoriesWithProducts.length}: "${category.category_name}" (${category.productIds.length} ürün)`
        );

        // Bu kategorinin ürünlerini batch'lere böl
        const categoryBatches = [];
        for (let i = 0; i < category.productIds.length; i += this.batchSize) {
          categoryBatches.push(category.productIds.slice(i, i + this.batchSize));
        }

        for (let batchIndex = 0; batchIndex < categoryBatches.length; batchIndex++) {
          const batchProductIds = categoryBatches[batchIndex];
          const batchNum = batchIndex + 1;

          logger.info(
            `  BATCH ${batchNum}/${categoryBatches.length} işleniyor (${batchProductIds.length} ürün)...`
          );

          try {
            // KATEGORİ ID'Sİ İLE BİRLİKTE API ÇAĞRISI
            const batchProducts = await this.getProductDetails(
              batchProductIds,
              category.category_id
            );
            logger.info(
              `  Batch ${batchNum}: ${batchProducts.length}/${batchProductIds.length} ürün API'den alındı`
            );

            const batchProcessedProducts =
              await this._processProductsWithUniqueColors(
                batchProducts,
                category.category_id
              );
            logger.info(
              `  Batch ${batchNum}: ${batchProcessedProducts.length} ürün işlendi`
            );

            if (batchProcessedProducts.length > 0) {
              const batchSavedCount = await this.saveUniqueProductDetails(
                batchProcessedProducts
              );
              logger.info(
                `  Batch ${batchNum}: ${batchSavedCount} ürün DB'ye kaydedildi`
              );

              totalProcessed += batchProcessedProducts.length;
              totalSaved += batchSavedCount;
            }
          } catch (batchError) {
            logger.error(`  Batch ${batchNum} hatası:`, batchError.message);
            logger.info(
              `  ⏭️ Batch ${batchNum} atlanıyor, diğer batch'lere geçiliyor...`
            );
            continue;
          }

          if (batchIndex < categoryBatches.length - 1) {
            logger.info("  Batch'ler arası bekleme...");
            await this._delay(this.batchDelay);
          }
        }
      }

      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);

      const result = {
        success: true,
        totalCategories: categories.length,
        totalUniqueProducts: uniqueProductIds.length,
        processedProducts: totalProcessed,
        savedProducts: totalSaved,
        duration: `${duration} seconds`,
        timestamp: new Date().toISOString(),
      };

      logger.info("\n✅ Oysho scraping tamamlandı!");
      logger.info("ÖZET SONUÇ:", result);

      return result;
    } catch (error) {
      logger.error("Oysho scraping hatası:", error.message);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  _chunkArray(array, chunkSize) {
    if (!array || !Array.isArray(array)) {
      logger.warn("_chunkArray: Invalid array parameter");
      return [];
    }
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Fetch single product from API and save to DB
   * @param {string} productId - Product ID
   * @param {string} colorId - Color ID (optional)
   * @returns {Promise<Object|null>} Formatted product or null
   */
  async fetchSingleProduct(productId, colorId = null) {
    logger.info(`🔍 [API] Fetching single Oysho product: ${productId}`);

    const startTime = Date.now();

    try {
      // 1. Fetch from API
      const products = await this.getProductDetails([productId]);

      if (!products || products.length === 0) {
        logger.error(`❌ [API] Oysho product ${productId} not found`);
        return null;
      }

      logger.info(`✅ [API] Product fetched in ${Date.now() - startTime}ms`);

      // 2. Process with color variants
      const processedProducts = await this._processProductsWithUniqueColors(
        products
      );

      if (!processedProducts || processedProducts.length === 0) {
        logger.error(`❌ [API] Failed to process product ${productId}`);
        return null;
      }

      // 3. Save to DB
      const savedCount = await this.saveUniqueProductDetails(
        processedProducts
      );
      logger.info(`💾 Saved ${savedCount} color variant(s) to DB`);

      logger.info(
        `⏱️ Total fetchSingleProduct time: ${Date.now() - startTime}ms`
      );

      // Return first processed product (formatted for tracking)
      return processedProducts[0];
    } catch (error) {
      logger.error(
        `❌ [API] Error fetching product ${productId}:`,
        error.message
      );
      return null;
    }
  }
}

module.exports = OyshoService;

// Command line interface
if (require.main === module) {
  const service = new OyshoService();
  const arg = process.argv[2];

  if (arg === "all") {
    logger.info("🚀 Oysho tam veri tarama başlatılıyor...");
    service
      .scrapeAll()
      .then(() => {
        logger.info("✅ Oysho tam veri tarama tamamlandı.");
        process.exit(0);
      })
      .catch((error) => {
        logger.error("❌ Oysho tarama hatası:", error);
        process.exit(1);
      });
  } else if (arg === "details") {
    logger.info("🚀 Oysho ürün detayları tarama başlatılıyor...");
    service
      .scrapeAllProductDetails()
      .then(() => {
        logger.info("✅ Oysho ürün detayları tarama tamamlandı.");
        process.exit(0);
      })
      .catch((error) => {
        logger.error("❌ Oysho ürün detayları tarama hatası:", error);
        process.exit(1);
      });
  } else {
    logger.info("Kullanım: node services/oysho.service.js [all|details]");
    logger.info("all - Tüm kategoriler ve ürün ID'leri tara");
    logger.info("details - Var olan ürün ID'leri için renk detayları tara");
  }
}
