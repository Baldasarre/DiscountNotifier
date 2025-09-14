const express = require("express");
const router = express.Router();
const productService = require("../services/product.service");
const schedulerService = require("../services/scheduler.service");
const authenticate = require("../middleware/authenticate");
const csrf = require("csurf");
const config = require("../config/environment");
const zaraService = require("../services/zara.service");
const bershkaService = require("../services/bershka.service");

const csrfProtection = csrf({ cookie: true });

router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20, gender, search, availability } = req.query;

    const offset = (page - 1) * limit;
    const filters = {};

    if (gender) filters.gender = gender;
    if (search) filters.search = search;
    if (availability) filters.availability = availability;

    const result = await productService.getProducts({
      brand: "zara",
      limit: parseInt(limit),
      page: Math.floor(parseInt(offset) / parseInt(limit)) + 1,
      ...filters,
    });
    const products = result.products || [];

    const formattedProducts = products.map((product) => ({
      id: product.product_id,
      imgSrc: product.image_url
        ? `/api/image-proxy?url=${encodeURIComponent(product.image_url)}`
        : "Images/zara.png",
      brandLogoSrc: "Images/zara.png",
      title: product.name,
      brand: "Zara",
      discountStatus: product.is_on_sale ? "İNDİRİMDE!" : "TAKİP EDİLİYOR",
      addedPrice: `${(product.price / 100).toFixed(2)} TL`,
      originalPrice: product.price,
      salePrice: product.sale_price,
      productUrl: product.product_url,
      availability: product.availability,
      reference: product.reference,
      displayReference: product.display_reference,
      colorHex: product.main_color_hex,
      familyName: product.family_name,
      section: product.section_name,
      lastUpdated: product.last_updated,
    }));

    res.json({
      success: true,
      products: formattedProducts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: formattedProducts.length,
      },
    });
  } catch (error) {
    console.error("Ürünler listelenirken hata:", error);
    res.status(500).json({
      success: false,
      message: "Ürünler yüklenirken bir hata oluştu",
    });
  }
});

router.get("/tracked", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(
      `🔍 /tracked (SADECE ZARA) endpoint çağrıldı - User ID: ${userId} - ${new Date().toISOString()}`
    );
    const db = require("../config/database");

    const trackedZaraProducts = await new Promise((resolve, reject) => {
      const sqlQuery = `
                SELECT 
                    utp.*,
                    zp.*
                FROM user_tracked_products_unified utp
                JOIN zara_products zp ON utp.product_id = zp.product_id
                WHERE utp.user_id = ? AND utp.brand = 'zara'
                GROUP BY utp.product_id, utp.user_id, utp.brand
                ORDER BY utp.tracking_started_at ASC
            `;

      db.all(sqlQuery, [userId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    const trackedProducts = trackedZaraProducts;

    console.log(
      `📦 Database'den dönen (SADECE ZARA) ürün sayısı: ${trackedProducts.length}`
    );

    const formattedProducts = trackedProducts.map((product) => {
      return {
        id: product.product_id,
        imgSrc: product.image_url
          ? `/api/image-proxy?url=${encodeURIComponent(product.image_url)}`
          : "Images/zara.png",
        brandLogoSrc: "Images/zara.png",
        title: product.name,
        brand: "Zara",
        discountStatus: product.is_on_sale ? "İNDİRİMDE!" : "TAKİP EDİLİYOR",
        addedPrice: `${(product.price / 100).toFixed(2)} TL`,
        originalPrice: product.price,
        salePrice: product.sale_price,
        productUrl: product.product_url,
        availability: product.availability,
        trackingStarted: product.tracking_started_at,
      };
    });

    console.log(
      `Frontend'e gönderilen (SADECE ZARA) ürün sayısı: ${formattedProducts.length}`
    );
    console.log(
      `Frontend'e gönderilen ID'ler:`,
      formattedProducts.map((p) => p.id)
    );

    res.json({
      success: true,
      products: formattedProducts,
    });
  } catch (error) {
    console.error("Takip edilen ZARA ürünleri alınırken hata:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Takip edilen ürünler yüklenirken bir hata oluştu",
      });
    }
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const product = await zaraService.getProductById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Ürün bulunamadı",
      });
    }

    const formattedProduct = {
      id: product.product_id,
      imgSrc: product.image_url
        ? `/api/image-proxy?url=${encodeURIComponent(product.image_url)}`
        : "Images/zara.png",
      brandLogoSrc: "Images/zara.png",
      title: product.name,
      brand: "Zara",
      description: product.description,
      discountStatus: product.is_on_sale ? "İNDİRİMDE!" : "TAKİP EDİLİYOR",
      addedPrice: `${(product.price / 100).toFixed(2)} TL`,
      originalPrice: product.price,
      salePrice: product.sale_price,
      productUrl: product.product_url,
      availability: product.availability,
      reference: product.reference,
      displayReference: product.display_reference,
      colorHex: product.main_color_hex,
      familyName: product.family_name,
      section: product.section_name,
      lastUpdated: product.last_updated,
    };

    res.json({
      success: true,
      product: formattedProduct,
    });
  } catch (error) {
    console.error("Ürün getirilirken hata:", error);
    res.status(500).json({
      success: false,
      message: "Ürün yüklenirken bir hata oluştu",
    });
  }
});

