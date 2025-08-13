
export async function fetchWithCsrf(url, method = 'POST', body = {}) {
    try {
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