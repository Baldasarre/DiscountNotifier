const db = require("../config/database");

class ProductService {
  constructor() {
    this.supportedBrands = ["zara", "bershka", "stradivarius"];
    this.defaultLimit = 20;
    this.maxLimit = 100;
  }

  /**
   * Get products from unified table with filters and pagination
   * @param {Object} options - Query options
   * @param {string} options.brand - Brand filter ('zara', 'bershka', etc.)
   * @param {number} options.page - Page number (default: 1)
   * @param {number} options.limit - Items per page (default: 20, max: 100)
   * @param {string} options.search - Search term
   * @param {string} options.availability - Availability filter
   * @param {string} options.sortBy - Sort field (default: 'last_updated')
   * @param {string} options.sortOrder - Sort order ('ASC' or 'DESC', default: 'DESC')
   * @returns {Promise<Object>} Products with pagination info
   */
  async getProducts(options = {}) {
    const {
      brand,
      page = 1,
      limit = this.defaultLimit,
      search,
      availability,
      sortBy = "last_updated",
      sortOrder = "DESC",
    } = options;

    const validatedLimit = Math.min(
      parseInt(limit) || this.defaultLimit,
      this.maxLimit
    );
    const validatedPage = Math.max(parseInt(page) || 1, 1);
    const offset = (validatedPage - 1) * validatedLimit;

    const validSortFields = ["last_updated", "price", "name", "created_at"];
    const validatedSortBy = validSortFields.includes(sortBy)
      ? sortBy
      : "last_updated";
    const validatedSortOrder = ["ASC", "DESC"].includes(
      sortOrder?.toUpperCase()
    )
      ? sortOrder.toUpperCase()
      : "DESC";

    return new Promise((resolve, reject) => {
      let tableName;
      if (brand) {
        const brandLower = brand.toLowerCase();
        if (brandLower === "zara") {
          tableName = "zara_products";
        } else if (brandLower === "bershka") {
          tableName = "bershka_unique_product_details";
        } else if (brandLower === "stradivarius") {
          tableName = "stradivarius_unique_product_details";
        } else {
          return reject(new Error(`Unsupported brand: ${brand}`));
        }
      } else {
        return this._getProductsFromAllBrands(options, resolve, reject);
      }

      let query = `SELECT *, '${brand.toLowerCase()}' as brand FROM ${tableName}`;
      const params = [];
      const conditions = [];

      if (search) {
        conditions.push("name LIKE ?");
        params.push(`%${search}%`);
      }

      if (availability) {
        conditions.push("availability = ?");
        params.push(availability);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      query += ` ORDER BY ${validatedSortBy} ${validatedSortOrder} LIMIT ? OFFSET ?`;
      params.push(validatedLimit, offset);

      db.all(query, params, (err, products) => {
        if (err) {
          console.error("❌ Error fetching products:", err);
          return reject(err);
        }

        let countQuery = "SELECT COUNT(*) as total FROM products_unified";
        const countParams = [];

        if (conditions.length > 0) {
          countQuery += " WHERE " + conditions.join(" AND ");
          countParams.push(...params.slice(0, -2));
        }

        db.get(countQuery, countParams, (err, countResult) => {
          if (err) {
            console.error("❌ Error counting products:", err);
            return reject(err);
          }

          const total = countResult.total;
          const totalPages = Math.ceil(total / validatedLimit);

          // Format products
          const formattedProducts = products.map((product) =>
            this.formatProduct(product)
          );

          resolve({
            success: true,
            products: formattedProducts,
            pagination: {
              page: validatedPage,
              limit: validatedLimit,
              total,
              totalPages,
              hasNext: validatedPage < totalPages,
              hasPrev: validatedPage > 1,
            },
          });
        });
      });
    });
  }

  /**
   * Get single product by brand and product_id
   * @param {string} brand - Brand name
   * @param {string} productId - Product ID
   * @returns {Promise<Object>} Product data
   */
  async getProductByBrandAndId(brand, productId) {
    return new Promise((resolve, reject) => {
      let query, params;

      if (brand.toLowerCase() === "stradivarius") {
        query =
          "SELECT * FROM stradivarius_unique_product_details WHERE product_id = ?";
        params = [productId];
      } else if (brand.toLowerCase() === "zara") {
        query = "SELECT * FROM zara_products WHERE product_id = ?";
        params = [productId];
      } else if (brand.toLowerCase() === "bershka") {
        query =
          "SELECT * FROM bershka_unique_product_details WHERE product_id = ?";
        params = [productId];
      } else {
        query =
          "SELECT * FROM products_unified WHERE brand = ? AND product_id = ?";
        params = [brand.toLowerCase(), productId];
      }

      db.get(query, params, (err, product) => {
        if (err) {
          console.error("❌ Error fetching product:", err);
          return reject(err);
        }

        if (!product) {
          return resolve({
            success: false,
            message: "Product not found",
          });
        }

        resolve({
          success: true,
          product: this.formatProduct(product),
        });
      });
    });
  }

  /**
   * Get product by unified table ID
   * @param {number} id - Unified products table ID
   * @returns {Promise<Object>} Product data
   */
  async getProductById(id, brand = null) {
    return new Promise((resolve, reject) => {
      let query, params;

      if (brand) {
        const brandLower = brand.toLowerCase();
        if (brandLower === "stradivarius") {
          query =
            "SELECT * FROM stradivarius_unique_product_details WHERE product_id = ?";
          params = [id];
        } else if (brandLower === "zara") {
          query = "SELECT * FROM zara_products WHERE product_id = ?";
          params = [id];
        } else if (brandLower === "bershka") {
          query =
            "SELECT * FROM bershka_unique_product_details WHERE product_id = ?";
          params = [id];
        } else {
          return reject(new Error(`Unsupported brand: ${brand}`));
        }
      } else {
        query = "SELECT * FROM products_unified WHERE id = ?";
        params = [id];
      }

      db.get(query, params, (err, product) => {
        if (err) {
          console.error("❌ Error fetching product by ID:", err);
          return reject(err);
        }

        if (!product) {
          return resolve(null);
        }

        resolve(this.formatProduct(product));
      });
    });
  }

  /**
   * Save or update product in unified table
   * @param {Object} productData - Product data
   * @param {string} productData.brand - Brand name
   * @param {string} productData.product_id - Product ID
   * @param {string} productData.name - Product name
   * @param {number} productData.price - Price in cents
   * @param {number} productData.sale_price - Sale price in cents
   * @param {string} productData.image_url - Image URL
   * @param {string} productData.product_url - Product URL
   * @param {string} productData.availability - Availability status
   * @param {Object} productData.brand_data - Brand-specific data
   * @returns {Promise<Object>} Save result
   */
  async saveProduct(productData) {
    return new Promise((resolve, reject) => {
      const {
        brand,
        product_id,
        name,
        price,
        sale_price,
        currency = "TL",
        image_url,
        product_url,
        availability = "UNKNOWN",
        brand_data = {},
      } = productData;

      if (!brand || !product_id || !name) {
        return reject(
          new Error("Missing required fields: brand, product_id, name")
        );
      }

      const query = `
        INSERT OR REPLACE INTO products_unified (
          brand, product_id, name, price, sale_price, currency, 
          image_url, product_url, availability, brand_data, 
          last_updated, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(
          (SELECT created_at FROM products_unified WHERE brand = ? AND product_id = ?),
          ?
        ))
      `;

      const now = new Date().toISOString();
      const params = [
        brand.toLowerCase(),
        product_id,
        name,
        price,
        sale_price,
        currency,
        image_url,
        product_url,
        availability,
        JSON.stringify(brand_data),
        now,
        brand.toLowerCase(),
        product_id,
        now,
      ];

      db.run(query, params, function (err) {
        if (err) {
          console.error("❌ Error saving product:", err);
          return reject(err);
        }

        console.log(
          `✅ Product saved: ${brand}/${product_id} (ID: ${this.lastID})`
        );

        resolve({
          success: true,
          message: "Product saved successfully",
          productId: this.lastID,
          inserted: this.changes > 0,
        });
      });
    });
  }

  /**
   * Get product statistics by brand
   * @param {string} brand - Brand name (optional)
   * @returns {Promise<Object>} Statistics
   */
  async getProductStats(brand = null) {
    return new Promise((resolve, reject) => {
      if (brand) {
        const brandLower = brand.toLowerCase();
        let tableName, saleColumn;

        if (brandLower === "zara") {
          tableName = "zara_products";
          saleColumn = "sale_price";
        } else if (brandLower === "bershka") {
          tableName = "bershka_unique_product_details";
          saleColumn = "sale_price";
        } else if (brandLower === "stradivarius") {
          tableName = "stradivarius_unique_product_details";
          saleColumn = "old_price";
        } else {
          return reject(new Error(`Unsupported brand: ${brand}`));
        }

        let query = `
          SELECT 
            '${brandLower}' as brand,
            COUNT(*) as total_products,
            COUNT(CASE WHEN availability = 'in_stock' THEN 1 END) as in_stock,
            COUNT(CASE WHEN availability = 'out_of_stock' THEN 1 END) as out_of_stock,
            COUNT(CASE WHEN ${saleColumn} IS NOT NULL AND ${saleColumn} > 0 THEN 1 END) as on_sale,
            MIN(price) as min_price,
            MAX(price) as max_price,
            AVG(price) as avg_price,
            MAX(last_updated) as last_update
          FROM ${tableName}
        `;

        db.all(query, [], (err, stats) => {
          if (err) {
            console.error("❌ Error fetching product stats:", err);
            return reject(err);
          }

          const formattedStats = (Array.isArray(stats) ? stats : [stats]).map(
            (stat) => ({
              ...stat,
              min_price: stat.min_price
                ? (stat.min_price / 100).toFixed(2)
                : "0.00",
              max_price: stat.max_price
                ? (stat.max_price / 100).toFixed(2)
                : "0.00",
              avg_price: stat.avg_price
                ? (stat.avg_price / 100).toFixed(2)
                : "0.00",
              last_update_formatted: stat.last_update
                ? new Date(stat.last_update).toLocaleString("tr-TR")
                : "Never updated",
            })
          );

          resolve({
            success: true,
            stats: formattedStats[0],
          });
        });
      } else {
        let query = `
          SELECT 
            brand,
            COUNT(*) as total_products,
            COUNT(CASE WHEN availability = 'in_stock' THEN 1 END) as in_stock,
            COUNT(CASE WHEN availability = 'out_of_stock' THEN 1 END) as out_of_stock,
            SUM(CASE WHEN sale_price IS NOT NULL AND sale_price > 0 THEN 1 ELSE 0 END) as on_sale_bershka,
            SUM(CASE WHEN sale_price IS NOT NULL AND sale_price > 0 THEN 1 ELSE 0 END) as on_sale_zara,
            SUM(CASE WHEN old_price IS NOT NULL AND old_price > 0 THEN 1 ELSE 0 END) as on_sale_stradivarius,
            MIN(price) as min_price,
            MAX(price) as max_price,
            AVG(price) as avg_price,
            MAX(last_updated) as last_update
          FROM products_unified
          GROUP BY brand
        `;

        db.all(query, [], (err, stats) => {
          if (err) {
            console.error("❌ Error fetching product stats:", err);
            return reject(err);
          }

          const formattedStats = stats.map((stat) => {
            const onSaleCount =
              stat.brand === "stradivarius"
                ? stat.on_sale_stradivarius
                : stat.on_sale_bershka + stat.on_sale_zara;

            return {
              ...stat,
              on_sale: onSaleCount,
              min_price: stat.min_price
                ? (stat.min_price / 100).toFixed(2)
                : "0.00",
              max_price: stat.max_price
                ? (stat.max_price / 100).toFixed(2)
                : "0.00",
              avg_price: stat.avg_price
                ? (stat.avg_price / 100).toFixed(2)
                : "0.00",
              last_update_formatted: stat.last_update
                ? new Date(stat.last_update).toLocaleString("tr-TR")
                : "Never updated",
            };
          });

          resolve({
            success: true,
            stats: formattedStats,
          });
        });
      }
    });
  }

  /**
   * Search products across all brands
   * @param {string} searchTerm - Search term
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async searchProducts(searchTerm, options = {}) {
    const { brand, limit = 50 } = options;

    if (!searchTerm || searchTerm.trim().length < 2) {
      return {
        success: false,
        message: "Search term must be at least 2 characters",
      };
    }

    return this.getProducts({
      search: searchTerm.trim(),
      brand,
      limit,
      sortBy: "name",
      sortOrder: "ASC",
    });
  }

  /**
   * Format product for API response
   * @param {Object} product - Raw product from database
   * @returns {Object} Formatted product
   */
  formatProduct(product) {
    let brandData = {};
    if (product.brand_data) {
      if (typeof product.brand_data === "string") {
        try {
          brandData = JSON.parse(product.brand_data);
        } catch (e) {
          console.error("Invalid JSON in brand_data:", product.brand_data);
          brandData = {};
        }
      } else if (typeof product.brand_data === "object") {
        brandData = product.brand_data;
      }
    }

    const formatted = {
      id: product.id,
      brand: product.brand,
      product_id: product.product_id,
      name: product.name,
      title: product.name,
      price: product.price,
      sale_price: product.sale_price,
      currency: product.currency || "TL",
      formattedPrice: product.price
        ? (product.price / 100).toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }) + " TL"
        : "Price not available",
      formattedSalePrice: product.sale_price
        ? (product.sale_price / 100).toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }) +
          " " +
          (product.currency || "TL")
        : null,
      image_url: product.image_url,
      imageUrl: product.image_url,
      product_url: product.product_url,
      availability: product.availability,
      last_updated: product.last_updated,
      created_at: product.created_at,
      brand_data: brandData,
    };

    if (product.brand === "zara") {
      formatted.discountStatus = brandData.is_on_sale
        ? "İNDİRİMDE!"
        : "TAKİP EDİLİYOR";
      formatted.reference = brandData.reference;
      formatted.section = brandData.section_name;
      formatted.familyName = brandData.family_name;
    } else if (product.brand === "bershka") {
      formatted.discountStatus = product.sale_price
        ? "İNDİRİMDE!"
        : "TAKİP EDİLİYOR";
      formatted.sizes = brandData.sizes || [];
      formatted.colors = brandData.colors || [];
    }

    if (
      formatted.image_url &&
      !formatted.image_url.includes("/api/image-proxy") &&
      (formatted.image_url.includes("zara.net") ||
        formatted.image_url.includes("bershka.net") ||
        formatted.image_url.includes("static.e-stradivarius.net"))
    ) {
      formatted.imgSrc =
        "/api/image-proxy?url=" + encodeURIComponent(formatted.image_url);
    } else {
      formatted.imgSrc =
        formatted.image_url || "/Images/" + product.brand + ".png";
    }

    formatted.brandLogoSrc = "/Images/" + product.brand + ".png";

    formatted.imageUrl = formatted.imgSrc;

    return formatted;
  }

  /**
   * Clean up old products (older than specified days)
   * @param {number} daysOld - Products older than this many days will be removed
   * @param {string} brand - Brand filter (optional)
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupOldProducts(daysOld = 30, brand = null) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffISO = cutoffDate.toISOString();

    return new Promise((resolve, reject) => {
      let query = "DELETE FROM products_unified WHERE last_updated < ?";
      const params = [cutoffISO];

      if (brand) {
        query += " AND brand = ?";
        params.push(brand.toLowerCase());
      }

      db.run(query, params, function (err) {
        if (err) {
          console.error("❌ Error cleaning up old products:", err);
          return reject(err);
        }

        console.log(
          "✅ Cleaned up " +
            this.changes +
            " old products (older than " +
            daysOld +
            " days)"
        );

        resolve({
          success: true,
          message: "Removed " + this.changes + " old products",
          removedCount: this.changes,
          cutoffDate: cutoffISO,
        });
      });
    });
  }

  /**
   * Get products from all brand tables when no brand filter is specified
   * @private
   */
  _getProductsFromAllBrands(options, resolve, reject) {
    const {
      page = 1,
      limit = this.defaultLimit,
      search,
      availability,
      sortBy = "last_updated",
      sortOrder = "DESC",
    } = options;

    const validatedLimit = Math.min(
      parseInt(limit) || this.defaultLimit,
      this.maxLimit
    );
    const validatedPage = Math.max(parseInt(page) || 1, 1);
    const offset = (validatedPage - 1) * validatedLimit;

    const validSortFields = ["last_updated", "price", "name", "created_at"];
    const validatedSortBy = validSortFields.includes(sortBy)
      ? sortBy
      : "last_updated";
    const validatedSortOrder = ["ASC", "DESC"].includes(
      sortOrder?.toUpperCase()
    )
      ? sortOrder.toUpperCase()
      : "DESC";

    let query = `
      SELECT *, 'zara' as brand FROM zara_products
      UNION ALL
      SELECT *, 'bershka' as brand FROM bershka_unique_product_details
      UNION ALL
      SELECT *, 'stradivarius' as brand FROM stradivarius_unique_product_details
    `;

    const params = [];
    const conditions = [];

    if (search) {
      conditions.push("name LIKE ?");
      params.push(`%${search}%`);
    }

    if (availability) {
      conditions.push("availability = ?");
      params.push(availability);
    }

    if (conditions.length > 0) {
      query = `SELECT * FROM (${query}) WHERE ` + conditions.join(" AND ");
    }

    query += ` ORDER BY ${validatedSortBy} ${validatedSortOrder} LIMIT ? OFFSET ?`;
    params.push(validatedLimit, offset);

    db.all(query, params, (err, products) => {
      if (err) {
        console.error("❌ Error fetching products from all brands:", err);
        return reject(err);
      }

      let countQuery = `
        SELECT COUNT(*) as total FROM (
          SELECT id FROM zara_products
          UNION ALL
          SELECT id FROM bershka_unique_product_details  
          UNION ALL
          SELECT id FROM stradivarius_unique_product_details
        )
      `;
      const countParams = [];

      if (conditions.length > 0) {
        countQuery =
          `
          SELECT COUNT(*) as total FROM (
            SELECT id, name, availability FROM zara_products
            UNION ALL
            SELECT id, name, availability FROM bershka_unique_product_details
            UNION ALL
            SELECT id, name, availability FROM stradivarius_unique_product_details
          )
          WHERE ` + conditions.join(" AND ");
        countParams.push(...params.slice(0, -2));
      }

      db.get(countQuery, countParams, (err, countResult) => {
        if (err) {
          console.error("❌ Error counting products from all brands:", err);
          return reject(err);
        }

        const total = countResult.total;
        const totalPages = Math.ceil(total / validatedLimit);

        const formattedProducts = products.map((product) =>
          this.formatProduct(product)
        );

        resolve({
          success: true,
          products: formattedProducts,
          pagination: {
            page: validatedPage,
            limit: validatedLimit,
            total,
            totalPages,
            hasNext: validatedPage < totalPages,
            hasPrev: validatedPage > 1,
          },
        });
      });
    });
  }
}

module.exports = new ProductService();
