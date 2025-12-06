const axios = require("axios");
const db = require("../config/database");
const { createServiceLogger } = require("../utils/logger");
const progressTracker = require("./progress-tracker.service");

const logger = createServiceLogger("zara");

class ZaraService {
  constructor() {
    this.debugMode = true;
    this.brand = "zara";

    this.baseUrl = "https://www.zara.com/tr/tr";
    this.categoriesApiUrl =
      "https://www.zara.com/tr/tr/categories?categoryId=2527573&categorySeoId=2641&ajax=true";

    this.menProductsUrl = `${this.baseUrl}/category/2458839/products?ajax=true`;

    this.categories = [];
    this.lastCategoriesUpdate = null;

    this.requestDelay = 3000;
    this.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    this.lastRequestTime = 0;
    this.minRequestInterval = 5000;

    //  Debug initialization
    if (this.debugMode) {
      logger.info(`[ZARA-SERVICE] Initialized with unified DB structure for brand: ${this.brand}`);
    }
  }

  async fetchCategoriesFromAPI() {
    try {
      logger.info("Zara kategorileri API'den çekiliyor...");

      const response = await axios.get(this.categoriesApiUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
          Referer: this.baseUrl,
          "X-Requested-With": "XMLHttpRequest",
        },
        timeout: 30000,
      });

