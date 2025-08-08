/**
 * CSRF token'ını otomatik olarak alıp isteklere ekleyen merkezi bir yardımcı fonksiyon.
 * Bu fonksiyon, projedeki tüm güvenli (POST, PUT, DELETE vb.) istekler için kullanılmalıdır.
 * @param {string} url - İstek yapılacak API endpoint'i.
 * @param {string} method - HTTP metodu (örn: 'POST').
 * @param {object} body - İstekle birlikte gönderilecek JSON verisi.
 * @returns {Promise<Response>} Standart bir fetch yanıtı döndürür.
 */
async function fetchWithCsrf(url, method = 'POST', body = {}) {
    try {
        // Önce sunucudan geçerli CSRF token'ını al.
        const tokenRes = await fetch('/api/csrf-token');
        if (!tokenRes.ok) throw new Error('CSRF token alınamadı.');
        const { csrfToken } = await tokenRes.json();

        return fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'csrf-token': csrfToken 
            },
            body: JSON.stringify(body)
        });
    } catch (error) {
        console.error('fetchWithCsrf hatası:', error);
        throw error;
    }
}
