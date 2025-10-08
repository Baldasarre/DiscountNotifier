const db = require("../config/database");
const productService = require("./product.service");
const cacheManager = require("../utils/cache");
const { createServiceLogger } = require("../utils/logger");

const logger = createServiceLogger("tracking");

class TrackingService {
  constructor() {
    this.maxTrackedPerUser = 10;
    this.supportedBrands = ["zara", "bershka", "stradivarius"];

    // Brand to table mapping for dynamic JOINs
    this.brandTableMap = {
      zara: "zara_products",
      bershka: "bershka_unique_product_details",
      stradivarius: "stradivarius_unique_product_details"
    };
  }

  /**
   * Helper function to handle Bershka product matching with color support
   * @param {string} productId - Extracted product ID from URL
   * @param {string} colorId - Extracted color ID from URL (optional)
   * @returns {Promise<Object>} Product matching result
   */
  async handleBershkaProductMatching(productId, colorId = null) {
    logger.info("[BERSHKA] handleBershkaProductMatching - productId: ${productId}, colorId: ${colorId}");

    return new Promise(async (resolve, reject) => {
      // First, try to find the product with the main product ID
      const query = "SELECT * FROM bershka_unique_product_details WHERE product_id = ?";

      db.get(query, [productId], async (err, baseProduct) => {
        if (err) {
          logger.error("[BERSHKA] Database error:", err);
          return reject(err);
        }

        if (!baseProduct) {
          logger.info("📡 [BERSHKA] Product not in DB, attempting API fetch...");

          try {
            // Try fetching from API
            const apiProduct = await this.fetchProductFromAPI("bershka", productId, colorId);

            if (apiProduct) {
              logger.info(`✅ [BERSHKA] Product ${productId} fetched from API`);

              // Reload from DB to get consistent format
              db.get(query, [productId], (err2, reloadedProduct) => {
                if (err2) {
                  logger.error("[BERSHKA] Error reloading product:", err2);
                  return reject(err2);
                }

                if (reloadedProduct) {
                  logger.info("[BERSHKA] Found product after API fetch: ${reloadedProduct.name}");

                  // Return the fetched product (API already handled color variants)
                  return resolve({
                    success: true,
                    product: reloadedProduct,
                    productId: reloadedProduct.product_id
                  });
                } else {
                  return resolve({
                    success: false,
                    message: `Product ${productId} fetched but not found in DB after save`,
                    productId: null
                  });
                }
              });
              return; // Exit early to avoid double resolution
            } else {
              logger.error("[BERSHKA] API fetch failed for ${productId}");
              return resolve({
                success: false,
                message: `Product with ID ${productId} not found in database or API`,
                productId: null
              });
            }
          } catch (apiError) {
            logger.error("[BERSHKA] API fetch error:", apiError.message);
            return resolve({
              success: false,
              message: `Failed to fetch product from API: ${apiError.message}`,
              productId: null
            });
          }
        }

        logger.info("[BERSHKA] Found base product: ${baseProduct.name}, color_id: ${baseProduct.color_id}");

        // If no colorId in URL, return the base product
        if (!colorId) {
          logger.info("[BERSHKA] No color specified, using base product");
          return resolve({
            success: true,
            product: baseProduct,
            productId: baseProduct.product_id
          });
        }

        // If colorId matches the base product's color_id, return base product
        if (baseProduct.color_id === colorId) {
          logger.info("[BERSHKA] Color matches base product (${colorId})");
          return resolve({
            success: true,
            product: baseProduct,
            productId: baseProduct.product_id
          });
        }

        // Color doesn't match, check catentryIds for the requested color
        logger.debug("[BERSHKA] Color mismatch (${colorId} vs ${baseProduct.color_id}), checking catentryIds...");

        if (!baseProduct.catentryIds) {
          logger.error("[BERSHKA] No catentryIds found for product ${productId}");
          return resolve({
            success: false,
            message: `Color ${colorId} not available for this product`,
            productId: null
          });
        }

        let catentryIds;
        try {
          catentryIds = typeof baseProduct.catentryIds === 'string'
            ? JSON.parse(baseProduct.catentryIds)
            : baseProduct.catentryIds;
        } catch (parseError) {
          logger.error("[BERSHKA] Failed to parse catentryIds: parseError");
          return resolve({
            success: false,
            message: `Invalid catentryIds data for product ${productId}`,
            productId: null
          });
        }

        logger.debug("[BERSHKA] Searching in catentryIds: catentryIds");

        // Find the color in catentryIds
        const colorEntry = catentryIds.find(entry => entry.id === colorId);

        if (!colorEntry) {
          logger.error("[BERSHKA] Color ${colorId} not found in catentryIds");
          return resolve({
            success: false,
            message: `Color ${colorId} not available for this product`,
            productId: null
          });
        }

        logger.info("[BERSHKA] Found color entry: colorEntry");

        // Now find the product with the catentryId
        const colorProductQuery = "SELECT * FROM bershka_unique_product_details WHERE product_id = ?";

        db.get(colorProductQuery, [colorEntry.catentryId], (err, colorProduct) => {
          if (err) {
            logger.error("[BERSHKA] Error finding color product:", err);
            return reject(err);
          }

          if (!colorProduct) {
            logger.error("[BERSHKA] Color product not found with catentryId: ${colorEntry.catentryId}");
            return resolve({
              success: false,
              message: `Color variant product not found in database`,
              productId: null
            });
          }

          logger.info("[BERSHKA] Found color product: ${colorProduct.name}, ID: ${colorProduct.product_id}");

          resolve({
            success: true,
            product: colorProduct,
            productId: colorProduct.product_id
          });
        });
      });
    });
  }

  /**
   * Helper function to handle Zara reference code lookup
   * @param {string} refCode - Reference code in format XXXX/XXX/XXX (4592/217/401)
   * @returns {Promise<Object>} Product lookup result
   */
  async handleZaraRefCode(refCode) {
    logger.info(`[ZARA] handleZaraRefCode - refCode: ${refCode}`);

    return new Promise((resolve, reject) => {
      const query = "SELECT * FROM zara_products WHERE display_reference = ?";

      db.get(query, [refCode], (err, product) => {
        if (err) {
          logger.error("[ZARA] Database error for ref code:", err);
          return reject(err);
        }

        if (!product) {
          logger.error(`[ZARA] No product found with reference: ${refCode}`);
          return resolve({
            success: false,
            message: `Product with reference ${refCode} not found`,
            productId: null
          });
        } else {
          logger.info(`[ZARA] Found product by reference: ${product.name}, ID: ${product.product_id}`);
          return resolve({
            success: true,
            product: product,
            productId: product.product_id
          });
        }
      });
    });
  }

