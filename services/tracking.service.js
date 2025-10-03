const db = require("../config/database");
const productService = require("./product.service");

class TrackingService {
  constructor() {
    this.maxTrackedPerUser = 9;
    this.supportedBrands = ["zara", "bershka", "stradivarius"];
  }

  /**
   * Helper function to handle Bershka product matching with color support
   * @param {string} productId - Extracted product ID from URL
   * @param {string} colorId - Extracted color ID from URL (optional)
   * @returns {Promise<Object>} Product matching result
   */
  async handleBershkaProductMatching(productId, colorId = null) {
    console.log(`🔧 [BERSHKA] handleBershkaProductMatching - productId: ${productId}, colorId: ${colorId}`);

    return new Promise((resolve, reject) => {
      // First, try to find the product with the main product ID
      const query = "SELECT * FROM bershka_unique_product_details WHERE product_id = ?";

      db.get(query, [productId], async (err, baseProduct) => {
        if (err) {
          console.error(`❌ [BERSHKA] Database error:`, err);
          return reject(err);
        }

        if (!baseProduct) {
          console.log(`❌ [BERSHKA] No product found with ID: ${productId}`);
          return resolve({
            success: false,
            message: `Product with ID ${productId} not found in database`,
            productId: null
          });
        }

        console.log(`✅ [BERSHKA] Found base product: ${baseProduct.name}, color_id: ${baseProduct.color_id}`);

        // If no colorId in URL, return the base product
        if (!colorId) {
          console.log(`✅ [BERSHKA] No color specified, using base product`);
          return resolve({
            success: true,
            product: baseProduct,
            productId: baseProduct.product_id
          });
        }

        // If colorId matches the base product's color_id, return base product
        if (baseProduct.color_id === colorId) {
          console.log(`✅ [BERSHKA] Color matches base product (${colorId})`);
          return resolve({
            success: true,
            product: baseProduct,
            productId: baseProduct.product_id
          });
        }

        // Color doesn't match, check catentryIds for the requested color
        console.log(`🔍 [BERSHKA] Color mismatch (${colorId} vs ${baseProduct.color_id}), checking catentryIds...`);

        if (!baseProduct.catentryIds) {
          console.log(`❌ [BERSHKA] No catentryIds found for product ${productId}`);
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
          console.error(`❌ [BERSHKA] Failed to parse catentryIds:`, parseError);
          return resolve({
            success: false,
            message: `Invalid catentryIds data for product ${productId}`,
            productId: null
          });
        }

        console.log(`🔍 [BERSHKA] Searching in catentryIds:`, catentryIds);

        // Find the color in catentryIds
        const colorEntry = catentryIds.find(entry => entry.id === colorId);

        if (!colorEntry) {
          console.log(`❌ [BERSHKA] Color ${colorId} not found in catentryIds`);
          return resolve({
            success: false,
            message: `Color ${colorId} not available for this product`,
            productId: null
          });
        }

        console.log(`✅ [BERSHKA] Found color entry:`, colorEntry);

        // Now find the product with the catentryId
        const colorProductQuery = "SELECT * FROM bershka_unique_product_details WHERE product_id = ?";

        db.get(colorProductQuery, [colorEntry.catentryId], (err, colorProduct) => {
          if (err) {
            console.error(`❌ [BERSHKA] Error finding color product:`, err);
            return reject(err);
          }

          if (!colorProduct) {
            console.log(`❌ [BERSHKA] Color product not found with catentryId: ${colorEntry.catentryId}`);
            return resolve({
              success: false,
              message: `Color variant product not found in database`,
              productId: null
            });
          }

          console.log(`✅ [BERSHKA] Found color product: ${colorProduct.name}, ID: ${colorProduct.product_id}`);

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
   * Helper function to handle Bershka reference code lookup
   * @param {string} refCode - Reference code in format XXXX/XXX/XXX
   * @returns {Promise<Object>} Product lookup result
   */
  async handleBershkaRefCode(refCode) {
    console.log(`🔧 [BERSHKA] handleBershkaRefCode - refCode: ${refCode}`);

    return new Promise((resolve, reject) => {
      const query = "SELECT * FROM bershka_unique_product_details WHERE reference = ?";

      db.get(query, [refCode], (err, product) => {
        if (err) {
          console.error(`❌ [BERSHKA] Database error for ref code:`, err);
          return reject(err);
        }

        if (!product) {
          console.log(`❌ [BERSHKA] No product found with reference: ${refCode}`);
          return resolve({
            success: false,
            message: `Product with reference ${refCode} not found`,
            productId: null
          });
        }

        console.log(`✅ [BERSHKA] Found product by reference: ${product.name}, ID: ${product.product_id}`);

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
    console.log(`🔧 [STRADIVARIUS] handleStradivariusProductLookup - productId: ${productId}`);

    return new Promise((resolve, reject) => {
      const query = "SELECT * FROM stradivarius_unique_product_details WHERE product_id = ?";

      db.get(query, [productId], (err, product) => {
        if (err) {
          console.error(`❌ [STRADIVARIUS] Database error:`, err);
          return reject(err);
        }

        if (!product) {
          console.log(`❌ [STRADIVARIUS] No product found with ID: ${productId}`);
          return resolve({
            success: false,
            message: `Product with ID ${productId} not found in database`,
            productId: null
          });
        }

        console.log(`✅ [STRADIVARIUS] Found product: ${product.name}, ID: ${product.product_id}`);

        resolve({
          success: true,
          product: product,
          productId: product.product_id
        });
      });
    });
  }

  /**
   * Helper function to handle Stradivarius reference code lookup (with LIMIT 1 for duplicates)
   * @param {string} refCode - Reference code in format XXXX/XXX/XXX
   * @returns {Promise<Object>} Product lookup result
   */
  async handleStradivariusRefCode(refCode) {
    console.log(`🔧 [STRADIVARIUS] handleStradivariusRefCode - refCode: ${refCode}`);

    return new Promise((resolve, reject) => {
      // Use ORDER BY id ASC LIMIT 1 to get the first (oldest) record for duplicates
      const query = "SELECT * FROM stradivarius_unique_product_details WHERE reference = ? ORDER BY id ASC LIMIT 1";

      db.get(query, [refCode], (err, product) => {
        if (err) {
          console.error(`❌ [STRADIVARIUS] Database error for ref code:`, err);
          return reject(err);
        }

        if (!product) {
          console.log(`❌ [STRADIVARIUS] No product found with reference: ${refCode}`);
          return resolve({
            success: false,
            message: `Product with reference ${refCode} not found`,
            productId: null
          });
        }

        console.log(`✅ [STRADIVARIUS] Found product by reference: ${product.name}, ID: ${product.product_id} (first match from duplicates)`);

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
            const currentCount = await this.getUserTrackingCount(userId);

            if (currentCount >= this.maxTrackedPerUser) {
              db.run("ROLLBACK");
              return resolve({
                success: false,
                message: `Maximum ${this.maxTrackedPerUser} products can be tracked`,
                currentCount,
              });
            }

            let product = await productService.getProductById(productId, brand);

            if (!product) {
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
              console.log(
                `🔧 [TRACKING] Fetching Bershka detail from unique details table...`
              );

              try {
                const colorId = customSettings?.colorId;
                const bershkaUniqueId = colorId
                  ? `${productId}_${colorId}`
                  : `${productId}_default`;

                console.log(
                  `🎨 [TRACKING] Looking for Bershka unique product: ${bershkaUniqueId}`
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
                  console.log(
                    `✅ [TRACKING] Found Bershka detail: ${detailProduct.name}, Price: ${detailProduct.price}`
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
                        console.error(
                          `❌ [TRACKING] Failed to update Bershka product ${productId}:`,
                          err
                        );
                        reject(err);
                      } else {
                        console.log(
                          `✅ [TRACKING] Updated Bershka product ${productId} with detail info`
                        );
                        resolve();
                      }
                    });
                  });

                  product = await productService.getProductById(
                    productId,
                    brand
                  );
                } else {
                  console.log(
                    `⚠️ [TRACKING] No detail found for Bershka unique ID: ${bershkaUniqueId}`
                  );
                }
              } catch (detailError) {
                console.error(
                  `⚠️ [TRACKING] Failed to fetch Bershka detail for ${productId}:`,
                  detailError.message
                );
              }
            }

            if (brand === "stradivarius") {
              console.log(
                `🔧 [TRACKING] Fetching Stradivarius detail from unique details table...`
              );

              try {
                const colorId = customSettings?.colorId;
                const stradUniqueId = colorId
                  ? `${productId}_${colorId}`
                  : `${productId}_default`;

                console.log(
                  `🎨 [TRACKING] Looking for Stradivarius unique product: ${stradUniqueId}`
                );

                const detailProduct = await new Promise((resolve, reject) => {
                  const db = require("../config/database");
                  db.get(
                    "SELECT * FROM stradivarius_unique_product_details WHERE unique_id = ?",
                    [stradUniqueId],
                    (err, row) => {
                      if (err) reject(err);
                      else resolve(row);
                    }
                  );
                });

                if (detailProduct) {
                  console.log(
                    `✅ [TRACKING] Found Stradivarius detail: ${detailProduct.name}, Price: ${detailProduct.price}`
                  );

                  const updateQuery =
                    "UPDATE stradivarius_unique_product_details SET price = ?, image_url = ?, name = ?, last_updated = ? WHERE product_id = ?";
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
                        console.error(
                          `❌ [TRACKING] Failed to update Stradivarius product ${productId}:`,
                          err
                        );
                        reject(err);
                      } else {
                        console.log(
                          `✅ [TRACKING] Updated Stradivarius product ${productId} with detail info`
                        );
                        resolve();
                      }
                    });
                  });

                  product = await productService.getProductById(
                    productId,
                    brand
                  );
                } else {
                  console.log(
                    `⚠️ [TRACKING] No detail found for Stradivarius unique ID: ${stradUniqueId}`
                  );

                  if (
                    !product.image ||
                    !product.image.startsWith("https://") ||
                    !product.price
                  ) {
                    console.log(
                      `🔧 [TRACKING] Fallback: Fetching Stradivarius detail from API...`
                    );

                    const stradivariusService = require("../services/stradivarius.service");
                    const service = new stradivariusService();

                    const detailResult = await service.getProductDetail(
                      productId
                    );
                    let imageUrl = null;
                    let productPrice = null;

                    if (detailResult.success) {
                      console.log(
                        `🎨 [TRACKING] Using color ID for image matching: ${colorId}`
                      );
                      imageUrl = await service._getProductImageFromDetail(
                        productId,
                        colorId
                      );

                      if (
                        detailResult.fullResponse.bundleProductSummaries &&
                        detailResult.fullResponse.bundleProductSummaries
                          .length > 0
                      ) {
                        const bundle =
                          detailResult.fullResponse.bundleProductSummaries[0];
                        if (
                          bundle.detail &&
                          bundle.detail.colors &&
                          bundle.detail.colors.length > 0
                        ) {
                          const firstColor = bundle.detail.colors[0];
                          if (
                            firstColor.sizes &&
                            firstColor.sizes.length > 0 &&
                            firstColor.sizes[0].price
                          ) {
                            productPrice = parseInt(firstColor.sizes[0].price);
                            console.log(
                              `✅ [TRACKING] Found Stradivarius price for ${productId}: ${productPrice} kuruş (${(
                                productPrice / 100
                              ).toFixed(2)} TL)`
                            );
                          }
                        }
                      }
                    }

                    let updateQuery =
                      "UPDATE stradivarius_unique_product_details SET last_updated = ?";
                    let params = [new Date().toISOString()];

                    if (imageUrl) {
                      updateQuery =
                        "UPDATE stradivarius_unique_product_details SET image_url = ?, last_updated = ?";
                      params = [imageUrl, new Date().toISOString()];
                      console.log(
                        `✅ [TRACKING] Found Stradivarius media URL for ${productId}: ${imageUrl}`
                      );
                    }

                    if (productPrice) {
                      updateQuery = updateQuery.replace(
                        "last_updated = ?",
                        "price = ?, last_updated = ?"
                      );
                      params.splice(-1, 0, productPrice);
                      console.log(
                        `✅ [TRACKING] Found Stradivarius price for ${productId}: ${(
                          productPrice / 100
                        ).toFixed(2)} TL`
                      );
                    }

                    updateQuery += " WHERE product_id = ?";
                    params.push(productId);

                    await new Promise((resolve, reject) => {
                      db.run(updateQuery, params, function (err) {
                        if (err) {
                          console.error(
                            `❌ [TRACKING] Failed to update Stradivarius product ${productId}:`,
                            err
                          );
                          reject(err);
                        } else {
                          console.log(
                            `✅ [TRACKING] Updated Stradivarius product ${productId} with detail info`
                          );
                          resolve();
                        }
                      });
                    });

                    product = await productService.getProductById(
                      productId,
                      brand
                    );
                  }
                }
              } catch (detailError) {
                console.error(
                  `⚠️ [TRACKING] Failed to fetch Stradivarius detail for ${productId}:`,
                  detailError.message
                );
              }
            }

            console.log(
              `🔧 [TRACKING] Product data before ensureProductInUnified:`,
              {
                id: product.id,
                product_id: product.product_id,
                name: product.name,
                price: product.price,
                image_url: product.image_url?.substring(0, 50) + "...",
              }
            );
            const unifiedProductId = await this.ensureProductInUnified(
              product,
              brand
            );

            const existingTracking = await this.getTrackingRecord(
              userId,
              unifiedProductId
            );

            if (existingTracking) {
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

              db.run("COMMIT", (err) => {
                if (err) {
                  return reject(err);
                }

                resolve({
                  success: true,
                  message: "Product tracking updated",
                  product: product,
                  trackingId: existingTracking.id,
                  isUpdate: true,
                });
              });
            } else {
              const insertQuery = `
                INSERT INTO user_tracked_products_unified (
                  user_id, product_id, unique_tracking_id, tracking_started_at,
                  last_checked, notification_enabled, price_alert_threshold,
                  stock_alert, custom_settings
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `;

              const now = new Date().toISOString();
              const uniqueTrackingId = `${userId}-${unifiedProductId}-${Date.now()}`;
              const params = [
                userId,
                unifiedProductId,
                uniqueTrackingId,
                now,
                now,
                notificationEnabled ? 1 : 0,
                priceAlertThreshold,
                stockAlert ? 1 : 0,
                JSON.stringify(customSettings),
              ];

              db.run(insertQuery, params, function (err) {
                if (err) {
                  console.error("❌ Error adding product tracking:", err);
                  db.run("ROLLBACK");
                  return reject(err);
                }

                db.run("COMMIT", (err) => {
                  if (err) {
                    return reject(err);
                  }

                  console.log(
                    `✅ Product tracking added: User ${userId} -> ${brand}/${productId} (unified ID: ${unifiedProductId})`
                  );

                  resolve({
                    success: true,
                    message: "Product successfully added to tracking list",
                    product: product,
                    trackingId: this.lastID,
                    isUpdate: false,
                    currentCount: currentCount + 1,
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
   * Ensure product exists in unified table and return its unified ID
   * @param {Object} product - Product data
   * @param {string} brand - Brand name
   * @returns {Promise<number>} Unified product ID
   */
  async ensureProductInUnified(product, brand) {
    return new Promise((resolve, reject) => {
      const checkQuery =
        "SELECT id FROM products_unified WHERE product_id = ? AND brand = ?";

      db.get(
        checkQuery,
        [product.product_id || product.id, brand],
        (err, existing) => {
          if (err) {
            return reject(err);
          }

          if (existing) {
            console.log(
              `✅ Product ${
                product.id || product.product_id
              } already exists in unified table with ID: ${existing.id}`
            );
            return resolve(existing.id);
          }

          const insertQuery = `
          INSERT INTO products_unified (
            brand, product_id, name, price, sale_price, currency,
            image_url, product_url, availability, brand_data,
            last_updated, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

          const now = new Date().toISOString();
          const params = [
            brand,
            product.product_id || product.id,
            product.title || product.name,
            product.price,
            product.salePrice ||
              product.sale_price ||
              product.oldPrice ||
              product.old_price,
            product.currency || "TL",
            product.imageUrl || product.image_url || product.image,
            product.url || product.product_url,
            product.availability || "unknown",
            JSON.stringify(product.brandData || product.brand_data || {}),
            now,
            now,
          ];

          db.run(insertQuery, params, function (err) {
            if (err) {
              console.error(
                `❌ Error inserting product into unified table:`,
                err
              );
              return reject(err);
            }

            console.log(
              `✅ Inserted ${brand} product ${
                product.id || product.product_id
              } into unified table with ID: ${this.lastID}`
            );
            resolve(this.lastID);
          });
        }
      );
    });
  }

  /**
   * Get all products tracked by user (from unified table only)
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {string} options.brand - Filter by brand
   * @param {string} options.sortBy - Sort field
   * @param {string} options.sortOrder - Sort order
   * @returns {Promise<Object>} User's tracked products
   */
  async getUserTrackedProducts(userId, options = {}) {
    const {
      brand,
      sortBy = "tracking_started_at",
      sortOrder = "DESC",
    } = options;

    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          utp.*,
          p.brand,
          p.product_id,
          p.name,
          p.price,
          p.sale_price,
          p.currency,
          p.image_url,
          p.product_url,
          p.availability,
          p.brand_data,
          p.last_updated as product_last_updated
        FROM user_tracked_products_unified utp
        JOIN products_unified p ON utp.product_id = p.id
        WHERE utp.user_id = ?
      `;

      const params = [userId];

      if (brand) {
        query += " AND p.brand = ?";
        params.push(brand.toLowerCase());
      }

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

      query += ` ORDER BY utp.${validatedSortBy} ${validatedSortOrder}`;

      db.all(query, params, (err, rows) => {
        if (err) {
          console.error("❌ Error fetching user tracked products:", err);
          return reject(err);
        }

        const trackedProducts = rows.map((row) => {
          const product = productService.formatProduct({
            id: row.product_id,
            brand: row.brand,
            product_id: row.product_id,
            name: row.name,
            price: row.price,
            sale_price: row.sale_price,
            currency: row.currency,
            image_url: row.image_url,
            product_url: row.product_url,
            availability: row.availability,
            brand_data: row.brand_data,
            last_updated: row.product_last_updated,
          });

          let customSettings = {};
          if (row.custom_settings) {
            if (typeof row.custom_settings === "string") {
              try {
                customSettings = JSON.parse(row.custom_settings);
              } catch (e) {
                console.error(
                  "Invalid JSON in custom_settings:",
                  row.custom_settings
                );
                customSettings = {};
              }
            } else if (typeof row.custom_settings === "object") {
              customSettings = row.custom_settings;
            }
          }

          return {
            ...product,
            tracking: {
              id: row.id,
              unique_tracking_id: row.unique_tracking_id,
              tracking_started_at: row.tracking_started_at,
              last_checked: row.last_checked,
              notification_enabled: !!row.notification_enabled,
              price_alert_threshold: row.price_alert_threshold,
              stock_alert: !!row.stock_alert,
              custom_settings: customSettings,
            },
          };
        });

        console.log(
          `📦 Retrieved ${trackedProducts.length} tracked products for user ${userId}`
        );

        resolve({
          success: true,
          products: trackedProducts,
          count: trackedProducts.length,
          maxAllowed: this.maxTrackedPerUser,
        });
      });
    });
  }

  /**
   * Get user's tracking count (using unified tracking table)
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of tracked products
   */
  async getUserTrackingCount(userId) {
    return new Promise((resolve, reject) => {
      const query =
        "SELECT COUNT(*) as count FROM user_tracked_products_unified WHERE user_id = ?";

      db.get(query, [userId], (err, result) => {
        if (err) {
          console.error("❌ Error getting user tracking count:", err);
          return reject(err);
        }

        resolve(result.count);
      });
    });
  }

  /**
   * Get tracking record
   * @param {string} userId - User ID
   * @param {number} productId - Unified product ID
   * @returns {Promise<Object|null>} Tracking record
   */
  async getTrackingRecord(userId, productId) {
    return new Promise((resolve, reject) => {
      const query =
        "SELECT * FROM user_tracked_products_unified WHERE user_id = ? AND product_id = ?";

      db.get(query, [userId, productId], (err, record) => {
        if (err) {
          console.error("❌ Error getting tracking record:", err);
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

      const query = `UPDATE user_tracked_products_unified SET ${updateFields.join(
        ", "
      )} WHERE id = ?`;
      params.push(trackingId);

      db.run(query, params, function (err) {
        if (err) {
          console.error("❌ Error updating tracking record:", err);
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
          console.error("❌ Error fetching products needing alerts:", err);
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
        "SELECT COUNT(*) as total_tracking FROM user_tracked_products_unified",

        // Tracking by brand
        `SELECT p.brand, COUNT(*) as count 
         FROM user_tracked_products_unified utp 
         JOIN products_unified p ON utp.product_id = p.id 
         GROUP BY p.brand`,

        // Active users (users with tracked products)
        "SELECT COUNT(DISTINCT user_id) as active_users FROM user_tracked_products_unified",

        // Average products per user
        `SELECT AVG(user_count) as avg_products_per_user 
         FROM (SELECT user_id, COUNT(*) as user_count FROM user_tracked_products_unified GROUP BY user_id)`,

        // Users at max limit
        `SELECT COUNT(*) as users_at_max 
         FROM (SELECT user_id, COUNT(*) as count FROM user_tracked_products_unified GROUP BY user_id HAVING count >= ?)`,
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
        "DELETE FROM user_tracked_products_unified WHERE last_checked < ?";

      db.run(query, [cutoffISO], function (err) {
        if (err) {
          console.error("❌ Error cleaning up inactive tracking:", err);
          return reject(err);
        }

        console.log(
          `✅ Cleaned up ${this.changes} inactive tracking records (inactive > ${daysInactive} days)`
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
    console.log(
      `🔧 [TRACKING] trackProductByUrl called - userId: ${userId}, URL: ${productUrl}`
    );

    let brand, productId, colorId;
    let customSettings = {};
    let actualProduct = null;

    // Check if input is a reference code (format: XXXX/XXX/XXX)
    const refCodePattern = /^\d{4}\/\d{3}\/\d{3}$/;

    if (refCodePattern.test(productUrl.trim())) {
      console.log(`🔧 [TRACKING] Input detected as reference code: ${productUrl}`);

      // Try Bershka first, then Stradivarius
      let refResult = await this.handleBershkaRefCode(productUrl.trim());

      if (refResult.success) {
        brand = "bershka";
        actualProduct = refResult.product;
        productId = refResult.productId;
        console.log(`✅ [TRACKING] Found Bershka product via reference: ${actualProduct.name}`);
      } else {
        // Try Stradivarius
        refResult = await this.handleStradivariusRefCode(productUrl.trim());

        if (refResult.success) {
          brand = "stradivarius";
          actualProduct = refResult.product;
          productId = refResult.productId;
          console.log(`✅ [TRACKING] Found Stradivarius product via reference: ${actualProduct.name}`);
        } else {
          throw new Error(`Reference code ${productUrl.trim()} not found in Bershka or Stradivarius databases`);
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
      console.log(`🔧 [TRACKING] Processing Bershka URL`);

      let bershkaMatch = productUrl.match(/c0p(\d+)\.html/);
      if (!bershkaMatch) {
        bershkaMatch = productUrl.match(/(\d+)\.html/); // fallback pattern
      }

      if (bershkaMatch) {
        const extractedId = bershkaMatch[1];
        console.log(`✅ [TRACKING] Extracted Bershka product ID: ${extractedId}`);

        const colorMatch = productUrl.match(/colorId=(\d+)/);
        const extractedColorId = colorMatch ? colorMatch[1] : null;

        if (extractedColorId) {
          console.log(`✅ [TRACKING] Extracted Bershka color ID: ${extractedColorId}`);
        }

        // Use new Bershka matching logic
        const bershkaResult = await this.handleBershkaProductMatching(extractedId, extractedColorId);

        if (!bershkaResult.success) {
          throw new Error(bershkaResult.message);
        }

        actualProduct = bershkaResult.product;
        productId = bershkaResult.productId;
        colorId = extractedColorId; // Keep the original colorId for customSettings

        console.log(`✅ [TRACKING] Matched Bershka product: ${actualProduct.name}, final ID: ${productId}`);
      } else {
        console.log(
          `❌ [TRACKING] Could not extract Bershka product ID from URL: ${productUrl}`
        );
        throw new Error("Could not extract Bershka product ID from URL");
      }
    } else if (productUrl.includes("stradivarius.com")) {
      brand = "stradivarius";
      console.log(`🔧 [TRACKING] Processing Stradivarius URL`);

      const pelementMatch = productUrl.match(/pelement=(\d+)/);
      if (pelementMatch) {
        const extractedId = pelementMatch[1];
        console.log(
          `✅ [TRACKING] Extracted Stradivarius product ID from pelement: ${extractedId}`
        );

        // Use new Stradivarius lookup logic
        const stradResult = await this.handleStradivariusProductLookup(extractedId);

        if (!stradResult.success) {
          throw new Error(stradResult.message);
        }

        actualProduct = stradResult.product;
        productId = stradResult.productId;

        console.log(`✅ [TRACKING] Found Stradivarius product: ${actualProduct.name}, ID: ${productId}`);
      } else {
        const directProductMatch = productUrl.match(/\/product\/(\d+)/);
        if (directProductMatch) {
          const extractedId = directProductMatch[1];
          console.log(
            `✅ [TRACKING] Extracted Stradivarius product ID from direct product URL: ${extractedId}`
          );

          // Use new Stradivarius lookup logic
          const stradResult = await this.handleStradivariusProductLookup(extractedId);

          if (!stradResult.success) {
            throw new Error(stradResult.message);
          }

          actualProduct = stradResult.product;
          productId = stradResult.productId;

          console.log(`✅ [TRACKING] Found Stradivarius product: ${actualProduct.name}, ID: ${productId}`);
        } else {
          console.log(
            `❌ [TRACKING] Could not extract Stradivarius product ID - no pelement or product ID found in URL: ${productUrl}`
          );
          console.log(
            `💡 [TRACKING] Stradivarius URLs must contain either pelement=ID or /product/ID parameter`
          );
          throw new Error("Could not extract Stradivarius product ID from URL");
        }
      }

      // Extract colorId for customSettings (info only, no matching needed)
      const stradColorMatch = productUrl.match(/colorId=(\d+)/);
      if (stradColorMatch) {
        colorId = stradColorMatch[1];
        console.log(
          `✅ [TRACKING] Extracted Stradivarius color ID: ${colorId}`
        );
      }

      // Extract product code if present
      const productCodeMatch = productUrl.match(/-l(\d+)/);
      if (productCodeMatch) {
        const productCode = productCodeMatch[1];
        console.log(
          `✅ [TRACKING] Extracted Stradivarius product code: ${productCode}`
        );
        if (!customSettings) customSettings = {};
        customSettings.productCode = productCode;
      }
    } else {
      console.log(
        `❌ [TRACKING] Unsupported URL - not Zara, Bershka or Stradivarius: ${productUrl}`
      );
      throw new Error(
        "Unsupported brand - only Zara, Bershka and Stradivarius URLs are supported"
      );
    }

    console.log(
      `🔧 [TRACKING] Extracted: brand=${brand}, productId=${productId}, colorId=${colorId}`
    );

    if (!productId) {
      console.log(
        `❌ [TRACKING] Failed to extract product ID from URL: ${productUrl}`
      );
      throw new Error("Could not extract product ID from URL");
    }

    let product;

    // If we already found the actual product (for Bershka ref codes or URL matching), use it
    if (actualProduct) {
      console.log(`✅ [TRACKING] Using already matched product: ${actualProduct.name}`);
      console.log(`🔧 [TRACKING] Raw actualProduct data:`, {
        id: actualProduct.product_id,
        name: actualProduct.name,
        price: actualProduct.price,
        image_url: actualProduct.image_url?.substring(0, 100) + '...',
        reference: actualProduct.reference,
        brand: brand
      });

      const productService = require("./product.service");
      product = productService.formatProduct(actualProduct);

      console.log(`🔧 [TRACKING] Formatted product data:`, {
        id: product.id,
        title: product.title,
        formattedPrice: product.formattedPrice,
        imgSrc: product.imgSrc?.substring(0, 100) + '...',
        imageUrl: product.imageUrl?.substring(0, 100) + '...'
      });
    } else {
      // For Zara and Stradivarius, use the old method
      const productService = require("./product.service");
      console.log(
        `🔧 [TRACKING] Checking if product exists: productId=${productId}, brand=${brand}`
      );

      product = await productService.getProductById(productId, brand);

      if (!product) {
        console.log(
          `⚠️ [TRACKING] Product ${productId} (${brand}) not found in database, creating placeholder for tracking`
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
      console.log(
        `✅ [TRACKING] Allowing placeholder tracking for ${brand} product ${productId}`
      );
      return {
        success: true,
        message: "Product added to tracking (placeholder)",
        product: product,
        trackingUrl: productUrl,
        productId: productId,
      };
    }

    const result = await this.addProductTracking(
      userId,
      brand,
      productId,
      trackingOptions
    );
    const formattedProduct = productService.formatProduct(product);

    console.log(
      `🔧 [TRACKING] Original product image_url: ${
        product.image_url || product.imageUrl
      }`
    );
    console.log(
      `🔧 [TRACKING] Formatted product imgSrc: ${formattedProduct.imgSrc}`
    );
    console.log(
      `🔧 [TRACKING] Formatted product imageUrl: ${formattedProduct.imageUrl}`
    );

    const finalResult = {
      ...result,
      product: formattedProduct,
      trackingUrl: productUrl,
    };

    console.log(`🎯 [TRACKING] Final result being returned:`, {
      success: finalResult.success,
      productId: finalResult.product?.id,
      productName: finalResult.product?.title,
      productPrice: finalResult.product?.formattedPrice,
      trackingUrl: finalResult.trackingUrl
    });

    return finalResult;
  }

  /**
   * Remove product from tracking (using unified tracking table)
   * @param {string} userId - User ID
   * @param {string} productId - Product ID to untrack (this should be the original product_id, not unified ID)
   * @returns {Promise<Object>} Untracking result
   */
  async removeProductTracking(userId, productId) {
    return new Promise((resolve, reject) => {
      console.log(
        `🔧 [TRACKING] removeProductTracking called - userId: ${userId}, productId: ${productId}`
      );

      const findQuery = `
        SELECT utp.id, p.brand, p.product_id 
        FROM user_tracked_products_unified utp
        JOIN products_unified p ON utp.product_id = p.id
        WHERE utp.user_id = ? AND p.product_id = ?
      `;

      console.log(
        `🔧 [TRACKING] Finding tracking record - userId: ${userId}, productId: ${productId}`
      );
      console.log(`🔧 [TRACKING] Query:`, findQuery);

      db.get(findQuery, [userId, productId], (err, record) => {
        if (err) {
          console.error("❌ Error finding tracking record:", err);
          return reject(err);
        }

        if (!record) {
          console.log(
            `⚠️ [TRACKING] No tracking record found - userId: ${userId}, productId: ${productId}`
          );

          // Let's also check what records exist for this user
          db.all(
            "SELECT utp.id, p.product_id, p.brand, p.name FROM user_tracked_products_unified utp JOIN products_unified p ON utp.product_id = p.id WHERE utp.user_id = ?",
            [userId],
            (err, allRecords) => {
              if (!err) {
                console.log(`🔍 [TRACKING] All tracking records for user ${userId}:`, allRecords);
              }
            }
          );

          return resolve({
            success: false,
            message: "Product was not being tracked",
            removed: false,
          });
        }

        console.log(`✅ [TRACKING] Found tracking record:`, {
          id: record.id,
          brand: record.brand,
          productId: record.product_id
        });

        const deleteQuery =
          "DELETE FROM user_tracked_products_unified WHERE id = ?";

        db.run(deleteQuery, [record.id], function (err) {
          if (err) {
            console.error("❌ Error removing product tracking:", err);
            return reject(err);
          }

          console.log(
            `✅ [TRACKING] Successfully removed tracking - deleted ${this.changes} record(s) for ${record.brand}/${record.product_id}`
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
}

module.exports = new TrackingService();
