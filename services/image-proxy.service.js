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
        !url.startsWith("https://static.e-stradivarius.net/"))
    ) {
      throw new Error(
        "Invalid URL - Only Zara, Bershka and Stradivarius images are supported"
      );
    }

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };

    if (url.startsWith("https://static.zara.net/")) {
      headers.Referer = "https://www.zara.com/";
    } else if (url.startsWith("https://static.bershka.net/")) {
      headers.Referer = "https://www.bershka.com/";
    } else if (url.startsWith("https://static.e-stradivarius.net/")) {
      headers.Referer = "https://www.stradivarius.com/";
    }

    const response = await axios.get(url, {
      responseType: "stream",
      headers: headers,
      timeout: 10000,
    });

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
        url.includes("static.e-stradivarius.net"))
    );
  }
}

module.exports = new ImageProxyService();