router.post("/refresh", csrfProtection, async (req, res) => {
  try {
    const { brand = "zara" } = req.body;

    console.log(`🔄 Manuel ${brand} güncellemesi istendi`);
    const result = await schedulerService.triggerManualUpdate(brand);

    if (result) {
      res.json({
        success: true,
        message: `${brand} ürünleri başarıyla güncellendi`,
      });
    } else {
      res.status(400).json({
        success: false,
        message: `${brand} güncellemesi başarısız oldu`,
      });
    }
  } catch (error) {
    console.error("Manuel güncelleme hatası:", error);
    res.status(500).json({
      success: false,
      message: "Güncelleme sırasında bir hata oluştu",
    });
  }
});

router.get("/stats/summary", async (req, res) => {
  try {
    const db = require("../config/database");

    const stats = await new Promise((resolve, reject) => {
      db.all(
        `
                SELECT 
                    COUNT(*) as total_products,
                    COUNT(CASE WHEN availability = 'in_stock' THEN 1 END) as in_stock,
                    COUNT(CASE WHEN availability = 'out_of_stock' THEN 1 END) as out_of_stock,
                    COUNT(CASE WHEN is_on_sale = 1 THEN 1 END) as on_sale,
                    COUNT(CASE WHEN section_name = 'MAN' THEN 1 END) as men_products,
                    COUNT(CASE WHEN section_name = 'WOMAN' THEN 1 END) as women_products,
                    MIN(price) as min_price,
                    MAX(price) as max_price,
                    MAX(last_updated) as last_update
                FROM zara_products
            `,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows[0]);
        }
      );
    });

    res.json({
      success: true,
      stats: {
        ...stats,
        min_price: stats.min_price ? (stats.min_price / 100).toFixed(2) : 0,
        max_price: stats.max_price ? (stats.max_price / 100).toFixed(2) : 0,
        last_update_formatted: stats.last_update
          ? new Date(stats.last_update).toLocaleString("tr-TR")
          : "Henüz güncellenmedi",
      },
    });
  } catch (error) {
    console.error("İstatistikler alınırken hata:", error);
    res.status(500).json({
      success: false,
      message: "İstatistikler yüklenirken bir hata oluştu",
    });
  }
});

router.get("/scheduler/status", async (req, res) => {
  try {
    const status = schedulerService.getStatus();

    res.json({
      success: true,
      scheduler: status,
    });
  } catch (error) {
    console.error("Scheduler durumu alınırken hata:", error);
    res.status(500).json({
      success: false,
      message: "Scheduler durumu alınamadı",
    });
  }
});

router.post("/track", csrfProtection, authenticate, async (req, res) => {
  console.log("🔥🔥🔥 PRODUCTS TRACK ENDPOINT CALLED 🔥🔥🔥");
  try {
    const { productUrl } = req.body;
    const userId = req.user.id;

    if (!productUrl) {
      return res.status(400).json({
        success: false,
        message: "Ürün URL'si gerekli",
      });
    }

    const trackingService = require("../services/tracking.service");
    const result = await trackingService.trackProductByUrl(userId, productUrl);

    return res.json(result);
  } catch (error) {
    console.error("Error tracking product:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to track product",
    });
  }
});