  /**
   * Helper function to handle Bershka reference code lookup
   * @param {string} refCode - Reference code in format XXXX/XXX/XXX
   * @returns {Promise<Object>} Product lookup result
   */
  async handleBershkaRefCode(refCode) {
    logger.info(`[BERSHKA] handleBershkaRefCode - refCode: ${refCode}`);

    return new Promise((resolve, reject) => {
      const query = "SELECT * FROM bershka_unique_product_details WHERE reference = ?";

      db.get(query, [refCode], (err, product) => {
        if (err) {
          logger.error("[BERSHKA] Database error for ref code:", err);
          return reject(err);
        }

        if (!product) {
          logger.error(`[BERSHKA] No product found with reference: ${refCode}`);
          return resolve({
            success: false,
            message: `Product with reference ${refCode} not found`,
            productId: null
          });
        }

        logger.info(`[BERSHKA] Found product by reference: ${product.name}, ID: ${product.product_id}`);

        resolve({
          success: true,
          product: product,
          productId: product.product_id
        });
      });
    });
  }

  /**
   * Helper function to handle Stradivarius product lookup by product ID
   * @param {string} productId - Product ID extracted from pelement parameter
   * @returns {Promise<Object>} Product lookup result
   */
  async handleStradivariusProductLookup(productId) {
    logger.info("[STRADIVARIUS] handleStradivariusProductLookup - productId: ${productId}");

    return new Promise(async (resolve, reject) => {
      const query = "SELECT * FROM stradivarius_unique_product_details WHERE product_id = ?";

      db.get(query, [productId], async (err, product) => {
        if (err) {
          logger.error("[STRADIVARIUS] Database error:", err);
          return reject(err);
        }

        if (!product) {
          logger.info("📡 [STRADIVARIUS] Product not in DB, attempting API fetch...");

          try {
            // Try fetching from API
            const apiProduct = await this.fetchProductFromAPI("stradivarius", productId, null);

            if (apiProduct) {
              logger.info(`✅ [STRADIVARIUS] Product ${productId} fetched from API`);

              // Reload from DB to get consistent format
              db.get(query, [productId], (err2, reloadedProduct) => {
                if (err2) {
                  logger.error("[STRADIVARIUS] Error reloading product:", err2);
                  return reject(err2);
                }

                if (reloadedProduct) {
                  logger.info("[STRADIVARIUS] Found product after API fetch: ${reloadedProduct.name}");
                  return resolve({
                    success: true,
                    product: reloadedProduct,
                    productId: reloadedProduct.product_id
                  });
                } else {
                  return resolve({
                    success: false,
                    message: `Product ${productId} fetched but not found in DB after save`,
                    productId: null
                  });
                }
              });
            } else {
              logger.error("[STRADIVARIUS] API fetch failed for ${productId}");
              return resolve({
                success: false,
                message: `Product with ID ${productId} not found in database or API`,
                productId: null
              });
            }
          } catch (apiError) {
            logger.error("[STRADIVARIUS] API fetch error:", apiError.message);
            return resolve({
              success: false,
              message: `Failed to fetch product from API: ${apiError.message}`,
              productId: null
            });
          }
        } else {
          logger.info("[STRADIVARIUS] Found product: ${product.name}, ID: ${product.product_id}");
          resolve({
            success: true,
            product: product,
            productId: product.product_id
          });
        }
      });
    });
  }

  /**
   * Helper function to handle Stradivarius reference code lookup (with LIMIT 1 for duplicates)
   * @param {string} refCode - Reference code in format XXXX/XXX/XXX
   * @returns {Promise<Object>} Product lookup result
   */
  async handleStradivariusRefCode(refCode) {
    logger.info(`[STRADIVARIUS] handleStradivariusRefCode - refCode: ${refCode}`);

    return new Promise((resolve, reject) => {
      // Use ORDER BY id ASC LIMIT 1 to get the first (oldest) record for duplicates
      const query = "SELECT * FROM stradivarius_unique_product_details WHERE reference = ? ORDER BY id ASC LIMIT 1";

      db.get(query, [refCode], (err, product) => {
        if (err) {
          logger.error("[STRADIVARIUS] Database error for ref code:", err);
          return reject(err);
        }

        if (!product) {
          logger.error(`[STRADIVARIUS] No product found with reference: ${refCode}`);
          return resolve({
            success: false,
            message: `Product with reference ${refCode} not found`,
            productId: null
          });
        }

        logger.info(`[STRADIVARIUS] Found product by reference: ${product.name}, ID: ${product.product_id} (first match from duplicates)`);

        resolve({
          success: true,
          product: product,
          productId: product.product_id
        });
      });
    });
  }

