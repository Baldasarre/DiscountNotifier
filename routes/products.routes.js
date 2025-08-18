const express = require('express');
const router = express.Router();
const zaraService = require('../services/zara.service');
const schedulerService = require('../services/scheduler.service');
const authenticate = require('../middleware/authenticate');
const csrf = require('csurf');
const config = require('../config/environment');

// CSRF protection middleware
const csrfProtection = csrf({ cookie: true });

/**
 * GET /api/products - Ürünleri listele
 */
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            gender,
            search,
            availability
        } = req.query;

        const offset = (page - 1) * limit;
        const filters = {};

        if (gender) filters.gender = gender;
        if (search) filters.search = search;
        if (availability) filters.availability = availability;

        const products = await zaraService.getProductsFromDatabase(
            parseInt(limit),
            parseInt(offset),
            filters
        );

        // UI components formatına dönüştür
        const formattedProducts = products.map(product => ({
            id: product.product_id,
            imgSrc: product.image_url ? `/api/image-proxy?url=${encodeURIComponent(product.image_url)}` : 'Images/zara.png',
            brandLogoSrc: 'Images/zara.png',
            title: product.name,
            brand: 'Zara',
            discountStatus: product.is_on_sale ? 'İNDİRİMDE!' : 'TAKİP EDİLİYOR',
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
            lastUpdated: product.last_updated
        }));

        res.json({
            success: true,
            products: formattedProducts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: formattedProducts.length
            }
        });

    } catch (error) {
        console.error('Ürünler listelenirken hata:', error);
        res.status(500).json({
            success: false,
            message: 'Ürünler yüklenirken bir hata oluştu'
        });
    }
});

/**
 * GET /api/products/tracked - Kullanıcının takip ettiği ürünler
 */