router.delete(
  "/untrack/:productId",
  csrfProtection,
  authenticate,
  async (req, res) => {
    try {
      const { productId } = req.params;
      const userId = req.user.id;
      const db = require("../config/database");

      const trackingService = require("../services/tracking.service");
      await trackingService.removeProductTracking(userId, productId);

      res.json({
        success: true,
        message: "Ürün takip listesinden kaldırıldı",
      });
    } catch (error) {
      console.error("Ürün takipten çıkarılırken hata:", error);
      res.status(500).json({
        success: false,
        message: "Ürün takipten çıkarılırken bir hata oluştu",
      });
    }
  }
);

router.post("/zara/fetch-all", csrfProtection, async (req, res) => {
  try {
    console.log("🚀 Zara ürün çekme işlemi başlatılıyor...");

    zaraService
      .fetchAndSaveAllProducts()
      .then((result) => {
        console.log("✅ Zara ürün çekme işlemi tamamlandı:", result);
      })
      .catch((error) => {
        console.error("❌ Zara ürün çekme işlemi hatası:", error);
      });

    res.json({
      success: true,
      message:
        "Zara ürün çekme işlemi başlatıldı. Bu işlem arka planda devam edecek.",
      estimatedTime: "5-10 dakika",
      note: "İşlem durumunu /api/products/stats/summary endpoint'inden takip edebilirsiniz.",
    });
  } catch (error) {
    console.error("Zara ürün çekme hatası:", error);
    res.status(500).json({
      success: false,
      message: "Ürün çekme işlemi başlatılamadı",
      error: error.message,
    });
  }
});

router.get("/zara/categories", async (req, res) => {
  try {
    const categories = await zaraService.getCategoriesFromDatabase();

    const groupedCategories = {};
    categories.forEach((cat) => {
      if (!groupedCategories[cat.gender]) {
        groupedCategories[cat.gender] = [];
      }
      groupedCategories[cat.gender].push({
        id: cat.category_id,
        name: cat.category_name,
        url: cat.category_url,
        seo_keyword: cat.seo_keyword,
        last_updated: cat.last_updated,
      });
    });

    res.json({
      success: true,
      categories: groupedCategories,
      total: categories.length,
    });
  } catch (error) {
    console.error("Kategoriler alınırken hata:", error);
    res.status(500).json({
      success: false,
      message: "Kategoriler yüklenirken bir hata oluştu",
    });
  }
});

router.post(
  "/zara/fetch-category/:categoryId",
  csrfProtection,
  async (req, res) => {
    try {
      const { categoryId } = req.params;

      console.log(`🔄 ${categoryId} kategorisinden ürün çekiliyor...`);

      const products = await zaraService.fetchProducts(categoryId);

      if (products.length > 0) {
        await zaraService.saveProductsToDatabase(products);

        res.json({
          success: true,
          message: `${products.length} ürün başarıyla çekildi ve kaydedildi`,
          categoryId,
          productsCount: products.length,
          sampleProduct: {
            name: products[0].name,
            price: products[0].price,
            gender: products[0].gender,
            category: products[0].category_name,
          },
        });
      } else {
        res.json({
          success: true,
          message: "Bu kategoride ürün bulunamadı",
          categoryId,
          productsCount: 0,
        });
      }
    } catch (error) {
      console.error("Kategori ürün çekme hatası:", error);
      res.status(500).json({
        success: false,
        message: "Ürün çekme işlemi başarısız oldu",
        error: error.message,
      });
    }
  }
);

function extractZaraProductInfo(url) {
  try {
    const zaraUrlPattern = /zara\.com\/tr\/tr\/.*p(\d+)\.html\?v1=(\d+)/;
    const match = url.match(zaraUrlPattern);

    if (match) {
      return {
        seoProductId: match[1],
        productId: match[2],
      };
    }

    const altPattern = /zara\.com\/tr\/tr\/product\/(\d+)/;
    const altMatch = url.match(altPattern);

    if (altMatch) {
      return {
        productId: altMatch[1],
      };
    }

    return null;
  } catch (error) {
    console.error("URL parse hatası:", error);
    return null;
  }
}

module.exports = router;
