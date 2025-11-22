const axios = require("axios");
const db = require("../config/database");
const config = require("../config/hm.config");
const { createServiceLogger } = require("../utils/logger");

const logger = createServiceLogger("hm");

class HMService {
  constructor() {
    this.baseUrl = config.api.baseUrl;
    this.productBaseUrl = config.api.productBaseUrl;
    this.categories = config.api.categories;
    this.brand = config.brand.name;
    this.pageSize = config.scraping.pageSize;
    this.delay = config.scraping.delay;
    this.categoryDelay = config.scraping.categoryDelay;
    this.maxRetries = config.scraping.maxRetries;
    this.categoryTimeout = config.timeouts.categoryRequest;
    this.headers = config.headers;

    // Track unique product IDs to prevent duplicates
    this.allProductIds = new Set();

    this.initializeTables();
  }

  initializeTables() {
    logger.info("Creating H&M database tables...");

    const tables = [
      {
        name: "hm_products",
        sql: `CREATE TABLE IF NOT EXISTS hm_products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          brand TEXT DEFAULT 'hm',
          price INTEGER NOT NULL,
          formatted_price TEXT,
          currency TEXT DEFAULT 'TL',
          availability TEXT,
          color_name TEXT,
          color_code TEXT,
          image_url TEXT,
          product_url TEXT,
          category_id TEXT,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      }
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
      "CREATE INDEX IF NOT EXISTS idx_hm_product_id ON hm_products(product_id)",
      "CREATE INDEX IF NOT EXISTS idx_hm_category_id ON hm_products(category_id)"
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

  /**
   * Build API URL for a specific category and page
   */
  _buildCategoryUrl(category, page = 1) {
    return `${this.baseUrl}?${category.params}&page=${page}&page-size=${this.pageSize}&pageId=${category.pageId}&categoryId=${category.categoryId}`;
  }

  /**
   * Fetch a single page from a category
   */
  async _fetchCategoryPage(category, page = 1) {
    const url = this._buildCategoryUrl(category, page);

    try {
      logger.info(`📡 Fetching ${category.name} - Page ${page}...`);

      const response = await axios.get(url, {
        headers: this.headers,
        timeout: this.categoryTimeout
      });

      if (response.data && response.data.plpList && response.data.plpList.productList) {
        const products = response.data.plpList.productList;
        const pagination = response.data.pagination;

        logger.info(`✅ Found ${products.length} products on page ${page}`);

        return {
          success: true,
          products: products,
          pagination: pagination,
          currentPage: page
        };
      } else {
        logger.warn(`⚠️ No products found in response for ${category.name} page ${page}`);
        return {
          success: false,
          products: [],
          pagination: null,
          currentPage: page
        };
      }
    } catch (error) {
      logger.error(`❌ Error fetching ${category.name} page ${page}: ${error.message}`);
      return {
        success: false,
        products: [],
        pagination: null,
        currentPage: page,
        error: error.message
      };
    }
  }

  /**
   * Fetch all pages from a single category
   */
  async _fetchAllCategoryPages(category) {
    logger.info(`\n🔄 Starting to fetch all pages from: ${category.name}`);

    const allProducts = [];
    let currentPage = 1;
    let totalPages = null;

    // Fetch first page to get total pages
    const firstPageResult = await this._fetchCategoryPage(category, currentPage);

    if (!firstPageResult.success) {
      logger.error(`❌ Failed to fetch first page of ${category.name}`);
      return {
        categoryId: category.categoryId,
        categoryName: category.name,
        products: [],
        totalPages: 0,
        success: false
      };
    }

    allProducts.push(...firstPageResult.products);
    totalPages = firstPageResult.pagination?.totalPages || 1;

    logger.info(`📊 Total pages for ${category.name}: ${totalPages}`);

    // Fetch remaining pages
    if (totalPages > 1) {
      for (let page = 2; page <= totalPages; page++) {
        await this._delay(this.delay); // Delay between pages

        const pageResult = await this._fetchCategoryPage(category, page);

        if (pageResult.success && pageResult.products.length > 0) {
          allProducts.push(...pageResult.products);
        }
      }
    }

    logger.info(`✅ Fetched total ${allProducts.length} products from ${category.name}`);

    return {
      categoryId: category.categoryId,
      categoryName: category.name,
      products: allProducts,
      totalPages: totalPages,
      success: true
    };
  }

  /**
   * Extract matching swatch for a product (where articleId === product.id)
   */
  _findMatchingSwatch(product) {
    if (!product.swatches || product.swatches.length === 0) {
      return null;
    }

    // Find swatch where articleId matches product id
    const matchingSwatch = product.swatches.find(
      swatch => swatch.articleId === product.id
    );

    return matchingSwatch || product.swatches[0]; // Fallback to first swatch if no match
  }

  /**
   * Process and map product data to our database schema
   */
  _processProduct(product, categoryId) {
    try {
      // Find matching swatch
      const swatch = this._findMatchingSwatch(product);

      if (!swatch) {
        logger.warn(`⚠️ No swatch found for product ${product.id}`);
        return null;
      }

      // Extract price (first price in prices array)
      const priceObj = product.prices && product.prices.length > 0 ? product.prices[0] : null;

      if (!priceObj) {
        logger.warn(`⚠️ No price found for product ${product.id}`);
        return null;
      }

      // Build product URL
      const productUrl = `${this.productBaseUrl}${product.url}`;

      // Extract availability
      const availability = product.availability?.stockState || "Unknown";

      return {
        product_id: product.id,
        name: product.productName,
        brand: this.brand,
        price: Math.round(priceObj.price * 100), // Convert to cents (59.99 TL -> 5999)
        formatted_price: priceObj.formattedPrice,
        currency: "TL",
        availability: availability,
        color_name: swatch.colorName || null,
        color_code: swatch.colorCode || null,
        image_url: swatch.productImage || null,
        product_url: productUrl,
        category_id: categoryId
      };
    } catch (error) {
      logger.error(`❌ Error processing product ${product.id}:`, error.message);
      return null;
    }
  }

  /**
   * Save products to database
   */
  async _saveProducts(products) {
    if (!products || products.length === 0) {
      logger.warn("No products to save");
      return 0;
    }

    logger.info(`💾 Saving ${products.length} products to database...`);

    const insertQuery = `
      INSERT OR REPLACE INTO hm_products (
        product_id, name, brand, price, formatted_price, currency,
        availability, color_name, color_code, image_url, product_url,
        category_id, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    let savedCount = 0;

    for (const product of products) {
      try {
        await new Promise((resolve, reject) => {
          db.run(
            insertQuery,
            [
              product.product_id,
              product.name,
              product.brand,
              product.price,
              product.formatted_price,
              product.currency,
              product.availability,
              product.color_name,
              product.color_code,
              product.image_url,
              product.product_url,
              product.category_id
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
        logger.error(`Error saving product ${product.product_id}:`, error.message);
      }
    }

    logger.info(`✅ Saved ${savedCount}/${products.length} products to database`);
    return savedCount;
  }

  /**
   * Main scraping function - fetch all categories
   */
  async scrapeAll() {
    logger.info("🚀 Starting H&M full scraping...");
    logger.info(`📋 Total categories to scrape: ${this.categories.length}\n`);

    const startTime = Date.now();
    let totalProductsFetched = 0;
    let totalProductsSaved = 0;

    for (let i = 0; i < this.categories.length; i++) {
      const category = this.categories[i];

      logger.info(`\n═══════════════════════════════════════════════════`);
      logger.info(`📂 Category ${i + 1}/${this.categories.length}: ${category.name}`);
      logger.info(`═══════════════════════════════════════════════════`);

      try {
        // Fetch all pages from this category
        const categoryResult = await this._fetchAllCategoryPages(category);

        if (!categoryResult.success || categoryResult.products.length === 0) {
          logger.warn(`⚠️ No products fetched from ${category.name}`);
          continue;
        }

        totalProductsFetched += categoryResult.products.length;

        // Process products and filter duplicates
        const processedProducts = [];
        let duplicateCount = 0;

        for (const rawProduct of categoryResult.products) {
          // Check if we've already seen this product ID
          if (this.allProductIds.has(rawProduct.id)) {
            duplicateCount++;
            continue;
          }

          const processedProduct = this._processProduct(rawProduct, category.categoryId);

          if (processedProduct) {
            processedProducts.push(processedProduct);
            this.allProductIds.add(rawProduct.id);
          }
        }

        logger.info(`\n📊 Category Summary:`);
        logger.info(`   - Total fetched: ${categoryResult.products.length}`);
        logger.info(`   - Duplicates skipped: ${duplicateCount}`);
        logger.info(`   - New products: ${processedProducts.length}`);

        // Save to database
        if (processedProducts.length > 0) {
          const savedCount = await this._saveProducts(processedProducts);
          totalProductsSaved += savedCount;
        }

        // Delay before next category
        if (i < this.categories.length - 1) {
          logger.info(`\n⏳ Waiting ${this.categoryDelay}ms before next category...`);
          await this._delay(this.categoryDelay);
        }

      } catch (error) {
        logger.error(`❌ Error processing category ${category.name}:`, error.message);
        continue;
      }
    }

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    logger.info(`\n\n═══════════════════════════════════════════════════`);
    logger.info(`✅ H&M SCRAPING COMPLETED!`);
    logger.info(`═══════════════════════════════════════════════════`);
    logger.info(`📊 SUMMARY:`);
    logger.info(`   - Total products fetched: ${totalProductsFetched}`);
    logger.info(`   - Unique products: ${this.allProductIds.size}`);
    logger.info(`   - Products saved to DB: ${totalProductsSaved}`);
    logger.info(`   - Duration: ${duration} seconds`);
    logger.info(`   - Timestamp: ${new Date().toISOString()}`);
    logger.info(`═══════════════════════════════════════════════════\n`);

    return {
      success: true,
      totalProductsFetched,
      uniqueProducts: this.allProductIds.size,
      totalProductsSaved,
      duration: `${duration} seconds`,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Utility delay function
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = HMService;

// CLI execution
if (require.main === module) {
  const service = new HMService();

  logger.info("Starting H&M scraping service...");
  service
    .scrapeAll()
    .then((result) => {
      logger.info("H&M scraping completed successfully");
      logger.info("Result:", JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      logger.error("H&M scraping failed:", error);
      process.exit(1);
    });
}
