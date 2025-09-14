const express = require("express");
const router = express.Router();
const productService = require("../services/product.service");
const trackingService = require("../services/tracking.service");
const authenticate = require("../middleware/authenticate");

router.get("/products", async (req, res) => {
  try {
    const result = await productService.getProducts(req.query);
    res.json(result);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
});

router.get("/zara", async (req, res) => {
  try {
    const result = await productService.getProducts({
      ...req.query,
      brand: "zara",
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching Zara products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Zara products",
    });
  }
});

router.get("/bershka", async (req, res) => {
  try {
    const result = await productService.getProducts({
      ...req.query,
      brand: "bershka",
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching Bershka products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Bershka products",
    });
  }
});

router.get("/stradivarius", async (req, res) => {
  try {
    const result = await productService.getProducts({
      ...req.query,
      brand: "stradivarius",
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching Stradivarius products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Stradivarius products",
    });
  }
});

router.get("/search", async (req, res) => {
  try {
    const { q, brand, limit } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search term must be at least 2 characters",
      });
    }

    const result = await productService.searchProducts(q.trim(), {
      brand,
      limit,
    });
    res.json(result);
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search products",
    });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const { brand } = req.query;
    const result = await productService.getProductStats(brand);
    res.json(result);
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
    });
  }
});

router.get("/tracked", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await trackingService.getUserTrackedProducts(
      userId,
      req.query
    );
    res.json(result);
  } catch (error) {
    console.error("Error fetching tracked products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tracked products",
    });
  }
});

router.get("/tracking-count", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await trackingService.getUserTrackingCount(userId);

    res.json({
      success: true,
      count: count,
      maxAllowed: 12,
    });
  } catch (error) {
    console.error("Error fetching tracking count:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tracking count",
    });
  }
});

router.post("/track", authenticate, async (req, res) => {
  console.log("🔥🔥🔥 TRACK ENDPOINT CALLED 🔥🔥🔥");
  try {
    const userId = req.user.id;
    const { productUrl } = req.body;

    console.log(
      `🔧 [ROUTES] POST /api/simple/track - userId: ${userId}, URL: ${productUrl}`
    );

    if (!productUrl) {
      console.log(`❌ [ROUTES] Missing productUrl in request`);
      return res.status(400).json({
        success: false,
        message: "Product URL is required",
      });
    }

    console.log(
      `🔧 [ROUTES] Calling trackingService.trackProductByUrl(${userId}, ${productUrl})`
    );
    const result = await trackingService.trackProductByUrl(userId, productUrl);
    res.json(result);
  } catch (error) {
    console.error("Error tracking product:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to track product",
    });
  }
});

router.delete("/untrack/:productId", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    console.log(
      `🔧 [ROUTES] DELETE /api/simple/untrack/${productId} - userId: ${userId}`
    );

    if (!productId) {
      console.log(`❌ [ROUTES] Missing productId in request`);
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    console.log(
      `🔧 [ROUTES] Calling trackingService.untrackProduct(${userId}, ${productId})`
    );
    const result = await trackingService.untrackProduct(userId, productId);

    console.log(`✅ [ROUTES] Tracking service result:`, result);

    res.json({
      success: true,
      message: "Product removed from tracking",
      result: result,
    });
  } catch (error) {
    console.error("❌ [ROUTES] Error untracking product:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to untrack product",
    });
  }
});

router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Unified API is working",
    timestamp: new Date().toISOString(),
    version: "2.0.0-unified",
  });
});

module.exports = router;
