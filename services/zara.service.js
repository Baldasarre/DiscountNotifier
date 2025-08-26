const axios = require("axios");
const db = require("../config/database");

class ZaraService {
  constructor() {
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
  }

  async fetchCategoriesFromAPI() {
    try {
      console.log("🔄 Zara kategorileri API'den çekiliyor...");

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
        console.log(`✅ ${this.categories.length} kategori başarıyla çekildi`);
        return this.categories;
      } else {
        console.log("❌ Kategori verisi bulunamadı");
        return [];
      }
    } catch (error) {
      console.error("❌ Kategoriler çekilirken hata:", error.message);
      return [];
    }
  }

  parseCategoriesFromAPI(apiCategories) {
    const parsedCategories = [];

    console.log("🔍 API kategorileri parse ediliyor...");
    console.log("📊 Toplam ana kategori:", apiCategories.length);

    apiCategories.forEach((category, index) => {
      console.log(`\n📁 Ana kategori ${index + 1}:`, {
        name: category.name,
        sectionName: category.sectionName,
        subcategoriesCount: category.subcategories
          ? category.subcategories.length
          : 0,
      });

      if (category.subcategories) {
        category.subcategories.forEach((sub, subIndex) => {
          console.log(`  📂 Alt kategori ${subIndex + 1}:`, {
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

              console.log(`  ✅ Kategori eklendi:`, parsedCategory);
              parsedCategories.push(parsedCategory);
            } else {
              console.log(`  ❌ Kategori hariç tutuldu (${sub.name})`);
            }
          } else {
            console.log(`  ⚠️ Kategori atlandı - gerekli alanlar yok`);
          }
        });
      }
    });

    console.log(
      `\n🎯 Toplam parse edilen kategori: ${parsedCategories.length}`
    );
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
      console.log("⚠️ Kaydedilecek kategori yok");
      return;
    }

    console.log(
      `💾 ${this.categories.length} kategori veritabanına kaydediliyor...`
    );
    console.log("🔍 İlk 3 kategori örneği:");
    this.categories.slice(0, 3).forEach((cat, index) => {
      console.log(
        `  ${index + 1}. ${cat.name} (${cat.id}) -> ${cat.redirect_category_id}`
      );
    });

    const stmt = db.prepare(`
            INSERT OR REPLACE INTO zara_categories (
                category_id, category_name, category_url, gender, 
                redirect_category_id, seo_keyword, last_updated
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      this.categories.forEach((category, index) => {
        const gender = this.mapSectionToGender(category.section);

        console.log(`📝 Kategori ${index + 1} kaydediliyor:`, {
          id: category.id,
          name: category.name,
          gender: gender,
          redirect_id: category.redirect_category_id,
        });

        stmt.run([
          category.id,
          category.name,
          category.url,
          gender,
          category.redirect_category_id,
          category.seo_keyword,
          new Date().toISOString(),
        ]);
      });

      db.run("COMMIT", (err) => {
        if (err) {
          console.error("❌ Kategoriler kaydedilirken hata:", err);
        } else {
          console.log(
            `✅ ${this.categories.length} kategori başarıyla kaydedildi`
          );
        }
      });
    });

    stmt.finalize();
  }

  mapSectionToGender(section) {
    const genderMap = {
      WOMAN: "women",
      MAN: "men",
      KID: "kids",
      HOME: "home",
      BEAUTY: "beauty",
      ANNIVERSARY: "anniversary",
      TRAVEL: "travel",
    };

    return genderMap[section] || "unknown";
  }

  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      console.log(`⏳ Rate limiting: ${waitTime}ms bekleniyor...`);
      await this.delay(waitTime);
    }

    const randomDelay = Math.floor(Math.random() * 2000) + 1000;
    await this.delay(randomDelay);

    this.lastRequestTime = Date.now();
  }

  async fetchMenProducts() {
    try {
      console.log("🔄 Erkek ürünleri tek API'den çekiliyor...");

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

      console.log(`✅ Erkek API yanıtı alındı - Status: ${response.status}`);

      if (response.data && response.data.productGroups) {
        const products = this.parseProductData(response.data, {
          section: "MAN",
          section_name: "ERKEK",
          name: "Erkek Giyim",
        });
        console.log(`✅ ${products.length} adet erkek ürünü başarıyla çekildi`);
        return products;
      } else {
        console.log("❌ Geçersiz erkek API yanıtı");
        return [];
      }
    } catch (error) {
      console.error("❌ Erkek ürünleri çekilirken hata:", error.message);
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
        console.error(`❌ Kategori bulunamadı: ${categoryId}`);
        return [];
      }
    } else {
      category = this.categories[0];
      if (!category) {
        console.error("❌ Hiç kategori bulunamadı");
        return [];
      }
    }

    try {
      console.log(
        `🔄 Zara ürünleri çekiliyor... (${category.section_name} - ${category.name})`
      );

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

      console.log(`✅ API yanıtı alındı - Status: ${response.status}`);

      if (response.data && response.data.productGroups) {
        const products = this.parseProductData(response.data, category);
        console.log(
          `✅ ${products.length} adet ürün başarıyla çekildi (${category.name})`
        );
        return products;
      } else {
        console.log("❌ Geçersiz API yanıtı");
        return [];
      }
    } catch (error) {
      console.error(`❌ Ürünler çekilirken hata:`, error.message);
      return [];
    }
  }

  async fetchProductsWithCategory(category) {
    try {
      console.log(
        `🔄 Zara ürünleri çekiliyor... (${category.section_name} - ${category.name})`
      );

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

      console.log(`✅ API yanıtı alındı - Status: ${response.status}`);

      if (response.data && response.data.productGroups) {
        const products = this.parseProductData(response.data, category);
        console.log(
          `✅ ${products.length} adet ürün başarıyla çekildi (${category.name})`
        );
        return products;
      } else {
        console.log("❌ Geçersiz API yanıtı");
        return [];
      }
    } catch (error) {
      console.error(`❌ Ürünler çekilirken hata:`, error.message);
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

      return {
        product_id: component.id.toString(),
        reference: component.reference,
        display_reference: component.detail.displayReference,
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
        gender: this.mapSectionToGender(category.section),
        category_id: category.id,
        category_name: category.name,
        last_updated: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Ürün objesi oluşturulurken hata:", error);
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
      if (color.xmedia && color.xmedia.length > 0 && color.xmedia[0].url) {
        return color.xmedia[0].url.replace("{width}", "750");
      }
      if (color.pdpMedia && color.pdpMedia.url) {
        return color.pdpMedia.url.replace("{width}", "750");
      }
      return "";
    } catch (error) {
      console.log("⚠️ Image URL alınamadı:", error.message);
      return "";
    }
  }

  async saveProductsToDatabase(products) {
    if (!products || products.length === 0) return;

    console.log(`💾 ${products.length} ürün veritabanına kaydediliyor...`);

    const stmt = db.prepare(`
            INSERT OR REPLACE INTO zara_products (
                product_id, reference, display_reference, name, description, price,
                section, section_name, category_id, category_name, brand_code, seo_keyword, seo_product_id,
                main_color_hex, num_additional_colors, availability, image_url,
                product_url, grid_position, family_name, subfamily_name,
                is_on_sale, sale_price, last_updated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      let processedCount = 0;
      products.forEach((product) => {
        stmt.run([
          product.product_id,
          product.reference,
          product.display_reference,
          product.name,
          product.description,
          product.price,
          product.section,
          product.section_name,
          product.category_id,
          product.category_name,
          product.brand_code,
          product.seo_keyword,
          product.seo_product_id,
          product.main_color_hex,
          product.num_additional_colors,
          product.availability,
          product.image_url,
          product.product_url,
          product.grid_position,
          product.family_name,
          product.subfamily_name,
          0,
          null,
          product.last_updated,
        ]);
        processedCount++;

        if (processedCount % 100 === 0) {
          console.log(
            `📊 ${processedCount}/${products.length} ürün işlendi...`
          );
        }
      });

      db.run("COMMIT", (err) => {
        if (err) {
          console.error("❌ Ürünler kaydedilirken hata:", err);
        } else {
          console.log(
            `✅ ${processedCount} ürün başarıyla veritabanına kaydedildi`
          );
        }
      });
    });

    stmt.finalize();
  }

  async getProductsFromDatabase(limit = 50, offset = 0, filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
                SELECT * FROM zara_products 
                WHERE 1=1
            `;
      const params = [];

      if (filters.gender) {
        query += ` AND section_name = ?`;
        params.push(filters.gender.toUpperCase());
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

      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getCategoriesFromDatabase(gender = null) {
    return new Promise((resolve, reject) => {
      let query = "SELECT * FROM zara_categories WHERE is_active = 1";
      const params = [];

      if (gender) {
        query += " AND gender = ?";
        params.push(gender);
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
      db.get(
        "SELECT * FROM zara_products WHERE product_id = ?",
        [productId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
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
      console.log("🔍 Yeni ürün kontrolü başlatılıyor...");

      const currentProductCount = await this.getCurrentProductCount();
      console.log(`📊 Mevcut ürün sayısı: ${currentProductCount}`);

      const newMenProductCount = await this.getQuickProductCount();
      console.log(`📊 API'den gelen erkek ürün sayısı: ${newMenProductCount}`);

      const difference = Math.abs(
        newMenProductCount - currentProductCount * 0.4
      );
      const threshold = currentProductCount * 0.05;

      console.log(`📊 Fark: ${difference}, Eşik: ${threshold}`);

      const hasNewProducts = difference > threshold;
      console.log(
        `🔍 Yeni ürün kontrolü sonucu: ${
          hasNewProducts ? "YENİ ÜRÜN VAR" : "YENİ ÜRÜN YOK"
        }`
      );

      return hasNewProducts;
    } catch (error) {
      console.error("❌ Yeni ürün kontrolünde hata:", error);
      return true;
    }
  }

  async getCurrentProductCount() {
    return new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM zara_products", (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count || 0);
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
      console.error("❌ Hızlı ürün sayısı kontrolünde hata:", error);
      return 0;
    }
  }

  async fetchAndSaveAllProducts(forceUpdate = false) {
    try {
      console.log("🚀 Zara ürün güncellemesi başlatılıyor...");

      if (forceUpdate) {
        console.log("🔄 Zorla güncelleme yapılıyor...");
      }

      console.log("\n1️⃣ Erkek ürünleri tek API'den çekiliyor...");
      const menProducts = await this.fetchMenProducts();
      if (menProducts.length > 0) {
        await this.saveProductsToDatabase(menProducts);
        await this.updateCacheMetadata(
          "zara_men_all_products",
          this.getNextUpdateTime()
        );
        console.log(`✅ ${menProducts.length} erkek ürünü kaydedildi`);
      } else {
        console.log("⚠️ Erkek ürünü bulunamadı");
      }

      const betweenSectionsDelay = Math.floor(Math.random() * 10000) + 5000;
      console.log(`⏳ Bölümler arası bekleme: ${betweenSectionsDelay}ms`);
      await this.delay(betweenSectionsDelay);

      console.log("\n2️⃣ Diğer kategoriler API'den çekiliyor...");
      await this.fetchCategoriesFromAPI();

      if (this.categories.length === 0) {
        console.log("❌ Hiç kategori bulunamadı");
        return false;
      }

      await this.saveCategoriesToDatabase();

      console.log(
        `📊 ${this.categories.length} kategoriden ürünler çekilecek...`
      );

      let totalOtherProducts = 0;
      let processedCategories = 0;

      for (let i = 0; i < this.categories.length; i++) {
        const category = this.categories[i];
        console.log(
          `\n🔄 Kategori işleniyor: ${category.section_name} - ${
            category.name
          } (${i + 1}/${this.categories.length})`
        );

        try {
          const products = await this.fetchProducts(category.id);
          if (products.length > 0) {
            await this.saveProductsToDatabase(products);
            await this.updateCacheMetadata(
              `zara_${category.section.toLowerCase()}_${category.id}`,
              this.getNextUpdateTime()
            );
            console.log(
              `✅ ${products.length} ürün kaydedildi (${category.name})`
            );
            totalOtherProducts += products.length;
            processedCategories++;
          } else {
            console.log(`⚠️ ${category.name} kategorisinde ürün bulunamadı`);
          }

          if (i < this.categories.length - 1) {
            const categoryDelay = Math.floor(Math.random() * 5000) + 3000;
            console.log(
              `⏳ Sonraki kategori için ${categoryDelay}ms bekleniyor...`
            );
            await this.delay(categoryDelay);
          }
        } catch (error) {
          console.error(
            `❌ ${category.name} kategorisi işlenirken hata:`,
            error.message
          );
          continue;
        }
      }

      const totalProducts = (menProducts?.length || 0) + totalOtherProducts;
      console.log(`🎉 Tüm Zara ürünleri başarıyla güncellendi!`);
      console.log(`📊 Toplam kaydedilen ürün: ${totalProducts}`);
      console.log(`📊 Erkek ürünleri: ${menProducts?.length || 0}`);
      console.log(`📊 Diğer kategoriler: ${totalOtherProducts}`);
      console.log(
        `📊 İşlenen kategori: ${processedCategories}/${this.categories.length}`
      );

      await this.updateLastUpdateTime();

      return {
        success: true,
        totalProducts,
        menProducts: menProducts?.length || 0,
        otherProducts: totalOtherProducts,
      };
    } catch (error) {
      console.error("❌ Zara ürünleri güncellenirken hata:", error);

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
      console.log("⚠️ Son güncelleme zamanı alınamadı:", error.message);
      return null;
    }
  }

  async updateLastUpdateTime() {
    try {
      await this.updateCacheMetadata(
        "zara_all_products",
        this.getNextUpdateTime()
      );
      console.log("✅ Son güncelleme zamanı kaydedildi");
    } catch (error) {
      console.log("⚠️ Son güncelleme zamanı kaydedilemedi:", error.message);
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

    console.log(
      `⏰ Sonraki güncelleme: ${randomMinutes} dakika sonra (${nextUpdate.toLocaleString(
        "tr-TR"
      )})`
    );

    return nextUpdate.toISOString();
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new ZaraService();