router.get('/tracked', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const db = require('../config/database');

        const trackedProducts = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    utp.*,
                    zp.*
                FROM user_tracked_products utp
                JOIN zara_products zp ON utp.product_id = zp.product_id
                WHERE utp.user_id = ?
                ORDER BY utp.tracking_started_at ASC
            `, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // UI formatına dönüştür
        const formattedProducts = trackedProducts.map(product => ({
            id: product.product_id,
            imgSrc: product.image_url ? `/api/image-proxy?url=${encodeURIComponent(product.image_url)}` : 'Images/zara.png',
            brandLogoSrc: 'Images/zara.png',
            title: product.name,
            brand: 'Zara',
            discountStatus: product.is_on_sale ? 'İNDİRİMDE!' : 'TAKİP EDİLİYOR',
            addedPrice: `${(product.price / 100).toFixed(2)} TL`,
            originalPrice: product.price,
            salePrice: product.sale_price,
            productUrl: product.product_url,
            availability: product.availability,
            trackingStarted: product.tracking_started_at
        }));

        res.json({
            success: true,
            products: formattedProducts
        });

    } catch (error) {
        console.error('Takip edilen ürünler alınırken hata:', error);
        res.status(500).json({
            success: false,
            message: 'Takip edilen ürünler yüklenirken bir hata oluştu'
        });
    }
});

/**
 * GET /api/products/:id - Belirli bir ürünü getir
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const product = await zaraService.getProductById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Ürün bulunamadı'
            });
        }

        // UI components formatına dönüştür
        const formattedProduct = {
            id: product.product_id,
            imgSrc: product.image_url ? `/api/image-proxy?url=${encodeURIComponent(product.image_url)}` : 'Images/zara.png',
            brandLogoSrc: 'Images/zara.png',
            title: product.name,
            brand: 'Zara',
            description: product.description,
            discountStatus: product.is_on_sale ? 'İNDİRİMDE!' : 'TAKİP EDİLİYOR',
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
            lastUpdated: product.last_updated
        };

        res.json({
            success: true,
            product: formattedProduct
        });

    } catch (error) {
        console.error('Ürün getirilirken hata:', error);
        res.status(500).json({
            success: false,
            message: 'Ürün yüklenirken bir hata oluştu'
        });
    }
});

/**
 * POST /api/products/refresh - Manuel ürün güncellemesi tetikle
 */
router.post('/refresh', csrfProtection, async (req, res) => {
    try {
        const { brand = 'zara' } = req.body;
        
        console.log(`🔄 Manuel ${brand} güncellemesi istendi`);
        const result = await schedulerService.triggerManualUpdate(brand);

        if (result) {
            res.json({
                success: true,
                message: `${brand} ürünleri başarıyla güncellendi`
            });
        } else {
            res.status(400).json({
                success: false,
                message: `${brand} güncellemesi başarısız oldu`
            });
        }

    } catch (error) {
        console.error('Manuel güncelleme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Güncelleme sırasında bir hata oluştu'
        });
    }
});

/**
 * GET /api/products/stats/summary - Ürün istatistikleri
 */
router.get('/stats/summary', async (req, res) => {
    try {
        const db = require('../config/database');
        
        const stats = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    COUNT(*) as total_products,
                    COUNT(CASE WHEN availability = 'in_stock' THEN 1 END) as in_stock,
                    COUNT(CASE WHEN availability = 'out_of_stock' THEN 1 END) as out_of_stock,
                    COUNT(CASE WHEN is_on_sale = 1 THEN 1 END) as on_sale,
                    COUNT(CASE WHEN section_name = 'MAN' THEN 1 END) as men_products,
                    COUNT(CASE WHEN section_name = 'WOMAN' THEN 1 END) as women_products,
                    AVG(price) as avg_price,
                    MIN(price) as min_price,
                    MAX(price) as max_price,
                    MAX(last_updated) as last_update
                FROM zara_products
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows[0]);
            });
        });

        res.json({
            success: true,
            stats: {
                ...stats,
                avg_price: stats.avg_price ? (stats.avg_price / 100).toFixed(2) : 0,
                min_price: stats.min_price ? (stats.min_price / 100).toFixed(2) : 0,
                max_price: stats.max_price ? (stats.max_price / 100).toFixed(2) : 0,
                last_update_formatted: stats.last_update ? 
                    new Date(stats.last_update).toLocaleString('tr-TR') : 'Henüz güncellenmedi'
            }
        });

    } catch (error) {
        console.error('İstatistikler alınırken hata:', error);
        res.status(500).json({
            success: false,
            message: 'İstatistikler yüklenirken bir hata oluştu'
        });
    }
});

/**
 * GET /api/products/scheduler/status - Scheduler durumu
 */
router.get('/scheduler/status', async (req, res) => {
    try {
        const status = schedulerService.getStatus();
        
        res.json({
            success: true,
            scheduler: status
        });

    } catch (error) {
        console.error('Scheduler durumu alınırken hata:', error);
        res.status(500).json({
            success: false,
            message: 'Scheduler durumu alınamadı'
        });
    }
});

/**
 * POST /api/products/track - Ürün takip etme
 */
router.post('/track', csrfProtection, authenticate, async (req, res) => {
    try {
        const { productUrl } = req.body;
        const userId = req.user.id;

        if (!productUrl) {
            return res.status(400).json({
                success: false,
                message: 'Ürün URL\'si gerekli'
            });
        }

        // Zara URL'sinden ürün ID'sini çıkar
        const productInfo = extractZaraProductInfo(productUrl);
        
        if (!productInfo) {
            return res.status(400).json({
                success: false,
                message: 'Geçersiz Zara URL\'si'
            });
        }

        // Ürünün veritabanında olup olmadığını kontrol et
        const existingProduct = await zaraService.getProductById(productInfo.productId);
        
        if (!existingProduct) {
            return res.status(404).json({
                success: false,
                message: 'Bu ürün henüz sistemimizde bulunmuyor. Lütfen daha sonra tekrar deneyin.'
            });
        }

        // Kullanıcının zaten bu ürünü takip edip etmediğini kontrol et
        const db = require('../config/database');
        
        const existingTracking = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM user_tracked_products WHERE user_id = ? AND product_id = ? AND brand = ?',
                [userId, productInfo.productId, 'zara'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (existingTracking) {
            return res.status(400).json({
                success: false,
                message: 'Bu ürünü zaten takip ediyorsunuz'
            });
        }

        // Takip listesine ekle
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO user_tracked_products (user_id, product_id, brand) VALUES (?, ?, ?)',
                [userId, productInfo.productId, 'zara'],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({
            success: true,
            message: 'Ürün takip listesine eklendi',
            product: {
                id: existingProduct.product_id,
                title: existingProduct.name,
                price: `${(existingProduct.price / 100).toFixed(2)} TL`,
                imageUrl: existingProduct.image_url,
                productUrl: existingProduct.product_url
            }
        });

    } catch (error) {
        console.error('Ürün takip ederken hata:', error);
        res.status(500).json({
            success: false,
            message: 'Ürün takip edilirken bir hata oluştu'
        });
    }
});

/**
 * DELETE /api/products/untrack/:productId - Ürün takip etmeyi bırak
 */
router.delete('/untrack/:productId', csrfProtection, authenticate, async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.user.id;
        const db = require('../config/database');

        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM user_tracked_products WHERE user_id = ? AND product_id = ? AND brand = ?',
                [userId, productId, 'zara'],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({
            success: true,
            message: 'Ürün takip listesinden kaldırıldı'
        });

    } catch (error) {
        console.error('Ürün takipten çıkarılırken hata:', error);
        res.status(500).json({
            success: false,
            message: 'Ürün takipten çıkarılırken bir hata oluştu'
        });
    }
});

/**
 * Zara URL'sinden ürün bilgilerini çıkarır
 */
function extractZaraProductInfo(url) {
    try {
        // Zara URL formatları:
        // https://www.zara.com/tr/tr/pamuklu-keten-gomlek-p01063305.html?v1=452697181&v2=2443335
        // https://www.zara.com/tr/tr/product/452697181
        
        const zaraUrlPattern = /zara\.com\/tr\/tr\/.*p(\d+)\.html\?v1=(\d+)/;
        const match = url.match(zaraUrlPattern);
        
        if (match) {
            return {
                seoProductId: match[1], // 01063305
                productId: match[2]     // 452697181 (bu bizim ana ID'miz)
            };
        }

        // Alternatif format kontrol et
        const altPattern = /zara\.com\/tr\/tr\/product\/(\d+)/;
        const altMatch = url.match(altPattern);
        
        if (altMatch) {
            return {
                productId: altMatch[1]
            };
        }

        return null;
    } catch (error) {
        console.error('URL parse hatası:', error);
        return null;
    }
}

// Development endpoints (sadece development modunda)
if (config.NODE_ENV === 'development') {
    /**
     * GET /api/products/dev/status - Development durumu
     */
    router.get('/dev/status', (req, res) => {
        res.json({
            success: true,
            environment: 'development',
            scheduler: schedulerService.getStatus(),
            config: {
                autoFetchOnStartup: config.AUTO_FETCH_ON_STARTUP,
                initialDataFetch: config.INITIAL_DATA_FETCH,
                periodicTasks: config.ENABLE_PERIODIC_TASKS,
                forceInitialFetch: config.FORCE_INITIAL_FETCH
            },
            instructions: {
                manualFetch: 'POST /api/products/refresh',
                enablePeriodic: 'ENABLE_PERIODIC_TASKS=true',
                forceFetch: 'FORCE_INITIAL_FETCH=true'
            }
        });
    });

    /**
     * POST /api/products/dev/test-fetch - Test fetch
     */
    router.post('/dev/test-fetch', csrfProtection, async (req, res) => {
        try {
            const { category = 'men', force = false } = req.body;
            
            if (force || config.FORCE_INITIAL_FETCH) {
                console.log('🔄 Test fetch başlatılıyor...');
                const result = await zaraService.fetchProducts(category);
                
                res.json({
                    success: true,
                    message: 'Test fetch tamamlandı',
                    productsCount: result.length,
                    category
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Test fetch için force=true gerekli veya FORCE_INITIAL_FETCH=true'
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Test fetch hatası',
                error: error.message
            });
        }
    });
}

module.exports = router;
