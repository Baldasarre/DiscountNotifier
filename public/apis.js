export async function fetchWithCsrf(url, method = "POST", body = {}) {
  try {
    const tokenRes = await fetch("/api/csrf-token");

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error("CSRF token error:", errorText);
      throw new Error(`CSRF token alınamadı: ${tokenRes.status} ${errorText}`);
    }

    const tokenData = await tokenRes.json();
    return fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        "csrf-token": tokenData.csrfToken,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("fetchWithCsrf hatası:", error);
    throw error;
  }
}

// ====== PRODUCT APIs ======

export async function fetchProducts(filters = {}) {
  try {
    const params = new URLSearchParams();

    if (filters.page) params.append("page", filters.page);
    if (filters.limit) params.append("limit", filters.limit);

    if (filters.gender) params.append("gender", filters.gender);
    if (filters.search) params.append("search", filters.search);
    if (filters.availability)
      params.append("availability", filters.availability);

    const url = `/api/products${
      params.toString() ? "?" + params.toString() : ""
    }`;

    console.log("📦 Ürünler çekiliyor:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    console.log("✅ Ürünler başarıyla çekildi:", data.products?.length, "ürün");

    return data;
  } catch (error) {
    console.error("Ürünler çekilirken hata:", error);
    throw error;
  }
}

export async function fetchProductById(productId) {
  try {
    console.log("🔍 Ürün detayı çekiliyor:", productId);

    const response = await fetch(`/api/products/${productId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    console.log("✅ Ürün detayı başarıyla çekildi:", data.product?.title);

    return data;
  } catch (error) {
    console.error("Ürün detayı çekilirken hata:", error);
    throw error;
  }
}

export async function fetchProductStats() {
  try {
    const response = await fetch("/api/products/stats/summary", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error("İstatistikler çekilirken hata:", error);
    throw error;
  }
}

export async function triggerProductRefresh(brand = "zara") {
  try {
    console.log("🔄 Manuel güncelleme tetikleniyor:", brand);

    const response = await fetch("/api/products/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ brand }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    console.log("✅ Manuel güncelleme sonucu:", data.message);

    return data;
  } catch (error) {
    console.error("Manuel güncelleme hatası:", error);
    throw error;
  }
}

export async function fetchSchedulerStatus() {
  try {
    const response = await fetch("/api/products/scheduler/status", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    console.log("📊 Scheduler durumu:", data.scheduler);

    return data;
  } catch (error) {
    console.error("Scheduler durumu alınırken hata:", error);
    throw error;
  }
}

// ====== PRODUCT TRACKING APIs ======

export async function trackProduct(productUrl) {
  try {
    console.log("➕ Ürün takip ediliyor:", productUrl);

    const response = await fetchWithCsrf("/api/products/track", "POST", {
      productUrl: productUrl,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.message || `HTTP error! status: ${response.status}`
      );
    }

    const data = await response.json();

    console.log("✅ Ürün takip edildi:", data.product?.title);

    return data;
  } catch (error) {
    console.error("Ürün takip edilirken hata:", error);
    throw error;
  }
}

export async function fetchTrackedProducts() {
  try {
    const timestamp = new Date().toISOString();
    console.log(`📋 [${timestamp}] fetchTrackedProducts ÇAĞRILIYOR`);

    const response = await fetch("/api/products/tracked", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    console.log(`✅ [${timestamp}] API Response:`, data.products?.length, "ürün");
    console.log(`🔍 [${timestamp}] API'den gelen ID'ler:`, data.products?.map(p => p.id));

    return data;
  } catch (error) {
    console.error("Takip edilen ürünler çekilirken hata:", error);
    throw error;
  }
}

export async function untrackProduct(productId) {
  try {
    console.log("➖ Ürün takipten çıkarılıyor:", productId);

    const response = await fetchWithCsrf(
      `/api/products/untrack/${productId}`,
      "DELETE",
      {}
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.message || `HTTP error! status: ${response.status}`
      );
    }

    const data = await response.json();

    console.log("✅ Ürün takipten çıkarıldı");

    return data;
  } catch (error) {
    console.error("Ürün takipten çıkarılırken hata:", error);
    throw error;
  }
}
