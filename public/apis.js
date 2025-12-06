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

    if (filters.category) params.append("category", filters.category);
    if (filters.search) params.append("search", filters.search);
    if (filters.availability)
      params.append("availability", filters.availability);

    const url = `/api/simple/products${
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
    const response = await fetch("/api/simple/stats", {
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

    const endpoint = "/api/simple/track";

    const response = await fetchWithCsrf(endpoint, "POST", {
      productUrl: productUrl,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.message || `HTTP error! status: ${response.status}`
      );
    }

    const data = await response.json();

    console.log(
      "✅ Ürün takip edildi:",
      data.product?.title || data.product?.name
    );
    console.log("🔍 Full response data:", data);
    console.log("🔍 Response success:", data.success);

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

    const response = await fetch("/api/simple/tracked", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    console.log(`📦 Unified API Response:`, data);
    console.log(
      `📦 Toplam ürün sayısı: ${data.products ? data.products.length : 0}`
    );

    const allProducts = data.products || [];

    console.log(`✅ [${timestamp}] Unified API'den gelen ürünler hazır`);
    console.log(`📦 İlk ürün örneği:`, allProducts[0]);

    console.log(`✅ [${timestamp}] API Response:`, allProducts.length, "ürün");
    console.log(
      `🔍 [${timestamp}] API'den gelen ID'ler:`,
      allProducts.map((p) => p.id)
    );

    return { success: true, products: allProducts };
  } catch (error) {
    console.error("Takip edilen ürünler çekilirken hata:", error);
    throw error;
  }
}

export async function untrackProduct(productId) {
  try {
    console.log("➖ Ürün takipten çıkarılıyor:", productId);

    const response = await fetchWithCsrf(
      `/api/simple/untrack/${productId}`,
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

export async function untrackBershkaProduct(uniqueId) {
  try {
    console.log(
      "➖ Bershka ürünü takipten çıkarılıyor (unified endpoint):",
      uniqueId
    );

    const response = await fetchWithCsrf(
      `/api/simple/untrack/${uniqueId}`,
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

    console.log("✅ Bershka ürünü takipten çıkarıldı");

    return data;
  } catch (error) {
    console.error("Bershka ürünü takipten çıkarılırken hata:", error);
    throw error;
  }
}