  /**
   * Add product to user's tracking list (using brand-specific tables)
   * @param {string} userId - User ID
   * @param {string} brand - Brand name
   * @param {string} productId - Product ID
   * @param {Object} options - Additional tracking options
   * @param {number} options.priceAlertThreshold - Price alert threshold
   * @param {boolean} options.stockAlert - Enable stock alerts
   * @param {boolean} options.notificationEnabled - Enable notifications
   * @param {Object} options.customSettings - Brand-specific settings
   * @returns {Promise<Object>} Tracking result
   */
  async addProductTracking(userId, brand, productId, options = {}) {
    const {
      priceAlertThreshold,
      stockAlert = true,
      notificationEnabled = true,
      customSettings = {},
    } = options;

    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION", async (err) => {
          if (err) {
            return reject(err);
          }

          try {
            // Save 'this' context for setImmediate callbacks
            const self = this;

            // Parallel fetch: count + product (optimization)
            const [currentCount, product] = await Promise.all([
              this.getUserTrackingCount(userId),
              productService.getProductById(productId, brand)
            ]);

            if (currentCount >= this.maxTrackedPerUser) {
              db.run("ROLLBACK");
              return resolve({
                success: false,
                message: `Maximum ${this.maxTrackedPerUser} products can be tracked`,
                currentCount,
              });
            }

            let finalProduct = product;

            // If product not in DB, try fetching from API (Bershka/Stradivarius only)
            if (!finalProduct) {
              logger.info(
                `📡 Product ${productId} not found in DB, attempting API fetch for ${brand}`
              );

              try {
                const apiProduct = await this.fetchProductFromAPI(
                  brand,
                  productId,
                  customSettings?.colorId
                );

                if (apiProduct) {
                  logger.info(
                    `✅ Product ${productId} fetched from API and saved to DB`
                  );
                  // Use API product directly (no need to reload from DB - ~50ms saved)
                  finalProduct = apiProduct;
                  logger.info(`⚡ Optimization: Skipped DB reload, using API product directly`);
                } else {
                  db.run("ROLLBACK");
                  return resolve({
                    success: false,
                    message:
                      brand === "zara"
                        ? "Zara products must be pre-scraped. Product not found in catalog."
                        : `Failed to fetch ${brand} product from API. Product may not exist.`,
                    productId,
                    brand,
                  });
                }
              } catch (apiError) {
                logger.error(
                  `❌ API fetch failed for ${brand} ${productId}:`,
                  apiError.message
                );
                db.run("ROLLBACK");
                return resolve({
                  success: false,
                  message: `Failed to fetch product from API: ${apiError.message}`,
                  productId,
                  brand,
                });
              }
            }

            if (!finalProduct) {
              db.run("ROLLBACK");
              return resolve({
                success: false,
                message:
                  "Product not found in catalog. Please try again later.",
                productId,
                brand,
              });
            }

            if (brand === "bershka") {
              logger.info(
                ` [TRACKING] Fetching Bershka detail from unique details table...`
              );

              try {
                const colorId = customSettings?.colorId;
                const bershkaUniqueId = colorId
                  ? `${productId}_${colorId}`
                  : `${productId}_default`;

                logger.info(
                  ` [TRACKING] Looking for Bershka unique product: ${bershkaUniqueId}`
                );

                const detailProduct = await new Promise((resolve, reject) => {
                  const db = require("../config/database");
                  db.get(
                    "SELECT * FROM bershka_unique_product_details WHERE unique_id = ?",
                    [bershkaUniqueId],
                    (err, row) => {
                      if (err) reject(err);
                      else resolve(row);
                    }
                  );
                });

                if (detailProduct) {
                  logger.info(
                    ` [TRACKING] Found Bershka detail: ${detailProduct.name}, Price: ${detailProduct.price}`
                  );

                  const updateQuery =
                    "UPDATE bershka_unique_product_details SET price = ?, image_url = ?, name = ?, last_updated = ? WHERE product_id = ?";
                  const params = [
                    detailProduct.price,
                    detailProduct.image_url,
                    detailProduct.name,
                    new Date().toISOString(),
                    productId,
                  ];

                  await new Promise((resolve, reject) => {
                    const db = require("../config/database");
                    db.run(updateQuery, params, function (err) {
                      if (err) {
                        logger.error(
                          ` [TRACKING] Failed to update Bershka product ${productId}:`,
                          err
                        );
                        reject(err);
                      } else {
                        logger.info(
                          ` [TRACKING] Updated Bershka product ${productId} with detail info`
                        );
                        resolve();
                      }
                    });
                  });

                  finalProduct = await productService.getProductById(
                    productId,
                    brand
                  );
                } else {
                  logger.info(
                    `️ [TRACKING] No detail found for Bershka unique ID: ${bershkaUniqueId}`
                  );
                }
              } catch (detailError) {
                logger.error(
                  `️ [TRACKING] Failed to fetch Bershka detail for ${productId}:`,
                  detailError.message
                );
              }
            }

            // STRADIVARIUS: Schedule background detail fetch (non-blocking)
            if (brand === "stradivarius") {
              const colorId = customSettings?.colorId;

              // Schedule async update (don't await - fire and forget)
              setImmediate(() => {
                self.updateStradivariusDetailAsync(productId, colorId).catch(err => {
                  logger.error(`Background Stradivarius update failed for ${productId}:`, err.message);
                });
              });

              logger.info(`⚡ Stradivarius detail update scheduled in background for ${productId}`);
            }

            // Check if already tracking this product
            const existingTracking = await this.getTrackingRecord(
              userId,
              brand,
              productId
            );

            if (existingTracking) {
              // Update existing tracking
              const updateResult = await this.updateTrackingRecord(
                existingTracking.id,
                {
                  last_checked: new Date().toISOString(),
                  notification_enabled: notificationEnabled,
                  price_alert_threshold: priceAlertThreshold,
                  stock_alert: stockAlert,
                  custom_settings: customSettings,
                }
              );

              db.run("COMMIT", async (err) => {
                if (err) {
                  return reject(err);
                }

                logger.info(
                  `✅ Product tracking updated: User ${userId} -> ${brand}/${productId}`
                );

                // Invalidate cache immediately and warm it up synchronously
                cacheManager.invalidateUserTracking(userId);

                // Warm cache synchronously before responding
                self.getUserTrackedProducts(userId, { forceRefresh: true })
                  .then(() => {
                    resolve({
                      success: true,
                      message: "Product tracking updated",
                      product: finalProduct,
                      trackingId: existingTracking.id,
                      isUpdate: true,
                    });
                  })
                  .catch(e => {
                    logger.error(`Cache warming failed for ${userId}:`, e.message);
                    // Still resolve even if cache warming fails
                    resolve({
                      success: true,
                      message: "Product tracking updated",
                      product: finalProduct,
                      trackingId: existingTracking.id,
                      isUpdate: true,
                    });
                  });
              });
            } else {
              // Insert new tracking record (directly to user_tracked_products)
              const insertQuery = `
                INSERT INTO user_tracked_products (
                  user_id, brand, product_id, tracking_started_at,
                  last_checked, notification_enabled, price_alert_threshold,
                  stock_alert, custom_settings
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `;

              const now = new Date().toISOString();
              const params = [
                userId,
                brand,
                productId,
                now,
                now,
                notificationEnabled ? 1 : 0,
                priceAlertThreshold,
                stockAlert ? 1 : 0,
                JSON.stringify(customSettings),
              ];

              db.run(insertQuery, params, function (err) {
                if (err) {
                  logger.error("Error adding product tracking:", err);
                  db.run("ROLLBACK");
                  return reject(err);
                }

                db.run("COMMIT", async (err) => {
                  if (err) {
                    return reject(err);
                  }

                  logger.info(
                    `✅ Product tracking added: User ${userId} -> ${brand}/${productId}`
                  );

                  // Invalidate cache immediately and warm it up synchronously
                  cacheManager.invalidateUserTracking(userId);

                  // Warm cache synchronously before responding
                  self.getUserTrackedProducts(userId, { forceRefresh: true })
                    .then(() => {
                      resolve({
                        success: true,
                        message: "Product successfully added to tracking list",
                        product: finalProduct,
                        trackingId: this.lastID,
                        isUpdate: false,
                        currentCount: currentCount + 1,
                      });
                    })
                    .catch(e => {
                      logger.error(`Cache warming failed for ${userId}:`, e.message);
                      // Still resolve even if cache warming fails
                      resolve({
                        success: true,
                        message: "Product successfully added to tracking list",
                        product: finalProduct,
                        trackingId: this.lastID,
                        isUpdate: false,
                        currentCount: currentCount + 1,
                      });
                    });
                });
              });
            }
          } catch (error) {
            db.run("ROLLBACK");
            reject(error);
          }
        });
      });
    });
  }

  /**
   * Get all products tracked by user (with cache + direct JOIN to brand tables)
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {string} options.brand - Filter by brand
   * @param {string} options.sortBy - Sort field
   * @param {string} options.sortOrder - Sort order
   * @param {boolean} options.forceRefresh - Skip cache
   * @returns {Promise<Object>} User's tracked products
   */
  async getUserTrackedProducts(userId, options = {}) {
    const {
      brand,
      sortBy = "tracking_started_at",
      sortOrder = "ASC",
      forceRefresh = false,
    } = options;

    // 1. Check cache first (unless forceRefresh)
    if (!forceRefresh) {
      const cached = cacheManager.getCachedUserTracking(userId);

      if (cached) {
        logger.debug(`📦 Cache HIT for user ${userId}`);

        // Apply brand filter if needed
        let products = cached.products;
        if (brand) {
          products = products.filter((p) => p.brand === brand.toLowerCase());
        }

        return {
          success: true,
          products: products,
          count: products.length,
          maxAllowed: this.maxTrackedPerUser,
          fromCache: true,
        };
      }

      logger.debug(`❌ Cache MISS for user ${userId}`);
    }

    // 2. Fetch from DB with UNION query
    return new Promise((resolve, reject) => {
      // Build UNION query for all brand tables
      const queries = [];

      this.supportedBrands.forEach((brandName) => {
        const tableName = this.brandTableMap[brandName];

        // Handle different column names across brand tables
        let salePriveColumn, currencyColumn;

        if (brandName === "zara") {
          salePriveColumn = "p.sale_price";
          currencyColumn = "'TL' as currency"; // Zara doesn't have currency column
        } else {
          // Bershka and Stradivarius use 'old_price'
          salePriveColumn = "p.old_price as sale_price";
          currencyColumn = "p.currency";
        }

        queries.push(`
          SELECT
            utp.id,
            utp.user_id,
            utp.brand,
            utp.product_id,
            utp.tracking_started_at,
            utp.last_checked,
            utp.notification_enabled,
            utp.price_alert_threshold,
            utp.stock_alert,
            utp.custom_settings,
            p.name,
            p.price,
            ${salePriveColumn},
            ${currencyColumn},
            p.image_url,
            p.product_url,
            p.availability,
            p.last_updated as product_last_updated
          FROM user_tracked_products utp
          JOIN ${tableName} p ON utp.product_id = p.product_id
          WHERE utp.user_id = ? AND utp.brand = '${brandName}'
        `);
      });

      let query = queries.join(" UNION ALL ");

      // Add brand filter if specified
      if (brand) {
        query = `SELECT * FROM (${query}) WHERE brand = ?`;
      }

      // Add sorting
      const validSortFields = [
        "tracking_started_at",
        "last_checked",
        "product_last_updated",
        "name",
        "price",
      ];
      const validatedSortBy = validSortFields.includes(sortBy)
        ? sortBy
        : "tracking_started_at";
      const validatedSortOrder = ["ASC", "DESC"].includes(
        sortOrder?.toUpperCase()
      )
        ? sortOrder.toUpperCase()
        : "DESC";

      query += ` ORDER BY ${validatedSortBy} ${validatedSortOrder}`;

      // Parameters (userId for each brand in UNION)
      const params = brand
        ? [userId, userId, userId, brand.toLowerCase()]
        : [userId, userId, userId];

      db.all(query, params, (err, rows) => {
        if (err) {
          logger.error("Error fetching user tracked products:", err);
          return reject(err);
        }

        // Format products (optimized - no formatProduct() overhead)
        const trackedProducts = rows.map((row) => {
          let customSettings = {};
          if (row.custom_settings) {
            try {
              customSettings =
                typeof row.custom_settings === "string"
                  ? JSON.parse(row.custom_settings)
                  : row.custom_settings;
            } catch (e) {
              logger.error(
                "Invalid JSON in custom_settings:",
                row.custom_settings
              );
            }
          }

          // Convert image URL to proxied format
          const proxyImageUrl = row.image_url
            ? `/api/image-proxy?url=${encodeURIComponent(row.image_url)}`
            : null;

          return {
            id: row.product_id,
            brand: row.brand,
            productId: row.product_id,
            title: row.name,
            name: row.name,
            price: row.price,
            salePrice: row.sale_price,
            currency: row.currency || 'TL',
            formattedPrice: row.price
              ? (row.price / 100).toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) + " TL"
              : "Fiyat yok",
            formattedSalePrice: row.sale_price
              ? (row.sale_price / 100).toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) + " " + (row.currency || 'TL')
              : null,
            image: proxyImageUrl,
            imageUrl: proxyImageUrl,
            url: row.product_url,
            productUrl: row.product_url,
            availability: row.availability,
            inStock: row.availability === 'in_stock' || row.availability === 'available',
            lastUpdated: row.product_last_updated,
            tracking: {
              id: row.id,
              tracking_started_at: row.tracking_started_at,
              last_checked: row.last_checked,
              notification_enabled: !!row.notification_enabled,
              price_alert_threshold: row.price_alert_threshold,
              stock_alert: !!row.stock_alert,
              custom_settings: customSettings,
            },
          };
        });

        const result = {
          success: true,
          products: trackedProducts,
          count: trackedProducts.length,
          maxAllowed: this.maxTrackedPerUser,
          fromCache: false,
        };

        // 3. Cache the result (full result, not filtered)
        cacheManager.setCachedUserTracking(userId, result);

        logger.info(
          `✅ Retrieved ${trackedProducts.length} tracked products for user ${userId}`
        );

        resolve(result);
      });
    });
  }

  /**
   * Get user's tracking count
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of tracked products
   */
  async getUserTrackingCount(userId) {
    return new Promise((resolve, reject) => {
      const query =
        "SELECT COUNT(*) as count FROM user_tracked_products WHERE user_id = ?";

      db.get(query, [userId], (err, result) => {
        if (err) {
          logger.error("Error getting user tracking count:", err);
          return reject(err);
        }

        resolve(result.count);
      });
    });
  }

  /**
   * Get tracking record
   * @param {string} userId - User ID
   * @param {string} brand - Brand name
   * @param {string} productId - Product ID
   * @returns {Promise<Object|null>} Tracking record
   */
  async getTrackingRecord(userId, brand, productId) {
    return new Promise((resolve, reject) => {
      const query =
        "SELECT * FROM user_tracked_products WHERE user_id = ? AND brand = ? AND product_id = ?";

      db.get(query, [userId, brand, productId], (err, record) => {
        if (err) {
          logger.error("Error getting tracking record:", err);
          return reject(err);
        }

        resolve(record || null);
      });
    });
  }

  /**
   * Update tracking record
   * @param {number} trackingId - Tracking record ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Update result
   */
  async updateTrackingRecord(trackingId, updates) {
    return new Promise((resolve, reject) => {
      const allowedFields = [
        "last_checked",
        "notification_enabled",
        "price_alert_threshold",
        "stock_alert",
        "custom_settings",
      ];

      const updateFields = [];
      const params = [];

      Object.keys(updates).forEach((field) => {
        if (allowedFields.includes(field)) {
          updateFields.push(`${field} = ?`);

          if (
            field === "custom_settings" &&
            typeof updates[field] === "object"
          ) {
            params.push(JSON.stringify(updates[field]));
          } else {
            params.push(updates[field]);
          }
        }
      });

      if (updateFields.length === 0) {
        return resolve({
          success: false,
          message: "No valid fields to update",
        });
      }

      const query = `UPDATE user_tracked_products SET ${updateFields.join(
        ", "
      )} WHERE id = ?`;
      params.push(trackingId);

      db.run(query, params, function (err) {
        if (err) {
          logger.error("Error updating tracking record:", err);
          return reject(err);
        }

        resolve({
          success: true,
          message: "Tracking record updated",
          updatedCount: this.changes,
        });
      });
    });
  }

  /**
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Products needing alerts
   */
  async getProductsNeedingAlerts(options = {}) {
    const { alertType = "all", limit = 1000 } = options;

    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          utp.*,
          p.brand,
          p.product_id,
          p.name,
          p.price,
          p.sale_price,
          p.availability,
          u.email
        FROM user_tracked_products_unified utp
        JOIN products_unified p ON utp.product_id = p.id
        JOIN users u ON utp.user_id = u.id
        WHERE utp.notification_enabled = 1
      `;

      const params = [];

      if (alertType === "price") {
        query +=
          " AND utp.price_alert_threshold IS NOT NULL AND p.price <= utp.price_alert_threshold";
      } else if (alertType === "stock") {
        query += ' AND utp.stock_alert = 1 AND p.availability = "in_stock"';
      }

      query += " ORDER BY utp.last_checked ASC LIMIT ?";
      params.push(limit);

      db.all(query, params, (err, rows) => {
        if (err) {
          logger.error("Error fetching products needing alerts:", err);
          return reject(err);
        }

        resolve({
          success: true,
          products: rows,
          count: rows.length,
        });
      });
    });
  }

  /**
   * @returns {Promise<Object>} Tracking statistics
   */
  async getTrackingStats() {
    return new Promise((resolve, reject) => {
      const queries = [
        // Total tracking records
        "SELECT COUNT(*) as total_tracking FROM user_tracked_products",

        // Tracking by brand
        `SELECT brand, COUNT(*) as count
         FROM user_tracked_products
         GROUP BY brand`,

        // Active users (users with tracked products)
        "SELECT COUNT(DISTINCT user_id) as active_users FROM user_tracked_products",

        // Average products per user
        `SELECT AVG(user_count) as avg_products_per_user
         FROM (SELECT user_id, COUNT(*) as user_count FROM user_tracked_products GROUP BY user_id)`,

        // Users at max limit
        `SELECT COUNT(*) as users_at_max
         FROM (SELECT user_id, COUNT(*) as count FROM user_tracked_products GROUP BY user_id HAVING count >= ?)`,
      ];

      let completed = 0;
      const results = {};

      // Execute total tracking query
      db.get(queries[0], (err, result) => {
        if (err) return reject(err);
        results.totalTracking = result.total_tracking;

        completed++;
        if (completed === 5) resolve({ success: true, stats: results });
      });

      // Execute brand breakdown query
      db.all(queries[1], (err, rows) => {
        if (err) return reject(err);
        results.byBrand = rows;

        completed++;
        if (completed === 5) resolve({ success: true, stats: results });
      });

      // Execute active users query
      db.get(queries[2], (err, result) => {
        if (err) return reject(err);
        results.activeUsers = result.active_users;

        completed++;
        if (completed === 5) resolve({ success: true, stats: results });
      });

      // Execute average products per user query
      db.get(queries[3], (err, result) => {
        if (err) return reject(err);
        results.avgProductsPerUser =
          Math.round((result.avg_products_per_user || 0) * 100) / 100;

        completed++;
        if (completed === 5) resolve({ success: true, stats: results });
      });

      // Execute users at max limit query
      db.get(queries[4], [this.maxTrackedPerUser], (err, result) => {
        if (err) return reject(err);
        results.usersAtMaxLimit = result.users_at_max;

        completed++;
        if (completed === 5) resolve({ success: true, stats: results });
      });
    });
  }

  /**
   * @param {number} daysInactive - Remove tracking for users inactive for this many days
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupInactiveTracking(daysInactive = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);
    const cutoffISO = cutoffDate.toISOString();

    return new Promise((resolve, reject) => {
      const query =
        "DELETE FROM user_tracked_products WHERE last_checked < ?";

      db.run(query, [cutoffISO], function (err) {
        if (err) {
          logger.error("Error cleaning up inactive tracking:", err);
          return reject(err);
        }

        logger.info(
          ` Cleaned up ${this.changes} inactive tracking records (inactive > ${daysInactive} days)`
        );

        resolve({
          success: true,
          message: `Removed ${this.changes} inactive tracking records`,
          removedCount: this.changes,
          cutoffDate: cutoffISO,
        });
      });
    });
  }

  /**
   * @param {string} userId - User ID
   * @param {string} productUrl - Product URL (Zara or Bershka)
   * @returns {Promise<Object>} Tracking result with product details
   */
  async trackProductByUrl(userId, productUrl) {
    logger.info(
      ` [TRACKING] trackProductByUrl called - userId: ${userId}, URL: ${productUrl}`
    );

    let brand, productId, colorId;
    let customSettings = {};
    let actualProduct = null;

    // Check if input is a reference code (format: XXXX/XXX/XXX)
    const refCodePattern = /^\d{4}\/\d{3}\/\d{3}$/;

    if (refCodePattern.test(productUrl.trim())) {
      logger.info(`[TRACKING] Input detected as reference code: ${productUrl}`);

      // Try Zara first, then Bershka, then Stradivarius
      let refResult = await this.handleZaraRefCode(productUrl.trim());

      if (refResult.success) {
        brand = "zara";
        actualProduct = refResult.product;
        productId = refResult.productId;
        logger.info(`[TRACKING] Found Zara product via reference: ${actualProduct.name}`);
      } else {
        // Try Bershka
        refResult = await this.handleBershkaRefCode(productUrl.trim());

        if (refResult.success) {
          brand = "bershka";
          actualProduct = refResult.product;
          productId = refResult.productId;
          logger.info(`[TRACKING] Found Bershka product via reference: ${actualProduct.name}`);
        } else {
          // Try Stradivarius
          refResult = await this.handleStradivariusRefCode(productUrl.trim());

          if (refResult.success) {
            brand = "stradivarius";
            actualProduct = refResult.product;
            productId = refResult.productId;
            logger.info(`[TRACKING] Found Stradivarius product via reference: ${actualProduct.name}`);
          } else {
            throw new Error(`Reference code ${productUrl.trim()} not found in Zara, Bershka or Stradivarius databases`);
          }
        }
      }

    } else if (productUrl.includes("zara.com")) {
      brand = "zara";
      const productIdMatch = productUrl.match(/v1=(\d+)/);
      if (productIdMatch) {
        productId = productIdMatch[1];
      }
      const colorMatch = productUrl.match(/v2=(\d+)/);
      if (colorMatch) {
        colorId = colorMatch[1];
      }
    } else if (productUrl.includes("bershka.com")) {
      brand = "bershka";
      logger.info("[TRACKING] Processing Bershka URL");

      let bershkaMatch = productUrl.match(/c0p(\d+)\.html/);
      if (!bershkaMatch) {
        bershkaMatch = productUrl.match(/(\d+)\.html/); // fallback pattern
      }

      if (bershkaMatch) {
        const extractedId = bershkaMatch[1];
        logger.info("[TRACKING] Extracted Bershka product ID: ${extractedId}");

        const colorMatch = productUrl.match(/colorId=(\d+)/);
        const extractedColorId = colorMatch ? colorMatch[1] : null;

        if (extractedColorId) {
          logger.info("[TRACKING] Extracted Bershka color ID: ${extractedColorId}");
        }

        // Use new Bershka matching logic
        const bershkaResult = await this.handleBershkaProductMatching(extractedId, extractedColorId);

        if (!bershkaResult.success) {
          throw new Error(bershkaResult.message);
        }

        actualProduct = bershkaResult.product;
        productId = bershkaResult.productId;
        colorId = extractedColorId; // Keep the original colorId for customSettings

        logger.info("[TRACKING] Matched Bershka product: ${actualProduct.name}, final ID: ${productId}");
      } else {
        logger.info(
          ` [TRACKING] Could not extract Bershka product ID from URL: ${productUrl}`
        );
        throw new Error("Could not extract Bershka product ID from URL");
      }
    } else if (productUrl.includes("stradivarius.com")) {
      brand = "stradivarius";
      logger.info("[TRACKING] Processing Stradivarius URL");

      const pelementMatch = productUrl.match(/pelement=(\d+)/);
      if (pelementMatch) {
        const extractedId = pelementMatch[1];
        logger.info(
          ` [TRACKING] Extracted Stradivarius product ID from pelement: ${extractedId}`
        );

        // Use new Stradivarius lookup logic
        const stradResult = await this.handleStradivariusProductLookup(extractedId);

        if (!stradResult.success) {
          throw new Error(stradResult.message);
        }

        actualProduct = stradResult.product;
        productId = stradResult.productId;

        logger.info("[TRACKING] Found Stradivarius product: ${actualProduct.name}, ID: ${productId}");
      } else {
        const directProductMatch = productUrl.match(/\/product\/(\d+)/);
        if (directProductMatch) {
          const extractedId = directProductMatch[1];
          logger.info(
            ` [TRACKING] Extracted Stradivarius product ID from direct product URL: ${extractedId}`
          );

          // Use new Stradivarius lookup logic
          const stradResult = await this.handleStradivariusProductLookup(extractedId);

          if (!stradResult.success) {
            throw new Error(stradResult.message);
          }

          actualProduct = stradResult.product;
          productId = stradResult.productId;

          logger.info("[TRACKING] Found Stradivarius product: ${actualProduct.name}, ID: ${productId}");
        } else {
          logger.info(
            ` [TRACKING] Could not extract Stradivarius product ID - no pelement or product ID found in URL: ${productUrl}`
          );
          logger.info(
            ` [TRACKING] Stradivarius URLs must contain either pelement=ID or /product/ID parameter`
          );
          throw new Error("Could not extract Stradivarius product ID from URL");
        }
      }

      // Extract colorId for customSettings (info only, no matching needed)
      const stradColorMatch = productUrl.match(/colorId=(\d+)/);
      if (stradColorMatch) {
        colorId = stradColorMatch[1];
        logger.info(
          ` [TRACKING] Extracted Stradivarius color ID: ${colorId}`
        );
      }

      // Extract product code if present
      const productCodeMatch = productUrl.match(/-l(\d+)/);
      if (productCodeMatch) {
        const productCode = productCodeMatch[1];
        logger.info(
          ` [TRACKING] Extracted Stradivarius product code: ${productCode}`
        );
        if (!customSettings) customSettings = {};
        customSettings.productCode = productCode;
      }
    } else {
      logger.info(
        ` [TRACKING] Unsupported URL - not Zara, Bershka or Stradivarius: ${productUrl}`
      );
      throw new Error(
        "Unsupported brand - only Zara, Bershka and Stradivarius URLs are supported"
      );
    }

    logger.info(
      ` [TRACKING] Extracted: brand=${brand}, productId=${productId}, colorId=${colorId}`
    );

    if (!productId) {
      logger.info(
        ` [TRACKING] Failed to extract product ID from URL: ${productUrl}`
      );
      throw new Error("Could not extract product ID from URL");
    }

    let product;

    // If we already found the actual product (for Bershka ref codes or URL matching), use it
    if (actualProduct) {
      logger.info("[TRACKING] Using already matched product: ${actualProduct.name}");
      logger.info("[TRACKING] Raw actualProduct data:", {
        id: actualProduct.product_id,
        name: actualProduct.name,
        price: actualProduct.price,
        image_url: actualProduct.image_url?.substring(0, 100) + '...',
        reference: actualProduct.reference,
        brand: brand
      });

      const productService = require("./product.service");
      product = productService.formatProduct(actualProduct);

      logger.info("[TRACKING] Formatted product data:", {
        id: product.id,
        title: product.title,
        formattedPrice: product.formattedPrice,
        imgSrc: product.imgSrc?.substring(0, 100) + '...',
        imageUrl: product.imageUrl?.substring(0, 100) + '...'
      });
    } else {
      // For Zara and Stradivarius, use the old method
      const productService = require("./product.service");
      logger.info(
        ` [TRACKING] Checking if product exists: productId=${productId}, brand=${brand}`
      );

      product = await productService.getProductById(productId, brand);

      if (!product) {
        logger.info(
          `️ [TRACKING] Product ${productId} (${brand}) not found in database, creating placeholder for tracking`
        );

        const placeholderData = {
          id: null,
          brand: brand,
          product_id: productId,
          name: `${
            brand.charAt(0).toUpperCase() + brand.slice(1)
          } Product (Loading...)`,
          price: null,
          sale_price: null,
          currency: "TL",
          image_url: `/Images/${brand}.png`,
          product_url: productUrl,
          availability: "unknown",
          brand_data: {},
          last_updated: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };

        product = productService.formatProduct(placeholderData);
        product.isPlaceholder = true;
      }
    }

    customSettings.originalUrl = productUrl;
    customSettings.colorId = colorId;

    const trackingOptions = {
      stockAlert: true,
      notificationEnabled: true,
      customSettings: customSettings,
    };

    if (product.isPlaceholder) {
      logger.warn(
        `⚠️ [TRACKING] Rejecting placeholder tracking for ${brand} product ${productId} - product not in database`
      );
      return {
        success: false,
        message: `Bu ${brand === 'zara' ? 'Zara' : brand.charAt(0).toUpperCase() + brand.slice(1)} ürünü veritabanımızda bulunamadı. Lütfen farklı bir ürün deneyin.`,
        error: "PRODUCT_NOT_FOUND"
      };
    }

    const result = await this.addProductTracking(
      userId,
      brand,
      productId,
      trackingOptions
    );
    const formattedProduct = productService.formatProduct(product);

    logger.info(
      ` [TRACKING] Original product image_url: ${
        product.image_url || product.imageUrl
      }`
    );
    logger.info(
      ` [TRACKING] Formatted product imgSrc: ${formattedProduct.imgSrc}`
    );
    logger.info(
      ` [TRACKING] Formatted product imageUrl: ${formattedProduct.imageUrl}`
    );

    const finalResult = {
      ...result,
      product: formattedProduct,
      trackingUrl: productUrl,
    };

    logger.info("[TRACKING] Final result being returned:", {
      success: finalResult.success,
      productId: finalResult.product?.id,
      productName: finalResult.product?.title,
      productPrice: finalResult.product?.formattedPrice,
      trackingUrl: finalResult.trackingUrl
    });

    return finalResult;
  }

  /**
   * Remove product from tracking
   * @param {string} userId - User ID
   * @param {string} productId - Product ID to untrack
   * @param {string} brand - Brand name (optional, for faster lookup)
   * @returns {Promise<Object>} Untracking result
   */
  async removeProductTracking(userId, productId, brand = null) {
    return new Promise((resolve, reject) => {
      logger.info(
        `[TRACKING] removeProductTracking - userId: ${userId}, productId: ${productId}, brand: ${brand}`
      );

      let findQuery, params;

      if (brand) {
        // Brand specified - direct lookup (faster)
        findQuery =
          "SELECT id, brand, product_id FROM user_tracked_products WHERE user_id = ? AND product_id = ? AND brand = ?";
        params = [userId, productId, brand];
      } else {
        // No brand - search across all brand tables using UNION
        // Frontend may send: user_tracked_products.id, product_id, or brand_table.id
        const unionQueries = [];

        this.supportedBrands.forEach((brandName) => {
          const tableName = this.brandTableMap[brandName];
          unionQueries.push(`
            SELECT utp.id, utp.brand, utp.product_id
            FROM user_tracked_products utp
            LEFT JOIN ${tableName} p ON utp.product_id = p.product_id AND utp.brand = '${brandName}'
            WHERE utp.user_id = ? AND (utp.id = ? OR utp.product_id = ? OR p.id = ?)
          `);
        });

        findQuery = unionQueries.join(" UNION ") + " LIMIT 1";
        params = [userId, productId, productId, productId, userId, productId, productId, productId, userId, productId, productId, productId];
      }

      db.get(findQuery, params, (err, record) => {
        if (err) {
          logger.error("Error finding tracking record:", err);
          return reject(err);
        }

        if (!record) {
          logger.info(`[TRACKING] No tracking record found for productId: ${productId}`);
          return resolve({
            success: false,
            message: "Product was not being tracked",
            removed: false,
          });
        }

        logger.info("[TRACKING] Found tracking record:", {
          id: record.id,
          brand: record.brand,
          productId: record.product_id,
        });

        const deleteQuery = "DELETE FROM user_tracked_products WHERE id = ?";

        db.run(deleteQuery, [record.id], function (err) {
          if (err) {
            logger.error("Error removing product tracking:", err);
            return reject(err);
          }

          // Invalidate cache
          cacheManager.invalidateUserTracking(userId);

          logger.info(
            `✅ Successfully removed tracking - deleted ${this.changes} record(s) for ${record.brand}/${record.product_id}`
          );

          resolve({
            success: true,
            message: "Product removed from tracking",
            removed: true,
            deletedCount: this.changes,
            brand: record.brand,
            productId: record.product_id,
          });
        });
      });
    });
  }

  /**
   * @param {string} userId - User ID
   * @param {string} productId - Product ID to untrack
   * @returns {Promise<Object>} Untracking result
   */
  async untrackProduct(userId, productId) {
    return this.removeProductTracking(userId, productId);
  }

  /**
   * Background async Stradivarius detail updater (non-blocking)
   * @param {string} productId - Product ID
   * @param {string} colorId - Color ID (optional)
   * @returns {Promise<void>}
   */
  async updateStradivariusDetailAsync(productId, colorId = null) {
    try {
      logger.info(`🔄 [BG] Checking Stradivarius detail for ${productId} (color: ${colorId || 'none'})`);

      // Check if detail already exists in DB
      const detailProduct = await new Promise((resolve, reject) => {
        db.get(
          "SELECT * FROM stradivarius_unique_product_details WHERE product_id = ?",
          [productId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (detailProduct) {
        // Update from existing detail
        logger.info(`📦 [BG] Found cached detail for ${productId}`);

        const updateQuery = "UPDATE stradivarius_unique_product_details SET price = ?, image_url = ?, name = ?, last_updated = ? WHERE product_id = ?";
        const params = [
          detailProduct.price,
          detailProduct.image_url,
          detailProduct.name,
          new Date().toISOString(),
          productId,
        ];

        await new Promise((resolve, reject) => {
          db.run(updateQuery, params, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        logger.info(`✅ [BG] Updated ${productId} from cached detail`);
        return;
      }

      // No cached detail - fetch from API
      logger.info(`🌐 [BG] Fetching Stradivarius detail from API for ${productId}`);

      const product = await new Promise((resolve, reject) => {
        db.get(
          "SELECT * FROM stradivarius_unique_product_details WHERE product_id = ?",
          [productId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!product || !product.image_url || !product.image_url.startsWith("https://") || !product.price) {
        const stradivariusService = require("../services/stradivarius.service");
        const service = new stradivariusService();

        const detailResult = await service.getProductDetail(productId);
        let imageUrl = null;
        let productPrice = null;

        if (detailResult.success) {
          imageUrl = await service._getProductImageFromDetail(productId, colorId);

          if (detailResult.fullResponse.bundleProductSummaries?.length > 0) {
            const bundle = detailResult.fullResponse.bundleProductSummaries[0];
            const firstColor = bundle.detail?.colors?.[0];
            const firstSize = firstColor?.sizes?.[0];

            if (firstSize?.price) {
              productPrice = parseInt(firstSize.price);
              logger.info(`💰 [BG] Found price: ${(productPrice / 100).toFixed(2)} TL`);
            }
          }
        }

        // Build update query
        let updateQuery = "UPDATE stradivarius_unique_product_details SET last_updated = ?";
        let params = [new Date().toISOString()];

        if (imageUrl) {
          updateQuery = "UPDATE stradivarius_unique_product_details SET image_url = ?, last_updated = ?";
          params = [imageUrl, new Date().toISOString()];
          logger.info(`🖼️ [BG] Updated image for ${productId}`);
        }

        if (productPrice) {
          updateQuery = updateQuery.replace("last_updated = ?", "price = ?, last_updated = ?");
          params.splice(-1, 0, productPrice);
        }

        updateQuery += " WHERE product_id = ?";
        params.push(productId);

        await new Promise((resolve, reject) => {
          db.run(updateQuery, params, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        logger.info(`✅ [BG] Updated ${productId} from API`);
      }
    } catch (error) {
      logger.error(`❌ [BG] Failed to update Stradivarius ${productId}:`, error.message);
    }
  }

  /**
   * Fetch product from brand API if not in database
   * Only supports Bershka and Stradivarius (Zara requires pre-scraping)
   * @param {string} brand - Brand name (bershka, stradivarius, zara)
   * @param {string} productId - Product ID
   * @param {string} colorId - Color ID (optional)
   * @returns {Promise<Object|null>} Formatted product or null
   */
  async fetchProductFromAPI(brand, productId, colorId = null) {
    const startTime = Date.now();
    logger.info(`🌐 [API] Attempting to fetch ${brand} product ${productId} from API`);

    try {
      let result = null;

      switch (brand.toLowerCase()) {
        case "bershka": {
          const BershkaService = require("./bershka.service");
          const service = new BershkaService();
          result = await service.fetchSingleProduct(productId, colorId);
          break;
        }

        case "stradivarius": {
          const StradivariusService = require("./stradivarius.service");
          const service = new StradivariusService();
          result = await service.fetchSingleProduct(productId, colorId);
          break;
        }

        case "zara":
          logger.warn(`⚠️ [API] Zara products cannot be fetched individually - pre-scraping required`);
          return null;

        default:
          logger.error(`❌ [API] Unsupported brand: ${brand}`);
          return null;
      }

      const elapsed = Date.now() - startTime;

      if (result) {
        logger.info(`✅ [API] Successfully fetched ${brand} product ${productId} in ${elapsed}ms`);
      } else {
        logger.error(`❌ [API] Failed to fetch ${brand} product ${productId} - product may not exist`);
      }

      return result;

    } catch (error) {
      const elapsed = Date.now() - startTime;
      logger.error(`❌ [API] Error fetching ${brand} product ${productId} (${elapsed}ms):`, error.message);
      throw error;
    }
  }
}

module.exports = new TrackingService();