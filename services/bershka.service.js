const axios = require("axios");
const fs = require("fs");
const db = require("../config/database");
const config = require("../config/bershka.config");

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
    console.log("🔧 [BERSHKA-SERVICE] Creating Bershka database tables...");

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
          console.error(`❌ Error creating ${table.name} table:`, err.message);
        } else {
          console.log(`✅ ${table.name} table created successfully`);
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
          console.error("❌ Error creating index:", err.message);
        } else {
          console.log("✅ Index created successfully");
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
      console.log("✅ Test verisi başarıyla okundu");

      const categories = this.extractCategoriesFromData(testData);
      return categories;
    } catch (error) {
      console.error("❌ Dosyadan kategori okuma hatası:", error.message);
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

    console.log(
      `✅ Toplam ${uniqueCategories.length} benzersiz kategori çıkarıldı`
    );
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
        console.log(
          `✅ Kategori ${categoryId}: ${productIds.length} ürün bulundu`
        );

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
      console.error(`❌ Kategori ${categoryId} hata: ${error.message}`);
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
      console.log(
        `🚀 ${categories.length} kategori için ürün listeleri çekiliyor...`
      );

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
          console.log(
            `📊 İlerleme: ${i + 1}/${categories.length} kategori tamamlandı`
          );
          console.log(
            `📦 Şu ana kadar toplanan benzersiz ürün: ${this.allProductIds.size}`
          );

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

      console.log(`🎉 Özet:`);
      console.log(
        `✅ Başarılı kategoriler: ${successCount}/${categories.length}`
      );
      console.log(`📦 Toplam ürün sayısı (tekrarlı): ${totalProducts}`);
      console.log(`🎯 Benzersiz ürün sayısı: ${uniqueProductCount}`);

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
      console.error("❌ Genel hata:", error.message);
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
                console.error(
                  `❌ Unique ürün kaydetme hatası (${productId}):`,
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
            console.error("❌ Transaction commit hatası:", err.message);
            reject(err);
          } else {
            console.log(`✅ ${savedCount} unique ürün veritabanına kaydedildi`);
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

    console.log(`🎨 ${products.length} ürün renk varyantları ile işleniyor...`);
    console.log("📊 Her 100 üründe ilerleme raporu verilecek...");

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
          console.log(
            `📈 İlerleme: ${processedCount}/${products.length} ürün işlendi (${processedProducts.length} renk varyantı)`
          );
        }
      } catch (error) {
        console.error(`❌ Ürün işleme hatası (${product.id}):`, error.message);
        continue;
      }
    }

    if (products.length <= 100 || processedCount % 100 !== 0) {
      console.log(
        `📈 İlerleme: ${processedCount}/${products.length} ürün işlendi (${processedProducts.length} renk varyantı)`
      );
    }

    console.log(`✅ ${processedProducts.length} renk varyantı işlendi`);
    return processedProducts;
  }

  async saveUniqueProductDetails(processedProducts) {
    if (!processedProducts || processedProducts.length === 0) {
      console.log("⚠️ Kaydedilecek ürün detayı yok");
      return 0;
    }

    console.log(
      `💾 ${processedProducts.length} ürün detayı (renk varyantları) veritabanına kaydediliyor...`
    );

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
        console.error(
          `❌ Ürün kaydetme hatası (${product.product_id}):`,
          error.message
        );
      }
    }

    console.log(`✅ ${savedCount} ürün detayı veritabanına kaydedildi`);
    return savedCount;
  }

  async fetchProductDetails(productIds) {
    if (!productIds || productIds.length === 0) return [];

    try {
      const productIdsParam = productIds.join("%2C");
      const categoryId = this.fallbackCategoryId;

      const url = `${this.baseUrl}/productsArray?categoryId=${categoryId}&productIds=${productIdsParam}&appId=1&languageId=-43&locale=tr_TR`;

      const response = await axios.get(url, {
        headers: this.headers,
        timeout: this.productTimeout,
      });

      if (response.data && response.data.products) {
        return response.data.products;
      }

      return [];
    } catch (error) {
      console.error(`❌ API fetch hatası: ${error.message}`);
      return [];
    }
  }

  async loadProductIdsFromDatabase() {
    console.log(
      "📂 Bershka unique products tablosundan ürün ID'leri yükleniyor..."
    );

    return new Promise((resolve, reject) => {
      db.all(
        "SELECT product_id FROM bershka_unique_products ORDER BY id",
        (err, rows) => {
          if (err) {
            console.error("❌ Veritabanı okuma hatası:", err.message);
            reject(err);
          } else {
            const productIds = rows.map((row) => row.product_id);
            console.log(
              `✅ Bershka unique products tablosundan ${productIds.length} unique ürün ID'si yüklendi`
            );
            resolve(productIds);
          }
        }
      );
    });
  }

  async getProductDetails(productIds) {
    if (!productIds || productIds.length === 0) return [];

    console.log(
      `📦 ${productIds.length} ürün ${Math.ceil(
        productIds.length / this.chunkSize
      )} chunk'ta işlenecek (chunk boyutu: ${this.chunkSize})...`
    );

    const allProducts = [];
    const totalChunks = Math.ceil(productIds.length / this.chunkSize);

    for (let i = 0; i < productIds.length; i += this.chunkSize) {
      const chunk = productIds.slice(i, i + this.chunkSize);
      const chunkIndex = Math.floor(i / this.chunkSize) + 1;

      console.log(
        `🔄 Chunk ${chunkIndex}/${totalChunks} işleniyor (${chunk.length} ürün)...`
      );

      try {
        const chunkProducts = await this.fetchProductDetails(chunk);
        allProducts.push(...chunkProducts);
        console.log(
          `   ✅ ${chunkProducts.length} ürün detayı alındı (Toplam: ${allProducts.length})`
        );

        if (i + this.chunkSize < productIds.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.productDelay)
          );
        }
      } catch (error) {
        console.error(`❌ Chunk ${chunkIndex} hatası:`, error.message);
      }
    }

    console.log(`🎉 Toplam ${allProducts.length} ürün detayı alındı`);
    return allProducts;
  }

  async scrapeAll() {
    console.log("🚀 Bershka tam scraping başlatılıyor...");

    try {
      console.log("📂 1. AŞAMA: Kategoriler ve ürün ID'leri çekiliyor...");
      await this.fetchAllCategoriesProducts();

      const allProductIds = await this.loadProductIdsFromDatabase();

      if (allProductIds.length === 0) {
        console.log(
          "⚠️ Kategori scraping tamamlandı ama ürün ID'si bulunamadı."
        );
        return;
      }

      console.log(
        `📊 Toplam ${allProductIds.length} unique ürün ID'si veritabanında`
      );
      console.log(
        "🎨 2. AŞAMA: Ürün detayları ve renk varyantları çekiliyor..."
      );

      const totalBatches = Math.ceil(allProductIds.length / this.batchSize);

      console.log(
        `📦 ${allProductIds.length} ürün, ${this.batchSize}'lük batch'ler halinde işlenecek...`
      );
      console.log(`📦 ${totalBatches} batch oluşturuldu\n`);

      let totalProcessed = 0;

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * this.batchSize;
        const endIndex = Math.min(
          startIndex + this.batchSize,
          allProductIds.length
        );
        const batchProductIds = allProductIds.slice(startIndex, endIndex);

        console.log(
          `🔄 BATCH ${batchIndex + 1}/${totalBatches} işleniyor (${
            batchProductIds.length
          } ürün)...`
        );

        try {
          const batchProducts = await this.getProductDetails(batchProductIds);

          if (batchProducts.length === 0) {
            console.log(
              `⚠️ Batch ${batchIndex + 1}: API'den ürün detayı alınamadı`
            );
            continue;
          }

          const batchProcessedProducts =
            await this._processProductsWithUniqueColors(batchProducts);

          if (batchProcessedProducts.length === 0) {
            console.log(
              `⚠️ Batch ${batchIndex + 1}: İşlenecek ürün bulunamadı`
            );
            continue;
          }

          const savedCount = await this.saveUniqueProductDetails(
            batchProcessedProducts
          );
          totalProcessed += savedCount;

          console.log(
            `✅ Batch ${
              batchIndex + 1
            }/${totalBatches} tamamlandı: ${savedCount} ürün kaydedildi`
          );
          console.log(`📊 Toplam işlenen: ${totalProcessed} ürün\n`);

          if (batchIndex < totalBatches - 1) {
            console.log(`⏱️ Batch arası bekleme: ${this.chunkDelay}ms...`);
            await new Promise((resolve) =>
              setTimeout(resolve, this.chunkDelay)
            );
          }
        } catch (error) {
          console.error(`❌ Batch ${batchIndex + 1} hatası:`, error.message);
          continue;
        }
      }

      console.log(`\n🎉 Bershka scraping tamamlandı!`);
      console.log(`📊 ÖZET SONUÇ: {`);
      console.log(`  totalUniqueProducts: ${allProductIds.length},`);
      console.log(`  totalProcessedProducts: ${totalProcessed}`);
      console.log(`}`);
    } catch (error) {
      console.error("❌ Scraping genel hatası:", error.message);
      throw error;
    }
  }

  async scrapeAllProductDetails() {
    try {
      const startTime = Date.now();
      console.log(
        "🚀 Bershka ürün detayları scraping başlatılıyor (BATCH MODE)..."
      );
      const allProductIds = await this.loadProductIdsFromDatabase();

      if (allProductIds.length === 0) {
        throw new Error("Veritabanında ürün ID'si bulunamadı");
      }

      console.log(
        `📦 ${allProductIds.length} unique ürün için detay scraping başlatılıyor...`
      );

      const totalBatches = Math.ceil(allProductIds.length / this.batchSize);
      let totalProcessed = 0;

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * this.batchSize;
        const endIndex = Math.min(
          startIndex + this.batchSize,
          allProductIds.length
        );
        const batchProductIds = allProductIds.slice(startIndex, endIndex);

        console.log(
          `🔄 BATCH ${batchIndex + 1}/${totalBatches} işleniyor (${
            batchProductIds.length
          } ürün)...`
        );

        try {
          const batchProducts = await this.getProductDetails(batchProductIds);

          if (batchProducts.length === 0) {
            console.log(
              `⚠️ Batch ${batchIndex + 1}: API'den ürün detayı alınamadı`
            );
            continue;
          }

          const batchProcessedProducts =
            await this._processProductsWithUniqueColors(batchProducts);

          if (batchProcessedProducts.length === 0) {
            console.log(
              `⚠️ Batch ${batchIndex + 1}: İşlenecek ürün bulunamadı`
            );
            continue;
          }

          const savedCount = await this.saveUniqueProductDetails(
            batchProcessedProducts
          );
          totalProcessed += savedCount;

          console.log(
            `✅ Batch ${
              batchIndex + 1
            }/${totalBatches} tamamlandı: ${savedCount} ürün kaydedildi`
          );
          console.log(`📊 Toplam işlenen: ${totalProcessed} ürün\n`);

          if (batchIndex < totalBatches - 1) {
            console.log(`⏱️ Batch arası bekleme: ${this.chunkDelay}ms...`);
            await new Promise((resolve) =>
              setTimeout(resolve, this.chunkDelay)
            );
          }
        } catch (error) {
          console.error(`❌ Batch ${batchIndex + 1} hatası:`, error.message);
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

      console.log("🎉 Bershka ürün detayları scraping tamamlandı!");
      console.log("📊 ÖZET SONUÇ:", result);

      return result;
    } catch (error) {
      console.error(
        "❌ Bershka ürün detayları scraping hatası:",
        error.message
      );
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

module.exports = BershkaService;

if (require.main === module) {
  const service = new BershkaService();
  const arg = process.argv[2];

  if (arg === "all") {
    console.log("🔄 Bershka tam veri tarama başlatılıyor...");
    service
      .scrapeAll()
      .then(() => {
        console.log("✅ Bershka tam veri tarama tamamlandı.");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Bershka tarama hatası:", error);
        process.exit(1);
      });
  } else if (arg === "details") {
    console.log("🔄 Bershka ürün detayları tarama başlatılıyor...");
    service
      .scrapeAllProductDetails()
      .then(() => {
        console.log("✅ Bershka ürün detayları tarama tamamlandı.");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Bershka ürün detayları tarama hatası:", error);
        process.exit(1);
      });
  } else {
    console.log("Kullanım: node services/bershka.service.js [all|details]");
    console.log("  all - Tüm kategoriler ve ürün ID'leri tara");
    console.log("  details - Var olan ürün ID'leri için renk detayları tara");
  }
}
