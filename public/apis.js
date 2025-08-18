// Debug flag - production'da false yapılabilir
const DEBUG_MODE = false;

export async function fetchWithCsrf(url, method = 'POST', body = {}) {
    try {
        if (DEBUG_MODE) {
            console.log('CSRF token alınıyor...');
        }
        const tokenRes = await fetch('/api/csrf-token');
        if (DEBUG_MODE) {
            console.log('CSRF token response status:', tokenRes.status);
        }
        
        if (!tokenRes.ok) {
            const errorText = await tokenRes.text();
            console.error('CSRF token error:', errorText);
            throw new Error(`CSRF token alınamadı: ${tokenRes.status} ${errorText}`);
        }
        
        const tokenData = await tokenRes.json();
        if (DEBUG_MODE) {
            console.log('CSRF token alındı:', tokenData.csrfToken ? 'OK' : 'MISSING');
        }

        if (DEBUG_MODE) {
            console.log(`API çağrısı yapılıyor: ${method} ${url}`);
        }
        return fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'csrf-token': tokenData.csrfToken 
            },
            body: JSON.stringify(body)
        });
    } catch (error) {
        console.error('fetchWithCsrf hatası:', error);
        if (DEBUG_MODE) {
            console.error('Error details:', error.message, error.stack);
        }
        throw error;
    }
}

// ====== PRODUCT APIs ======

/**
 * Ürünleri listele (CSRF gerekmez)
 */
export async function fetchProducts(filters = {}) {
    try {
        const params = new URLSearchParams();
        
        // Sayfalama parametreleri
        if (filters.page) params.append('page', filters.page);
        if (filters.limit) params.append('limit', filters.limit);
        
        // Filtre parametreleri
        if (filters.gender) params.append('gender', filters.gender);
        if (filters.search) params.append('search', filters.search);
        if (filters.availability) params.append('availability', filters.availability);
        
        const url = `/api/products${params.toString() ? '?' + params.toString() : ''}`;
        
        if (DEBUG_MODE) {
            console.log('Ürünler çekiliyor:', url);
        }
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (DEBUG_MODE) {
            console.log('Ürünler başarıyla çekildi:', data.products?.length, 'ürün');
        }
        
        return data;
    } catch (error) {
        console.error('Ürünler çekilirken hata:', error);
        throw error;
    }
}

/**
 * Belirli bir ürünü getir
 */
export async function fetchProductById(productId) {
    try {
        if (DEBUG_MODE) {
            console.log('Ürün detayı çekiliyor:', productId);
        }
        
        const response = await fetch(`/api/products/${productId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (DEBUG_MODE) {
            console.log('Ürün detayı başarıyla çekildi:', data.product?.title);
        }
        
        return data;
    } catch (error) {
        console.error('Ürün detayı çekilirken hata:', error);
        throw error;
    }
}

/**
 * Ürün istatistiklerini getir
 */
export async function fetchProductStats() {
    try {
        if (DEBUG_MODE) {
            console.log('Ürün istatistikleri çekiliyor...');
        }
        
        const response = await fetch('/api/products/stats/summary', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (DEBUG_MODE) {
            console.log('İstatistikler başarıyla çekildi:', data.stats);
        }
        
        return data;
    } catch (error) {
        console.error('İstatistikler çekilirken hata:', error);
        throw error;
    }
}

/**
 * Manuel ürün güncellemesi tetikle
 */
export async function triggerProductRefresh(brand = 'zara') {
    try {
        if (DEBUG_MODE) {
            console.log('Manuel güncelleme tetikleniyor:', brand);
        }
        
        const response = await fetch('/api/products/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ brand })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (DEBUG_MODE) {
            console.log('Manuel güncelleme sonucu:', data.message);
        }
        
        return data;
    } catch (error) {
        console.error('Manuel güncelleme hatası:', error);
        throw error;
    }
}

/**
 * Scheduler durumunu getir
 */
export async function fetchSchedulerStatus() {
    try {
        if (DEBUG_MODE) {
            console.log('Scheduler durumu çekiliyor...');
        }
        
        const response = await fetch('/api/products/scheduler/status', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (DEBUG_MODE) {
            console.log('Scheduler durumu:', data.scheduler);
        }
        
        return data;
    } catch (error) {
        console.error('Scheduler durumu alınırken hata:', error);
        throw error;
    }
}

// ====== PRODUCT TRACKING APIs ======

/**
 * Ürün takip etme
 */
export async function trackProduct(productUrl) {
    try {
        if (DEBUG_MODE) {
            console.log('Ürün takip ediliyor:', productUrl);
        }
        
        const response = await fetchWithCsrf('/api/products/track', 'POST', {
            productUrl: productUrl
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (DEBUG_MODE) {
            console.log('Ürün takip edildi:', data.product?.title);
        }
        
        return data;
    } catch (error) {
        console.error('Ürün takip edilirken hata:', error);
        throw error;
    }
}

/**
 * Kullanıcının takip ettiği ürünleri getir
 */
export async function fetchTrackedProducts() {
    try {
        if (DEBUG_MODE) {
            console.log('Takip edilen ürünler çekiliyor...');
        }
        
        const response = await fetch('/api/products/tracked', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (DEBUG_MODE) {
            console.log('Takip edilen ürünler:', data.products?.length, 'ürün');
        }
        
        return data;
    } catch (error) {
        console.error('Takip edilen ürünler çekilirken hata:', error);
        throw error;
    }
}

/**
 * Ürün takipten çıkar
 */
export async function untrackProduct(productId) {
    try {
        if (DEBUG_MODE) {
            console.log('Ürün takipten çıkarılıyor:', productId);
        }
        
        const response = await fetchWithCsrf(`/api/products/untrack/${productId}`, 'DELETE', {});
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (DEBUG_MODE) {
            console.log('Ürün takipten çıkarıldı');
        }
        
        return data;
    } catch (error) {
        console.error('Ürün takipten çıkarılırken hata:', error);
        throw error;
    }
}