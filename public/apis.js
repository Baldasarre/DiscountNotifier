
export async function fetchWithCsrf(url, method = 'POST', body = {}) {
    try {
        console.log('CSRF token alınıyor...');
        const tokenRes = await fetch('/api/csrf-token');
        console.log('CSRF token response status:', tokenRes.status);
        
        if (!tokenRes.ok) {
            const errorText = await tokenRes.text();
            console.error('CSRF token error:', errorText);
            throw new Error(`CSRF token alınamadı: ${tokenRes.status} ${errorText}`);
        }
        
        const tokenData = await tokenRes.json();
        console.log('CSRF token alındı:', tokenData.csrfToken ? 'OK' : 'MISSING');

        console.log(`API çağrısı yapılıyor: ${method} ${url}`);
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
        console.error('Error details:', error.message, error.stack);
        throw error;
    }
}