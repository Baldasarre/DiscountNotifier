const axios = require("axios");
const db = require("../config/database");
const config = require("../config/stradivarius.config");
const { createServiceLogger } = require("../utils/logger");

const logger = createServiceLogger("stradivarius");

class StradivariusService {
  constructor() {
    this.baseUrl = config.api.baseUrl;
    this.brand = "stradivarius";
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

    this.initializeTables();
  }

  initializeTables() {
    logger.info("[STRADIVARIUS-SERVICE] Creating Stradivarius database tables...");

    const tables = [
      {
        name: "stradivarius_categories",
        sql: `CREATE TABLE IF NOT EXISTS stradivarius_categories (
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
        name: "stradivarius_unique_products",
        sql: `CREATE TABLE IF NOT EXISTS stradivarius_unique_products (
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
        name: "stradivarius_unique_product_details",
        sql: `CREATE TABLE IF NOT EXISTS stradivarius_unique_product_details (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id TEXT NOT NULL,
          reference TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          nameEn TEXT,
          brand TEXT DEFAULT 'stradivarius',
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
      "CREATE INDEX IF NOT EXISTS idx_stradivarius_unique_product ON stradivarius_unique_products(product_id)",
      "CREATE INDEX IF NOT EXISTS idx_stradivarius_details_reference ON stradivarius_unique_product_details(reference)",
      "CREATE INDEX IF NOT EXISTS idx_stradivarius_details_product ON stradivarius_unique_product_details(product_id)",
      "CREATE INDEX IF NOT EXISTS idx_stradivarius_categories ON stradivarius_categories(category_id)",
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
      logger.debug("Stradivarius kategorileri çekiliyor...");

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

  async getProductDetails(productIds) {
    try {
      const chunks = this._chunkArray(productIds, this.chunkSize);
      const allProducts = [];

      logger.info(`${productIds.length} ürün ${chunks.length} chunk'ta işlenecek (chunk boyutu: ${this.chunkSize})...`);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        let retryCount = 0;

        logger.info(`Chunk ${i + 1}/${chunks.length} işleniyor (${
            chunk.length
          } ürün)...`);

        while (retryCount < this.maxRetries) {
          try {
            const productIdsParam = chunk.join("%2C");
            const url = `${this.baseUrl}/3/catalog/store/${this.storeId}/${this.catalogId}/productsArray?languageId=${this.languageId}&productIds=${productIdsParam}&appId=${this.appId}`;

            const response = await axios.get(url, {
              headers: this.headers,
              timeout: this.productTimeout,
            });

            if (response.data.products) {
              allProducts.push(...response.data.products);
              logger.info(`${response.data.products.length} ürün detayı alındı (Toplam: ${allProducts.length})`);
            } else {
              logger.warn("Bu chunk'ta ürün detayı bulunamadı");
            }

            break;
          } catch (error) {
            retryCount++;
            logger.error(`Chunk ${i + 1} hatası (${retryCount}/${this.maxRetries}):`, error.message);

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

    if (
      colorsArray.length === 0 &&
      product.colors &&
      product.colors.length > 0
    ) {
      colorsArray.push(...product.colors);
    }

    if (
      colorsArray.length === 0 &&
      product.bundleColors &&
      product.bundleColors.length > 0
    ) {
      colorsArray.push(...product.bundleColors);
    }

    return colorsArray;
  }

  _extractReferenceFromColorField(colorReference) {
    if (!colorReference) return null;

    const match = colorReference.match(/^C0(\d{10})\d{2}-I\d{4}$/);
    if (match) {
      const middlePart = match[1];
      if (middlePart.length === 10) {
        const formatted = `${middlePart.slice(0, 4)}/${middlePart.slice(
          4,
          7
        )}/${middlePart.slice(7, 10)}`;
        return formatted;
      }
    }

    return null;
  }

  _extractReferenceFromProduct(product, colorsArray) {
    let reference = null;

    if (colorsArray.length > 0 && colorsArray[0].reference) {
      reference = this._extractReferenceFromColorField(
        colorsArray[0].reference
      );
    }

    if (!reference && colorsArray.length > 0) {
      for (const color of colorsArray) {
        if (color.reference) {
          reference = this._extractReferenceFromColorField(color.reference);
          if (reference) break;
        }
      }
    }

    if (!reference && product.displayReference) {
      reference = product.displayReference;
    }

    if (
      !reference &&
      colorsArray.length > 0 &&
      colorsArray[0].image &&
      colorsArray[0].image.url
    ) {
      const urlMatch = colorsArray[0].image.url.match(/\/p\/(\d+\/\d+\/\d+)\//);
      if (urlMatch) {
        reference = urlMatch[1];
      }
    }

    if (!reference && colorsArray.length > 0) {
      for (const color of colorsArray) {
        if (color.image && color.image.url) {
          const urlMatch = color.image.url.match(/\/p\/(\d+\/\d+\/\d+)\//);
          if (urlMatch) {
            reference = urlMatch[1];
            break;
          }
        }
      }
    }

    if (!reference && product.reference) {
      reference = product.reference;
    }

    if (!reference) {
      reference = product.id ? product.id.toString() : "unknown";
    }

    return reference;
  }

  _calculateProductPrice(firstColor, product) {
    let productPrice = 0;
    let oldPrice = null;

    if (firstColor.price) {
      productPrice = parseInt(firstColor.price) || 0;
    } else if (
      firstColor.sizes &&
      firstColor.sizes.length > 0 &&
      firstColor.sizes[0].price
    ) {
      productPrice = parseInt(firstColor.sizes[0].price) || 0;
      oldPrice = firstColor.sizes[0].oldPrice
        ? parseInt(firstColor.sizes[0].oldPrice)
        : null;
    } else if (product.price) {
      productPrice = parseInt(product.price) || 0;
    }

    return { productPrice, oldPrice };
  }

  _buildProcessedProduct(
    product,
    firstColor,
    colorsArray,
    reference,
    productPrice,
    oldPrice,
    fullImageUrl
  ) {
    const productId = product.id;
    const colorId = firstColor.id;

    return {
      product_id: productId ? productId.toString() : "unknown",
      reference: reference,
      name: product.name || firstColor.name || "Unknown",
      nameEn: product.nameEn || null,
      brand: "stradivarius",
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
      product_url: `https://www.stradivarius.com/tr/tr/product/${productId}`,
      last_updated: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
  }

  async _processProductsWithUniqueColors(products) {
    if (!products || !Array.isArray(products)) {
      logger.error("products parametresi geçersiz!");
      return [];
    }

    const processedProducts = [];
    let processedCount = 0;

    logger.info(`${products.length} ürün renk varyantları ile işleniyor...`);
    logger.info(`Her ${this.progressInterval} üründe ilerleme raporu verilecek...`);

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
          let fullImageUrl = null;
          if (
            colorId &&
            product.bundleProductSummaries &&
            product.bundleProductSummaries.length > 0
          ) {
            fullImageUrl = this._findImageForColor(
              colorId,
              product.bundleProductSummaries
            );
          }

          if (!fullImageUrl && firstColor.image && firstColor.image.url) {
            fullImageUrl = firstColor.image.url.startsWith("http")
              ? firstColor.image.url
              : `https://static.e-stradivarius.net${firstColor.image.url}`;
          }

          const { productPrice, oldPrice } = this._calculateProductPrice(
            firstColor,
            product
          );

          const reference = this._extractReferenceFromProduct(
            product,
            colorsArray
          );

          const processedProduct = this._buildProcessedProduct(
            product,
            firstColor,
            colorsArray,
            reference,
            productPrice,
            oldPrice,
            fullImageUrl
          );

          processedProducts.push(processedProduct);
          processedCount++;
        }
      } catch (error) {
        logger.error(`Ürün işleme hatası (${product.id || "unknown"}):`, error.message);
      }

      if (
        (index + 1) % this.progressInterval === 0 ||
        index === products.length - 1
      ) {
        logger.info(`İlerleme: ${index + 1}/${
            products.length
          } ürün işlendi (${processedCount} renk varyantı)`);
      }
    }

    logger.info(`${processedCount} renk varyantı işlendi`);
    return processedProducts;
  }

  async saveCategoriesWithProducts(categoriesData) {
    return new Promise((resolve, reject) => {
      logger.info(
        ` ${categoriesData.length} kategori veritabanına kaydediliyor...`
      );

      const insertQuery = `
        INSERT OR REPLACE INTO stradivarius_categories (
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
                  ` Kategori kaydetme hatası (${category.category_id}):`,
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
              " Kategori transaction commit hatası:",
              err.message
            );
            reject(err);
          } else {
            logger.info("${savedCount} kategori veritabanına kaydedildi");
            resolve(savedCount);
          }
        });
      });
    });
  }

  async saveUniqueProducts(productIds, categoriesData) {
    return new Promise((resolve, reject) => {
      logger.info(
        ` ${productIds.length} benzersiz ürün veritabanına kaydediliyor...`
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
        INSERT OR REPLACE INTO stradivarius_unique_products (
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
                  ` Benzersiz ürün kaydetme hatası (${productId}):`,
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
              " Benzersiz ürün transaction commit hatası:",
              err.message
            );
            reject(err);
          } else {
            logger.info(
              ` ${savedCount} benzersiz ürün veritabanına kaydedildi`
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
        ` ${processedProducts.length} ürün detayı (renk varyantları) veritabanına kaydediliyor...`
      );

      const insertQuery = `
        INSERT OR REPLACE INTO stradivarius_unique_product_details (
          product_id, reference, name, nameEn, brand, price, old_price, 
          currency, availability, colors, color_name, color_id, image_url, product_url, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      const stmt = db.prepare(insertQuery);
      let savedCount = 0;

      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        processedProducts.forEach((product) => {
          stmt.run(
            [
              product.product_id, // product_id
              product.reference, // reference (UNIQUE)
              product.name, // name
              product.nameEn, // nameEn
              product.brand || "stradivarius", // brand
              product.price, // price
              product.old_price, // old_price
              product.currency || "TL", // currency
              product.availability, // availability
              product.colors, // colors
              product.color_name, // color_name
              product.color_id, // color_id
              product.image_url, // image_url
              product.product_url, // product_url
            ],
            function (err) {
              if (err) {
                logger.error(
                  ` Ürün detayı kaydetme hatası (${product.product_id}):`,
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
              " Ürün detayı transaction commit hatası:",
              err.message
            );
            reject(err);
          } else {
            logger.info("${savedCount} ürün detayı veritabanına kaydedildi");
            resolve(savedCount);
          }
        });
      });
    });
  }

  async loadProductIdsFromDatabase() {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT DISTINCT product_id FROM stradivarius_unique_products ORDER BY product_id`,
        (err, rows) => {
          if (err) {
            logger.error("Ürün ID leri yükleme hatası:", err.message);
            reject(err);
          } else {
            const productIds = rows.map((row) => row.product_id);
            logger.info(
              ` Stradivarius unique products tablosundan ${productIds.length} unique ürün ID'si yüklendi`
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
        " Stradivarius ürün detayları scraping başlatılıyor (BATCH MODE)..."
      );

      const allProductIds = await this.loadProductIdsFromDatabase();

      if (allProductIds.length === 0) {
        throw new Error("Veritabanında ürün ID'si bulunamadı");
      }

      logger.info(
        ` Toplam ${allProductIds.length} ürün, ${this.batchSize}'lük batch'ler halinde işlenecek...`
      );

      const batches = [];
      for (let i = 0; i < allProductIds.length; i += this.batchSize) {
        batches.push(allProductIds.slice(i, i + this.batchSize));
      }

      logger.info("� ${batches.length} batch oluşturuldu");

      let totalProcessed = 0;
      let totalSaved = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchProductIds = batches[batchIndex];
        const batchNum = batchIndex + 1;

        logger.info(
          `\n BATCH ${batchNum}/${batches.length} işleniyor (${batchProductIds.length} ürün)...`
        );

        try {
          const batchProducts = await this.getProductDetails(batchProductIds);
          logger.info(
            ` Batch ${batchNum}: ${batchProducts.length}/${batchProductIds.length} ürün API'den alındı`
          );

          const batchProcessedProducts =
            await this._processProductsWithUniqueColors(batchProducts);
          logger.info(
            ` Batch ${batchNum}: ${batchProcessedProducts.length} ürün işlendi`
          );

          if (batchProcessedProducts.length > 0) {
            const batchSavedCount = await this.saveUniqueProductDetails(
              batchProcessedProducts
            );
            logger.info(
              ` Batch ${batchNum}: ${batchSavedCount} ürün DB'ye kaydedildi`
            );

            totalProcessed += batchProcessedProducts.length;
            totalSaved += batchSavedCount;
          }
        } catch (batchError) {
          logger.error("Batch ${batchNum} hatası: batchError.message");
          logger.info(
            `⏭️ Batch ${batchNum} atlanıyor, diğer batch'lere geçiliyor...`
          );
          continue;
        }

        if (batchIndex < batches.length - 1) {
          logger.info("Batch ler arası 2 saniye bekleniyor...");
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

      logger.info("\n BATCH MODE scraping tamamlandı!");
      logger.info("Sonuç: result");

      return result;
    } catch (error) {
      logger.error(
        " Stradivarius ürün detayları scraping hatası:",
        error.message
      );
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
      logger.info("Stradivarius tam scraping başlatılıyor...");

      logger.info("� 1. AŞAMA: Kategoriler çekiliyor...");
      const categories = await this.getAllCategories();

      if (categories.length === 0) {
        throw new Error("Hiç kategori bulunamadı");
      }

      await this.saveCategoriesWithProducts(categories);

      logger.debug("2. AŞAMA: Kategorilerden ürün ID leri çekiliyor...");
      const allProductIds = new Set();
      const categoriesWithProducts = [];

      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        logger.info(
          ` ${i + 1}/${categories.length} - "${
            category.category_name
          }" kategorisi işleniyor...`
        );

        try {
          const url = `${this.baseUrl}/3/catalog/store/${this.storeId}/${this.catalogId}/category/${category.category_id}/product?languageId=${this.languageId}&showProducts=true&priceFilter=true&appId=${this.appId}`;
          const response = await axios.get(url, {
            headers: this.headers,
            timeout: this.categoryTimeout,
          });

          const categoryProductIds = response.data.productIds || [];
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
      logger.info("� Toplam benzersiz ürün: ${uniqueProductIds.length}");

      await this.saveUniqueProducts(uniqueProductIds, categoriesWithProducts);

      logger.info(
        " 3. AŞAMA: Ürün detayları ve renk varyantları çekiliyor (BATCH MODE)..."
      );
      logger.info(
        ` ${uniqueProductIds.length} ürün, ${this.batchSize}'lük batch'ler halinde işlenecek...`
      );

      const batches = [];
      for (let i = 0; i < uniqueProductIds.length; i += this.batchSize) {
        batches.push(uniqueProductIds.slice(i, i + this.batchSize));
      }

      logger.info("� ${batches.length} batch oluşturuldu");

      let allProcessedProducts = [];
      let totalSaved = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchProductIds = batches[batchIndex];
        const batchNum = batchIndex + 1;

        logger.info(
          `\n BATCH ${batchNum}/${batches.length} işleniyor (${batchProductIds.length} ürün)...`
        );

        try {
          const batchProducts = await this.getProductDetails(batchProductIds);
          logger.info(
            ` Batch ${batchNum}: ${batchProducts.length}/${batchProductIds.length} ürün API'den alındı`
          );

          const batchProcessedProducts =
            await this._processProductsWithUniqueColors(batchProducts);
          logger.info(
            ` Batch ${batchNum}: ${batchProcessedProducts.length} ürün işlendi`
          );

          if (batchProcessedProducts.length > 0) {
            const batchSavedCount = await this.saveUniqueProductDetails(
              batchProcessedProducts
            );
            logger.info(
              ` Batch ${batchNum}: ${batchSavedCount} ürün DB'ye kaydedildi`
            );

            allProcessedProducts.push(...batchProcessedProducts);
            totalSaved += batchSavedCount;
          }
        } catch (batchError) {
          logger.error("Batch ${batchNum} hatası: batchError.message");
          logger.info(
            `⏭️ Batch ${batchNum} atlanıyor, diğer batch'lere geçiliyor...`
          );
          continue;
        }

        if (batchIndex < batches.length - 1) {
          logger.info("Batch ler arası 2 saniye bekleniyor...");
          await this._delay(this.batchDelay);
        }
      }

      const processedProducts = allProcessedProducts;
      const savedDetailsCount = totalSaved;
      logger.debug("Eksik ürün kontrolü yapılıyor...");
      const expectedCount = uniqueProductIds.length;
      const actualCount = processedProducts.length;
      const missingCount = expectedCount - actualCount;

      if (missingCount > 0) {
        logger.info(
          `️ ${missingCount} ürün eksik! Eksik ürünler tespit ediliyor...`
        );

        const processedIds = new Set(
          processedProducts.map((p) => p.product_id)
        );
        const missingIds = uniqueProductIds.filter(
          (id) => !processedIds.has(id.toString())
        );

        logger.info("� ${missingIds.length} eksik ürün yeniden işleniyor...");

        if (missingIds.length > 0) {
          const missingProducts = await this.getProductDetails(missingIds);
          const missingProcessed = await this._processProductsWithUniqueColors(
            missingProducts
          );
          const missingSavedCount = await this.saveUniqueProductDetails(
            missingProcessed
          );

          logger.info(
            ` ${missingSavedCount} eksik ürün başarıyla tamamlandı!`
          );
        }
      } else {
        logger.info("Tüm ürünler başarıyla işlendi, eksik ürün yok!");
      }

      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);

      const result = {
        success: true,
        totalCategories: categories.length,
        totalUniqueProducts: uniqueProductIds.length,
        processedProducts: uniqueProductIds.length,
        colorVariants: processedProducts.length,
        savedColorVariants: savedDetailsCount,
        duration: `${duration} seconds`,
        timestamp: new Date().toISOString(),
      };

      logger.info("Stradivarius scraping tamamlandı!");
      logger.info("ÖZET SONUÇ: result");

      return result;
    } catch (error) {
      logger.error("Stradivarius scraping hatası:", error.message);
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

  _findImageForColor(colorId, bundleProductSummaries) {
    try {
      if (!colorId || !bundleProductSummaries) {
        return null;
      }

      const colorIdStr = colorId.toString().padStart(3, "0");

      for (const bundleProduct of bundleProductSummaries) {
        if (
          bundleProduct.detail &&
          bundleProduct.detail.xmedia &&
          Array.isArray(bundleProduct.detail.xmedia)
        ) {
          for (const xmediaObj of bundleProduct.detail.xmedia) {
            if (xmediaObj.xmediaItems && xmediaObj.xmediaItems.length > 0) {
              for (const xmediaItem of xmediaObj.xmediaItems) {
                if (xmediaItem.medias && xmediaItem.medias.length > 0) {
                  for (const media of xmediaItem.medias) {
                    if (
                      media.idMedia &&
                      media.extraInfo &&
                      media.extraInfo.originalName === "m1"
                    ) {
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

                  for (const media of xmediaItem.medias) {
                    if (
                      media.idMedia &&
                      media.extraInfo &&
                      media.extraInfo.originalName === "s1"
                    ) {
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
        }
      }

      return null;
    } catch (error) {
      logger.error(
        ` Renk ${colorId} için fotoğraf bulma hatası:`,
        error.message
      );
      return null;
    }
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
    logger.info(`🔍 [API] Fetching single Stradivarius product: ${productId}`);

    const startTime = Date.now();

    try {
      // 1. Fetch from API (1 elemanlı array)
      const products = await this.getProductDetails([productId]);

      if (!products || products.length === 0) {
        logger.error(`❌ [API] Stradivarius product ${productId} not found`);
        return null;
      }

      logger.info(`✅ [API] Product fetched in ${Date.now() - startTime}ms`);

      // 2. Process with color variants
      const processedProducts = await this._processProductsWithUniqueColors(products);

      if (!processedProducts || processedProducts.length === 0) {
        logger.error(`❌ [API] Failed to process product ${productId}`);
        return null;
      }

      // 3. Save to DB
      const savedCount = await this.saveUniqueProductDetails(processedProducts);
      logger.info(`💾 Saved ${savedCount} color variant(s) to DB`);

      logger.info(`⏱️ Total fetchSingleProduct time: ${Date.now() - startTime}ms`);

      // Return first processed product (formatted for tracking)
      return processedProducts[0];

    } catch (error) {
      logger.error(`❌ [API] Error fetching product ${productId}:`, error.message);
      return null;
    }
  }
}

module.exports = StradivariusService;

// Command line interface
if (require.main === module) {
  const service = new StradivariusService();
  const arg = process.argv[2];

  if (arg === "all") {
    logger.info("� Stradivarius tam veri tarama başlatılıyor...");
    service
      .scrapeAll()
      .then(() => {
        logger.info("Stradivarius tam veri tarama tamamlandı.");
        process.exit(0);
      })
      .catch((error) => {
        logger.error("Stradivarius tarama hatası:", error);
        process.exit(1);
      });
  } else if (arg === "details") {
    logger.info("� Stradivarius ürün detayları tarama başlatılıyor...");
    service
      .scrapeAllProductDetails()
      .then(() => {
        logger.info("Stradivarius ürün detayları tarama tamamlandı.");
        process.exit(0);
      })
      .catch((error) => {
        logger.error("Stradivarius ürün detayları tarama hatası:", error);
        process.exit(1);
      });
  } else {
    logger.info(
      "Kullanım: node services/stradivarius.service.js [all|details]"
    );
    logger.info("all - Tüm kategoriler ve ürün ID'leri tara");
    logger.info("details - Var olan ürün ID'leri için renk detayları tara");
  }
}