const axios = require("axios");
const { createServiceLogger } = require("../utils/logger");

const logger = createServiceLogger("image-proxy");
class ImageProxyService {
  /**
   * Proxy an image request with appropriate headers
   * @param {string} url - Image URL to proxy
   * @returns {Promise<Object>} Stream response with headers
   */
  async proxyImage(url) {
    if (
      !url ||
      (!url.startsWith("https://static.zara.net/") &&
        !url.startsWith("https://static.bershka.net/") &&
        !url.startsWith("https://static.e-stradivarius.net/") &&
        !url.startsWith("https://static.pullandbear.net/") &&
        !url.startsWith("https://static.massimodutti.net/") &&
        !url.startsWith("https://static.oysho.net/") &&
        !url.startsWith("https://image.hm.com/"))
    ) {
      throw new Error(
        "Invalid URL - Only Zara, Bershka, Stradivarius, Pull&Bear, Massimo Dutti, Oysho and H&M images are supported"
      );
    }

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
    };

    if (url.startsWith("https://static.zara.net/")) {
      headers.Referer = "https://www.zara.com/";
    } else if (url.startsWith("https://static.bershka.net/")) {
      headers.Referer = "https://www.bershka.com/";
    } else if (url.startsWith("https://static.e-stradivarius.net/")) {
      headers.Referer = "https://www.stradivarius.com/";
    } else if (url.startsWith("https://static.pullandbear.net/")) {
      headers.Referer = "https://www.pullandbear.com/";
    } else if (url.startsWith("https://static.massimodutti.net/")) {
      headers.Referer = "https://www.massimodutti.com/";
    } else if (url.startsWith("https://static.oysho.net/")) {
      headers.Referer = "https://www.oysho.com/";
    } else if (url.startsWith("https://image.hm.com/")) {
      headers.Referer = "https://www2.hm.com/";
    }

    const startTime = Date.now();
    const response = await axios.get(url, {
      responseType: "arraybuffer", // Buffer mode for smooth loading (no chunked transfer)
      headers: headers,
      timeout: 15000, // Increased timeout to 15s
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const duration = Date.now() - startTime;
    logger.info(`🌐 Image download completed in ${duration}ms (${(response.data.length / 1024).toFixed(2)} KB)`);

    return {
      data: response.data,
      contentType: response.headers["content-type"] || "image/jpeg",
      cacheControl: "public, max-age=86400",
    };
  }

  /**
   * Check if URL needs proxying (Bershka and Stradivarius images need proxy due to CSP)
   * @param {string} url - Image URL to check
   * @returns {boolean} True if URL should use proxy
   */
  shouldUseProxy(url) {
    return (
      url &&
      (url.includes("static.bershka.net") ||
        url.includes("static.e-stradivarius.net") ||
        url.includes("static.pullandbear.net") ||
        url.includes("static.massimodutti.net") ||
        url.includes("static.oysho.net"))
    );
  }
}

module.exports = new ImageProxyService();