      if (response.data && response.data.categories) {
        this.categories = this.parseCategoriesFromAPI(response.data.categories);
        this.lastCategoriesUpdate = new Date();
        logger.info(`${this.categories.length} kategori başarıyla çekildi`);
        return this.categories;
      } else {
        logger.error("Kategori verisi bulunamadı");
        return [];
      }
    } catch (error) {
      logger.error("Kategoriler çekilirken hata:", error.message);
      return [];
    }
  }

  parseCategoriesFromAPI(apiCategories) {
    const parsedCategories = [];

    logger.debug("API kategorileri parse ediliyor...");
    logger.info(`Toplam ana kategori: ${apiCategories.length}`);

    apiCategories.forEach((category, index) => {
      logger.info(`\nAna kategori ${index + 1}:`, {
        name: category.name,
        sectionName: category.sectionName,
        subcategoriesCount: category.subcategories
          ? category.subcategories.length
          : 0,
      });

      if (category.subcategories) {
        category.subcategories.forEach((sub, subIndex) => {
          logger.info(`Alt kategori ${subIndex + 1}:`, {
            name: sub.name,
            redirectCategoryId: sub.redirectCategoryId,
            hasSeo: !!sub.seo,
            seoKeyword: sub.seo ? sub.seo.keyword : "YOK",
          });

          if (sub.redirectCategoryId && sub.seo && sub.seo.keyword) {
            if (!this.isExcludedCategory(sub.name)) {
              const parsedCategory = {
                id: sub.id,
                name: sub.name,
                section: category.sectionName,
                section_name: category.name,
                redirect_category_id: sub.redirectCategoryId,
                seo_keyword: sub.seo.keyword,
                url: `${this.baseUrl}/category/${sub.redirectCategoryId}/products?ajax=true`,
              };

              logger.info("Kategori eklendi: parsedCategory");
              parsedCategories.push(parsedCategory);
            } else {
              logger.error(`Kategori hariç tutuldu (${sub.name})`);
            }
          } else {
            logger.warn("Kategori atlandı - gerekli alanlar yok");
          }
        });
      }
    });

    logger.info(`\n Toplam parse edilen kategori: ${parsedCategories.length}`);
    return parsedCategories;
  }

  isExcludedCategory(categoryName) {
    const excludedKeywords = [
      "DIVIDER",
      "THE NEW",
      "ÇOK SATANLAR",
      "50. YIL DÖNÜMÜ",
      "BACK TO",
      "SPECIAL",
      "POP-UP",
      "TRAVEL",
      "JOIN LIFE",
      "CAREERS",
      "MAĞAZALAR",
      "HEDİYE KARTI",
      "UYGULAMA İNDİR",
    ];

    return excludedKeywords.some((keyword) =>
      categoryName.toUpperCase().includes(keyword.toUpperCase())
    );
  }

  async saveCategoriesToDatabase() {
    if (!this.categories || this.categories.length === 0) {
      logger.warn("Kaydedilecek kategori yok");
      return;
    }

    logger.info(`${this.categories.length} kategori veritabanına kaydediliyor...`);
    logger.debug("İlk 3 kategori örneği:");
    this.categories.slice(0, 3).forEach((cat, index) => {
      logger.info(`${index + 1}. ${cat.name} (${cat.id}) -> ${cat.redirect_category_id}`);
    });

    const stmt = db.prepare(`
            INSERT OR REPLACE INTO zara_categories (
                category_id, category_name, category_url, category, 
                redirect_category_id, seo_keyword, last_updated
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      this.categories.forEach((category, index) => {
        const categoryValue = this.mapSectionToCategory(category.section);

        logger.info(`Kategori ${index + 1} kaydediliyor:`, {
          id: category.id,
          name: category.name,
          category: categoryValue,
          redirect_id: category.redirect_category_id,
        });

        stmt.run([
          category.id,
          category.name,
          category.url,
          categoryValue,
          category.redirect_category_id,
          category.seo_keyword,
          new Date().toISOString(),
        ]);
      });

      db.run("COMMIT", (err) => {
        if (err) {
          logger.error("Kategoriler kaydedilirken hata:", err);
        } else {
          logger.info(`${this.categories.length} kategori başarıyla kaydedildi`);
        }
      });
    });

    stmt.finalize();
  }

  mapSectionToCategory(section) {
    const categoryMap = {
      WOMAN: "women",
      MAN: "men",
      KID: "kids",
      HOME: "home",
      BEAUTY: "beauty",
      ANNIVERSARY: "anniversary",
      TRAVEL: "travel",
    };

    return categoryMap[section] || "unknown";
  }

  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      logger.info(`Rate limiting: ${waitTime}ms bekleniyor...`);
      await this.delay(waitTime);
    }

    const randomDelay = Math.floor(Math.random() * 2000) + 1000;
    await this.delay(randomDelay);

    this.lastRequestTime = Date.now();
  }

  async fetchMenProducts() {
    try {
      logger.info("Erkek ürünleri tek API'den çekiliyor...");

      await this.waitForRateLimit();

      const response = await axios.get(this.menProductsUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
          Referer: this.baseUrl,
          "X-Requested-With": "XMLHttpRequest",
          "Cache-Control": "no-cache",
        },
        timeout: 30000,
      });

      logger.info(`Erkek API yanıtı alındı - Status: ${response.status}`);

      if (response.data && response.data.productGroups) {
        const products = this.parseProductData(response.data, {
          section: "MAN",
          section_name: "ERKEK",
          name: "Erkek Giyim",
        });
        logger.info(`${products.length} adet erkek ürünü başarıyla çekildi`);
        return products;
      } else {
        logger.error("Geçersiz erkek API yanıtı");
        return [];
      }
    } catch (error) {
      logger.error("Erkek ürünleri çekilirken hata:", error.message);
      return [];
    }
  }

  async fetchProducts(categoryId = null) {
    let category;

    if (categoryId) {
      category = this.categories.find((cat) => cat.id === categoryId);

      if (!category) {
        category = this.categories.find(
          (cat) => cat.redirect_category_id === categoryId
        );
      }

      if (!category) {
        logger.error(`Kategori bulunamadı: ${categoryId}`);
        return [];
      }
    } else {
      category = this.categories[0];
      if (!category) {
        logger.error("Hiç kategori bulunamadı");
        return [];
      }
    }

    try {
      logger.info(`Zara ürünleri çekiliyor... (${category.section_name} - ${category.name})`);

      await this.waitForRateLimit();

      const response = await axios.get(category.url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
          Referer: this.baseUrl,
          "X-Requested-With": "XMLHttpRequest",
          "Cache-Control": "no-cache",
        },
        timeout: 30000,
      });

      logger.info(`API yanıtı alındı - Status: ${response.status}`);

      if (response.data && response.data.productGroups) {
        const products = this.parseProductData(response.data, category);
        logger.info(`${products.length} adet ürün başarıyla çekildi (${category.name})`);
        return products;
      } else {
        logger.error("Geçersiz API yanıtı");
        return [];
      }
    } catch (error) {
      logger.error("Ürünler çekilirken hata:", error.message);
      return [];
    }
  }

  async fetchProductsWithCategory(category) {
    try {
      logger.info(`Zara ürünleri çekiliyor... (${category.section_name} - ${category.name})`);

      await this.waitForRateLimit();

      const response = await axios.get(category.url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
          Referer: this.baseUrl,
          "X-Requested-With": "XMLHttpRequest",
          "Cache-Control": "no-cache",
        },
        timeout: 30000,
      });

      logger.info("API yanıtı alındı - Status: ${response.status}");

      if (response.data && response.data.productGroups) {
        const products = this.parseProductData(response.data, category);
        logger.info(`${products.length} adet ürün başarıyla çekildi (${category.name})`);
        return products;
      } else {
        logger.error("Geçersiz API yanıtı");
        return [];
      }
    } catch (error) {
      logger.error("Ürünler çekilirken hata:", error.message);
      return [];
    }
  }

  parseProductData(apiResponse, category) {
    const products = [];

    if (!apiResponse.productGroups) return products;

    apiResponse.productGroups.forEach((group) => {
      if (group.elements) {
        group.elements.forEach((element) => {
          if (element.commercialComponents) {
            element.commercialComponents.forEach((component) => {
              if (
                component.type === "Product" &&
                component.detail &&
                component.detail.colors
              ) {
                component.detail.colors.forEach((color) => {
                  const product = this.createProductObject(
                    component,
                    color,
                    category
                  );
                  if (product) {
                    products.push(product);
                  }
                });
              }
            });
          }
        });
      }
    });

    return products;
  }

  createProductObject(component, color, category) {
    try {
      const productUrl = this.buildProductUrl(
        component.seo,
        component.id,
        color.productId
      );

      const imageUrl = this.getImageUrl(color);

      // display_reference formatı: 4592/217/401 (base reference + color id)
      const displayReference = component.detail.displayReference
        ? `${component.detail.displayReference}/${color.id}`
        : null;

      return {
        product_id: component.id.toString(),
        reference: component.reference,
        display_reference: displayReference,
        name: component.name,
        description: component.description || "",
        price: color.price || component.price,
        section: component.section,
        section_name: component.sectionName,
        brand_code: "zara",
        seo_keyword: component.seo ? component.seo.keyword : "",
        seo_product_id: component.seo ? component.seo.seoProductId : "",
        main_color_hex: component.colorInfo
          ? component.colorInfo.mainColorHexCode
          : "",
        num_additional_colors: component.colorInfo
          ? component.colorInfo.numAdditionalColors
          : 0,
        availability: color.availability || component.availability,
        image_url: imageUrl,
        product_url: productUrl,
        grid_position: component.gridPosition,
        family_name: component.familyName,
        subfamily_name: component.subfamilyName,
        color_id: color.id,
        color_name: color.name,
        category: this.mapSectionToCategory(category.section),
        category_id: category.id,
        category_name: category.name,
        last_updated: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Ürün objesi oluşturulurken hata:", error);
      return null;
    }
  }

  buildProductUrl(seo, productId, colorProductId) {
    if (seo && seo.keyword && seo.seoProductId) {
      return `${this.baseUrl}/${seo.keyword}-p${seo.seoProductId}.html?v1=${productId}&v2=${colorProductId}`;
    }
    return `${this.baseUrl}/product/${productId}`;
  }

  getImageUrl(color) {
    try {
      // Önce xmedia dizisinde JPG ara (m3u8 videolarını atla)
      if (color.xmedia && color.xmedia.length > 0) {
        for (const media of color.xmedia) {
          if (media.url && !media.url.includes('.m3u8')) {
            return media.url.replace("{width}", "750");
          }
        }
        // JPG bulunamadı ama m3u8 var, onu JPG'ye çevir
        const firstMedia = color.xmedia[0];
        if (firstMedia.url && firstMedia.url.includes('.m3u8')) {
          return this.convertM3u8ToJpg(firstMedia.url);
        }
      }
      if (color.pdpMedia && color.pdpMedia.url) {
        return color.pdpMedia.url.replace("{width}", "750");
      }
      return "";
    } catch (error) {
      logger.warn("Image URL alınamadı:", error.message);
      return "";
    }
  }

  convertM3u8ToJpg(url) {
    if (!url || !url.includes('.m3u8')) {
      return url;
    }
    // Pattern: .../04470341405-e10/master.m3u8 -> .../04470341405-e1/04470341405-e1.jpg
    const match = url.match(/\/([^\/]+)-e\d+\/master\.m3u8/);
    if (match) {
      const baseReference = match[1];
      return url.replace(/-e\d+\/master\.m3u8.*$/, `-e1/${baseReference}-e1.jpg`);
    }
    return url;
  }

  async saveProductsToDatabase(products) {
    if (!products || products.length === 0) {
      if (this.debugMode) {
        logger.info(`[ZARA-SERVICE] saveProductsToDatabase: No products to save`);
      }
      return;
    }

    logger.info(`[ZARA-SERVICE] ${products.length} ürün zara_products tablosuna kaydediliyor...`);

    if (this.debugMode) {
      logger.info("[ZARA-SERVICE] First product sample:", products[0]);
    }

    const stmt = db.prepare(`
            INSERT OR REPLACE INTO zara_products (
                product_id, reference, display_reference, name, description, price,
                section, section_name, category_id, category_name, brand_code,
                seo_keyword, seo_product_id, main_color_hex, num_additional_colors,
                availability, image_url, product_url, grid_position, family_name,
                subfamily_name, color_id, color_name, is_on_sale, sale_price, last_updated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      let processedCount = 0;
      products.forEach((product) => {
        try {
          stmt.run([
            product.product_id,
            product.reference,
            product.display_reference,
            product.name,
            product.description || "",
            product.price,
            product.section,
            product.section_name,
            product.category_id,
            product.category_name,
            product.brand_code || "zara",
            product.seo_keyword,
            product.seo_product_id,
            product.main_color_hex,
            product.num_additional_colors || 0,
            product.availability || "unknown",
            product.image_url,
            product.product_url,
            product.grid_position,
            product.family_name,
            product.subfamily_name,
            product.color_id,
            product.color_name,
            product.is_on_sale || 0,
            product.sale_price || null,
            new Date().toISOString(),
          ]);

          processedCount++;

          if (processedCount % 100 === 0) {
            logger.info(`[ZARA-SERVICE] ${processedCount}/${products.length} ürün işlendi...`);
          }

          if (this.debugMode && processedCount <= 3) {
            logger.info(`[ZARA-SERVICE] Processed product ${processedCount}:`, {
              product_id: product.product_id,
              name: product.name,
              price: product.price,
              display_reference: product.display_reference,
              color_id: product.color_id,
            });
          }
        } catch (error) {
          logger.error(`[ZARA-SERVICE] Error processing product ${product.product_id}:`, error);
        }
      });

      db.run("COMMIT", (err) => {
        if (err) {
          logger.error(`[ZARA-SERVICE] Ürünler zara_products tablosuna kaydedilirken hata:`, err);
        } else {
          logger.info(`[ZARA-SERVICE] ${processedCount} ürün başarıyla zara_products tablosuna kaydedildi`);
          if (this.debugMode) {
            logger.info(`[ZARA-SERVICE] Transaction completed successfully for brand: ${this.brand}`);
          }
        }
      });
    });

    stmt.finalize();
  }

  async getProductsFromDatabase(limit = 50, offset = 0, filters = {}) {
    return new Promise((resolve, reject) => {
      if (this.debugMode) {
        logger.info("[ZARA-SERVICE] getProductsFromDatabase called with:", {
          limit,
          offset,
          filters,
        });
      }

      let query = `SELECT * FROM zara_products WHERE 1=1`;
      const params = [];

      if (filters.category) {
        query += ` AND category = ?`;
        params.push(filters.category);
      }

      if (filters.category_id) {
        query += ` AND category_id = ?`;
        params.push(filters.category_id);
      }

      if (filters.category_name) {
        query += ` AND category_name LIKE ?`;
        params.push(`%${filters.category_name}%`);
      }

      if (filters.search) {
        query += ` AND (name LIKE ? OR description LIKE ?)`;
        params.push(`%${filters.search}%`, `%${filters.search}%`);
      }

      if (filters.availability) {
        query += ` AND availability = ?`;
        params.push(filters.availability);
      }

      query += ` ORDER BY last_updated DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      if (this.debugMode) {
        logger.info("[ZARA-SERVICE] Executing query:", query);
        logger.info("[ZARA-SERVICE] Query params:", params);
      }

      db.all(query, params, (err, rows) => {
        if (err) {
          logger.error(`[ZARA-SERVICE] getProductsFromDatabase error:`, err);
          reject(err);
        } else {
          if (this.debugMode) {
            logger.info(`[ZARA-SERVICE] Retrieved ${rows.length} products from zara_products`);
            if (rows.length > 0) {
              logger.info("[ZARA-SERVICE] First product sample:", {
                id: rows[0].id,
                product_id: rows[0].product_id,
                name: rows[0].name,
                display_reference: rows[0].display_reference,
                color_id: rows[0].color_id,
              });
            }
          }
          resolve(rows);
        }
      });
    });
  }

  async getCategoriesFromDatabase(category = null) {
    return new Promise((resolve, reject) => {
      let query = "SELECT * FROM zara_categories WHERE is_active = 1";
      const params = [];

      if (category) {
        query += " AND category = ?";
        params.push(category);
      }

      query += " ORDER BY category_name";

      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getProductById(productId) {
    return new Promise((resolve, reject) => {
      if (this.debugMode) {
        logger.info(`[ZARA-SERVICE] getProductById called with productId: ${productId}`);
      }

      const query = "SELECT * FROM zara_products WHERE product_id = ?";
      const params = [productId];

      if (this.debugMode) {
        logger.info("[ZARA-SERVICE] Query:", query);
        logger.info("[ZARA-SERVICE] Params:", params);
      }

      db.get(query, params, (err, row) => {
        if (err) {
          logger.error("[ZARA-SERVICE] getProductById error:", err);
          reject(err);
        } else {
          if (this.debugMode) {
            logger.info(`[ZARA-SERVICE] getProductById result:`,
              row
                ? {
                    id: row.id,
                    product_id: row.product_id,
                    name: row.name,
                    display_reference: row.display_reference,
                  }
                : "No product found");
          }
          resolve(row);
        }
      });
    });
  }

  async updateCacheMetadata(cacheKey, nextUpdateTime) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();

      db.run(
        `
                INSERT OR REPLACE INTO cache_metadata (cache_key, last_updated, next_update, status)
                VALUES (?, ?, ?, 'active')
            `,
        [cacheKey, now, nextUpdateTime],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getCacheMetadata(cacheKey) {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM cache_metadata WHERE cache_key = ?",
        [cacheKey],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async checkForNewProducts() {
    try {
      logger.debug("Yeni ürün kontrolü başlatılıyor...");

      const currentProductCount = await this.getCurrentProductCount();
      logger.info(`Mevcut ürün sayısı: ${currentProductCount}`);

      const newMenProductCount = await this.getQuickProductCount();
      logger.info(`API den gelen erkek ürün sayısı: ${newMenProductCount}`);

      const difference = Math.abs(
        newMenProductCount - currentProductCount * 0.4
      );
      const threshold = currentProductCount * 0.05;

      logger.info(`Fark: ${difference}, Eşik: ${threshold}`);

      const hasNewProducts = difference > threshold;
      logger.info(`Yeni ürün kontrolü sonucu: ${
          hasNewProducts ? "YENİ ÜRÜN VAR" : "YENİ ÜRÜN YOK"
        }`);

      return hasNewProducts;
    } catch (error) {
      logger.error("Yeni ürün kontrolünde hata:", error);
      return true;
    }
  }

  async getCurrentProductCount() {
    return new Promise((resolve, reject) => {
      if (this.debugMode) {
        logger.info("[ZARA-SERVICE] getCurrentProductCount called");
      }

      const query = "SELECT COUNT(*) as count FROM zara_products";

      db.get(query, [], (err, row) => {
        if (err) {
          logger.error("[ZARA-SERVICE] getCurrentProductCount error:", err);
          reject(err);
        } else {
          const count = row.count || 0;
          if (this.debugMode) {
            logger.info(`[ZARA-SERVICE] Current ${this.brand} product count: ${count}`);
          }
          resolve(count);
        }
      });
    });
  }

  async getQuickProductCount() {
    try {
      await this.waitForRateLimit();

      const response = await axios.get(this.menProductsUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
          Referer: this.baseUrl,
          "X-Requested-With": "XMLHttpRequest",
          "Cache-Control": "no-cache",
        },
        timeout: 30000,
      });

      if (response.data && response.data.productGroups) {
        let productCount = 0;
        response.data.productGroups.forEach((group) => {
          if (group.elements) {
            group.elements.forEach((element) => {
              if (element.commercialComponents) {
                element.commercialComponents.forEach((component) => {
                  if (
                    component.type === "Product" &&
                    component.detail &&
                    component.detail.colors
                  ) {
                    productCount += component.detail.colors.length;
                  }
                });
              }
            });
          }
        });
        return productCount;
      }
      return 0;
    } catch (error) {
      logger.error("Hızlı ürün sayısı kontrolünde hata:", error);
      return 0;
    }
  }

  async fetchAndSaveAllProducts(forceUpdate = false, jobId = null) {
    try {
      logger.info(`Zara ürün güncellemesi başlatılıyor... (jobId: ${jobId})`);

      if (forceUpdate) {
        logger.info("🔄 Zorla güncelleme yapılıyor...");
      }

      // Start progress tracking
      if (jobId) {
        logger.info(`📊 Progress tracking başlatılıyor - jobId: ${jobId}`);
        await this.fetchCategoriesFromAPI();
        const totalCategories = this.categories.length + 1; // +1 for men products
        logger.info(`📋 Toplam ${totalCategories} kategori bulundu`);
        progressTracker.startJob(jobId, totalCategories);
        logger.info(`✅ Progress tracker başlatıldı`);
      } else {
        logger.warn('⚠️  jobId yok - progress tracking devre dışı');
      }

      logger.info("\n1️⃣ Erkek ürünleri tek API'den çekiliyor...");
      if (jobId) {
        progressTracker.setCurrentCategory(jobId, 'Erkek Ürünleri');
      }

      const menProducts = await this.fetchMenProducts();
      if (menProducts.length > 0) {
        await this.saveProductsToDatabase(menProducts);
        await this.updateCacheMetadata(
          "zara_men_all_products",
          this.getNextUpdateTime()
        );
        logger.info(`${menProducts.length} erkek ürünü kaydedildi`);

        if (jobId) {
          progressTracker.incrementProcessed(jobId);
          progressTracker.incrementSaved(jobId, menProducts.length);
        }
      } else {
        logger.warn("Erkek ürünü bulunamadı");
      }

      const betweenSectionsDelay = Math.floor(Math.random() * 10000) + 5000;
      logger.info(`Bölümler arası bekleme: ${betweenSectionsDelay}ms`);
      await this.delay(betweenSectionsDelay);

      logger.info("\n2️⃣ Diğer kategoriler API'den çekiliyor...");
      if (!this.categories || this.categories.length === 0) {
        await this.fetchCategoriesFromAPI();
      }

      if (this.categories.length === 0) {
        logger.error("Hiç kategori bulunamadı");
        if (jobId) {
          progressTracker.failJob(jobId, new Error('Hiç kategori bulunamadı'));
        }
        return false;
      }

      await this.saveCategoriesToDatabase();

      logger.info(`${this.categories.length} kategoriden ürünler çekilecek...`);

      let totalOtherProducts = 0;
      let processedCategories = 0;

      for (let i = 0; i < this.categories.length; i++) {
        const category = this.categories[i];
        logger.info(`\n📦 Kategori işleniyor: ${category.section_name} - ${
            category.name
          } (${i + 1}/${this.categories.length})`);

        if (jobId) {
          progressTracker.setCurrentCategory(jobId, `${category.section_name} - ${category.name}`);
        }

        try {
          const products = await this.fetchProducts(category.id);
          if (products.length > 0) {
            await this.saveProductsToDatabase(products);
            await this.updateCacheMetadata(
              `zara_${category.section.toLowerCase()}_${category.id}`,
              this.getNextUpdateTime()
            );
            logger.info(`${products.length} ürün kaydedildi (${category.name})`);
            totalOtherProducts += products.length;
            processedCategories++;

            if (jobId) {
              progressTracker.incrementProcessed(jobId);
              progressTracker.incrementSaved(jobId, products.length);
            }
          } else {
            logger.warn(`${category.name} kategorisinde ürün bulunamadı`);
          }

          if (i < this.categories.length - 1) {
            const categoryDelay = Math.floor(Math.random() * 5000) + 3000;
            logger.info(`⏳ Sonraki kategori için ${categoryDelay}ms bekleniyor...`);
            await this.delay(categoryDelay);
          }
        } catch (error) {
          logger.error(`❌ ${category.name} kategorisi işlenirken hata:`,
            error.message);
          continue;
        }
      }

      const totalProducts = (menProducts?.length || 0) + totalOtherProducts;
      logger.info("✅ Tüm Zara ürünleri başarıyla güncellendi!");
      logger.info(`📊 Toplam kaydedilen ürün: ${totalProducts}`);
      logger.info(`👔 Erkek ürünleri: ${menProducts?.length || 0}`);
      logger.info(`🛍️ Diğer kategoriler: ${totalOtherProducts}`);
      logger.info(`✔️ İşlenen kategori: ${processedCategories}/${this.categories.length}`);

      if (jobId) {
        progressTracker.completeJob(jobId, totalProducts);
      }

      await this.updateLastUpdateTime();

      return {
        success: true,
        totalProducts,
        menProducts: menProducts?.length || 0,
        otherProducts: totalOtherProducts,
      };
    } catch (error) {
      logger.error("Zara ürünleri güncellenirken hata:", error);

      const errorNextUpdate = new Date();
      errorNextUpdate.setMinutes(errorNextUpdate.getMinutes() + 30);
      await this.updateCacheMetadata(
        "zara_all_products",
        errorNextUpdate.toISOString()
      );

      return { success: false, error: error.message };
    }
  }

  async getLastUpdateTime() {
    try {
      const metadata = await this.getCacheMetadata("zara_all_products");
      return metadata ? metadata.last_updated : null;
    } catch (error) {
      logger.warn("Son güncelleme zamanı alınamadı:", error.message);
      return null;
    }
  }

  async updateLastUpdateTime() {
    try {
      await this.updateCacheMetadata(
        "zara_all_products",
        this.getNextUpdateTime()
      );
      logger.info("Son güncelleme zamanı kaydedildi");
    } catch (error) {
      logger.warn("Son güncelleme zamanı kaydedilemedi:", error.message);
    }
  }

  getDaysDifference(lastUpdate) {
    const lastUpdateDate = new Date(lastUpdate);
    const now = new Date();
    const diffTime = Math.abs(now - lastUpdateDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  getNextUpdateTime() {
    const minMinutes = 45;
    const maxMinutes = 75;
    const randomMinutes =
      Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;

    const nextUpdate = new Date();
    nextUpdate.setMinutes(nextUpdate.getMinutes() + randomMinutes);

    logger.info(`⏰ Sonraki güncelleme: ${randomMinutes} dakika sonra (${nextUpdate.toLocaleString(
        "tr-TR"
      )})`);

    return nextUpdate.toISOString();
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const zaraServiceInstance = new ZaraService();
module.exports = zaraServiceInstance;

// CLI support
if (require.main === module) {
  const arg = process.argv[2];

  if (arg === "categories") {
    logger.info("Zara kategorileri çekiliyor...");
    zaraServiceInstance
      .fetchCategoriesFromAPI()
      .then((categories) => {
        logger.info(`${categories.length} kategori çekildi.`);
        return zaraServiceInstance.saveCategoriesToDatabase();
      })
      .then(() => {
        logger.info("Zara kategorileri kaydedildi.");
        process.exit(0);
      })
      .catch((error) => {
        logger.error("Zara kategori tarama hatası:", error);
        process.exit(1);
      });
  } else if (arg === "products") {
    logger.info("Zara ürünleri çekiliyor (sadece erkek)...");
    zaraServiceInstance
      .fetchMenProducts()
      .then((products) => {
        logger.info(`${products.length} erkek ürünü çekildi.`);
        return zaraServiceInstance.saveProductsToDatabase(products);
      })
      .then(() => {
        logger.info("Zara erkek ürünleri kaydedildi.");
        process.exit(0);
      })
      .catch((error) => {
        logger.error("Zara ürün tarama hatası:", error);
        process.exit(1);
      });
  } else if (arg === "all") {
    logger.info("Zara tam veri tarama başlatılıyor (tüm kategoriler)...");
    zaraServiceInstance
      .fetchAndSaveAllProducts(true)
      .then((result) => {
        logger.info("Zara tam veri tarama tamamlandı.");
        logger.info(`Toplam ${result.totalProducts} ürün kaydedildi.`);
        process.exit(0);
      })
      .catch((error) => {
        logger.error("Zara tarama hatası:", error);
        process.exit(1);
      });
  } else {
    logger.info("Kullanım: node services/zara.service.js [categories|products|all]");
    logger.info("  categories - Sadece kategorileri çek ve kaydet");
    logger.info("  products   - Sadece erkek ürünlerini çek ve kaydet");
    logger.info("  all        - Tüm kategorilerden tüm ürünleri çek ve kaydet");
    process.exit(0);
  }
}