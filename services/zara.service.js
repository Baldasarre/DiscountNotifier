const axios = require('axios');
const db = require('../config/database');

class ZaraService {
    constructor() {
        this.baseUrl = 'https://www.zara.com/tr/tr';
        this.menProductsUrl = `${this.baseUrl}/category/2458839/products?ajax=true`;
        this.womenProductsUrl = `${this.baseUrl}/category/1125598/products?ajax=true`; // Bu URL'i daha sonra bulacağız
        this.requestDelay = 3000; // 3 saniye delay (daha güvenli)
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        this.lastRequestTime = 0;
        this.minRequestInterval = 5000; // En az 5 saniye ara
    }

    /**
     * Rate limiting kontrolü
     */
    async waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            console.log(`⏳ Rate limiting: ${waitTime}ms bekleniyor...`);
            await this.delay(waitTime);
        }
        
        // Ek random delay (daha human-like)
        const randomDelay = Math.floor(Math.random() * 2000) + 1000; // 1-3 saniye arası
        await this.delay(randomDelay);
        
        this.lastRequestTime = Date.now();
    }

    /**
     * API'den ürün verilerini çeker
     */
    async fetchProducts(gender = 'men') {
        const url = gender === 'men' ? this.menProductsUrl : this.womenProductsUrl;
        
        try {
            console.log(`🔄 Zara ${gender} ürünleri çekiliyor...`);
            
            // Rate limiting kontrolü
            await this.waitForRateLimit();
            
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
                    'Referer': this.baseUrl,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Cache-Control': 'no-cache'
                },
                timeout: 30000
            });
            
            console.log(`✅ API yanıtı alındı - Status: ${response.status}`);

            if (response.data && response.data.productGroups) {
                const products = this.parseProductData(response.data, gender);
                console.log(`✅ ${products.length} adet ${gender} ürünü başarıyla çekildi`);
                return products;
            } else {
                console.log('❌ Geçersiz API yanıtı');
                return [];
            }
        } catch (error) {
            console.error(`❌ Zara ${gender} ürünleri çekilirken hata:`, error.message);
            return [];
        }
    }

    /**
     * API yanıtını parse eder ve normalize edilmiş ürün verisi döner
     */
    parseProductData(apiResponse, gender) {
        const products = [];

        if (!apiResponse.productGroups) return products;

        apiResponse.productGroups.forEach(group => {
            if (group.elements) {
                group.elements.forEach(element => {
                    if (element.commercialComponents) {
                        element.commercialComponents.forEach(component => {
                            if (component.type === 'Product' && component.detail && component.detail.colors) {
                                // Her renk için ayrı ürün kaydı oluştur
                                component.detail.colors.forEach(color => {
                                    const product = this.createProductObject(component, color, gender);
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

    /**
     * Tek bir ürün objesi oluşturur
     */
    createProductObject(component, color, gender) {
        try {
            // Ürün URL'i oluştur
            const productUrl = this.buildProductUrl(component.seo, component.id, color.productId);
            
            // Resim URL'i al
            const imageUrl = this.getImageUrl(color);

            return {
                product_id: component.id.toString(),
                reference: component.reference,
                display_reference: component.detail.displayReference,
                name: component.name,
                description: component.description || '',
                price: color.price || component.price,
                section: component.section,
                section_name: component.sectionName,
                brand_code: 'zara',
                seo_keyword: component.seo ? component.seo.keyword : '',
                seo_product_id: component.seo ? component.seo.seoProductId : '',
                main_color_hex: component.colorInfo ? component.colorInfo.mainColorHexCode : '',
                num_additional_colors: component.colorInfo ? component.colorInfo.numAdditionalColors : 0,
                availability: color.availability || component.availability,
                image_url: imageUrl,
                product_url: productUrl,
                grid_position: component.gridPosition,
                family_name: component.familyName,
                subfamily_name: component.subfamilyName,
                color_id: color.id,
                color_name: color.name,
                gender: gender,
                last_updated: new Date().toISOString()
            };
        } catch (error) {
            console.error('Ürün objesi oluşturulurken hata:', error);
            return null;
        }
    }

    /**
     * Ürün URL'i oluşturur
     */
    buildProductUrl(seo, productId, colorProductId) {
        if (seo && seo.keyword && seo.seoProductId) {
            return `${this.baseUrl}/${seo.keyword}-p${seo.seoProductId}.html?v1=${productId}&v2=${colorProductId}`;
        }
        return `${this.baseUrl}/product/${productId}`;
    }

    /**
     * Ürün resminin URL'ini alır
     */
    getImageUrl(color) {
        if (color.xmedia && color.xmedia.length > 0) {
            return color.xmedia[0].url.replace('{width}', '750');
        }
        if (color.pdpMedia && color.pdpMedia.url) {
            return color.pdpMedia.url.replace('{width}', '750');
        }
        return '';
    }

    /**
     * Ürünleri veritabanına kaydet
     */
    async saveProductsToDatabase(products) {
        if (!products || products.length === 0) return;

        console.log(`💾 ${products.length} ürün veritabanına kaydediliyor...`);

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO zara_products (
                product_id, reference, display_reference, name, description, price,
                section, section_name, brand_code, seo_keyword, seo_product_id,
                main_color_hex, num_additional_colors, availability, image_url,
                product_url, grid_position, family_name, subfamily_name,
                is_on_sale, sale_price, last_updated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            
            let processedCount = 0;
            products.forEach(product => {
                stmt.run([
                    product.product_id,
                    product.reference,
                    product.display_reference,
                    product.name,
                    product.description,
                    product.price,
                    product.section,
                    product.section_name,
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
                    0, // is_on_sale - başlangıçta false
                    null, // sale_price
                    product.last_updated
                ]);
                processedCount++;
                
                if (processedCount % 100 === 0) {
                    console.log(`📊 ${processedCount}/${products.length} ürün işlendi...`);
                }
            });

            db.run("COMMIT", (err) => {
                if (err) {
                    console.error('❌ Ürünler kaydedilirken hata:', err);
                } else {
                    console.log(`✅ ${processedCount} ürün başarıyla veritabanına kaydedildi`);
                }
            });
        });

        stmt.finalize();
    }

    /**
     * Veritabanından ürünleri al
     */
    async getProductsFromDatabase(limit = 50, offset = 0, filters = {}) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT * FROM zara_products 
                WHERE 1=1
            `;
            const params = [];

            // Filtreler
            if (filters.gender) {
                query += ` AND section_name = ?`;
                params.push(filters.gender.toUpperCase());
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

    /**
     * Belirli bir ürünü ID ile al
     */
    async getProductById(productId) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM zara_products WHERE product_id = ?',
                [productId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    /**
     * Cache meta verisini güncelle
     */
    async updateCacheMetadata(cacheKey, nextUpdateTime) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            
            db.run(`
                INSERT OR REPLACE INTO cache_metadata (cache_key, last_updated, next_update, status)
                VALUES (?, ?, ?, 'active')
            `, [cacheKey, now, nextUpdateTime], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Son güncelleme zamanını kontrol et
     */
    async getCacheMetadata(cacheKey) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM cache_metadata WHERE cache_key = ?',
                [cacheKey],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    /**
     * Tam veri çekme işlemi - hem erkek hem kadın
     */
    async fetchAndSaveAllProducts() {
        try {
            console.log('🚀 Zara ürün güncellemesi başlatılıyor...');
            
            // Erkek ürünleri çek
            const menProducts = await this.fetchProducts('men');
            if (menProducts.length > 0) {
                await this.saveProductsToDatabase(menProducts);
                await this.updateCacheMetadata('zara_men_products', this.getNextUpdateTime());
                console.log(`✅ ${menProducts.length} erkek ürünü kaydedildi`);
            } else {
                console.log('⚠️ Erkek ürünü bulunamadı');
            }

            // Brandlar arası delay
            const betweenBrandsDelay = Math.floor(Math.random() * 10000) + 5000; // 5-15 saniye
            console.log(`⏳ Brandlar arası bekleme: ${betweenBrandsDelay}ms`);
            await this.delay(betweenBrandsDelay);

            // Kadın ürünleri çek (URL bulunduğunda aktif olacak)
            // const womenProducts = await this.fetchProducts('women');
            // if (womenProducts.length > 0) {
            //     await this.saveProductsToDatabase(womenProducts);
            //     await this.updateCacheMetadata('zara_women_products', this.getNextUpdateTime());
            //     console.log(`✅ ${womenProducts.length} kadın ürünü kaydedildi`);
            // }

            console.log('🎉 Tüm Zara ürünleri başarıyla güncellendi!');
            return true;
        } catch (error) {
            console.error('❌ Zara ürünleri güncellenirken hata:', error);
            
            // Hata durumunda da next update time set et (ama biraz daha erken)
            const errorNextUpdate = new Date();
            errorNextUpdate.setMinutes(errorNextUpdate.getMinutes() + 30); // 30 dakika sonra tekrar dene
            await this.updateCacheMetadata('zara_men_products', errorNextUpdate.toISOString());
            
            return false;
        }
    }

    /**
     * Sonraki güncelleme zamanını hesapla (45dk - 1sa 15dk arası random)
     */
    getNextUpdateTime() {
        const minMinutes = 45;
        const maxMinutes = 75;
        const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
        
        const nextUpdate = new Date();
        nextUpdate.setMinutes(nextUpdate.getMinutes() + randomMinutes);
        
        console.log(`⏰ Sonraki güncelleme: ${randomMinutes} dakika sonra (${nextUpdate.toLocaleString('tr-TR')})`);
        
        return nextUpdate.toISOString();
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new ZaraService();
