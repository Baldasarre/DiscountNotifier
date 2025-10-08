require("dotenv").config();
require("./config/database");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const rateLimit = require("express-rate-limit");
const csrf = require("csurf");
const passport = require("./config/passport");
const userRoutes = require("./routes/user.routes");
const authRoutes = require("./routes/auth.routes");
const simpleUnifiedRoutes = require("./routes/simple-unified.routes");
const productsRoutes = require("./routes/products.routes");
const adminRoutes = require("./routes/admin.routes");
const schedulerService = require("./services/scheduler.service");
const helmet = require("helmet");
const compression = require("compression");
const config = require("./config/environment");
const constants = require("./config/constants");
const { setSessionCookie } = require("./utils/helpers");
const imageProxyService = require("./services/image-proxy.service");
const { createServiceLogger } = require("./utils/logger");
const { notFoundHandler, errorHandler } = require('./middleware/error-handler.middleware');
const cache = require('./utils/cache');
const trackRequest = require('./middleware/monitoring.middleware');

const logger = createServiceLogger("server");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression({
  level: constants.COMPRESSION.LEVEL,
  threshold: constants.COMPRESSION.THRESHOLD,
  filter: (req, res) => {
    const contentType = res.getHeader('Content-Type');
    if (contentType && contentType.includes('text/event-stream')) {
      return false;
    }

    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", "https:", "data:", "https://fonts.gstatic.com"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "https:", "'unsafe-inline'", "https://fonts.googleapis.com"],
        upgradeInsecureRequests: [],
      },
    },
  })
);
app.use(cookieParser());
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use(trackRequest);

app.use(
  session({
    secret: constants.SESSION.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: constants.SESSION.MAX_AGE,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.get("/test-compression", (req, res) => {
  const largeData = { data: "x".repeat(10000), message: "This should be compressed" };
  res.json(largeData);
});

app.get("/cache/stats", (req, res, next) => {

  try {
    const stats = cache.getStats();
    const hitRate = cache.getHitRate();

    res.json({
      success: true,
      stats,
      hitRate
    });
  } catch (error) {
    logger.error("Cache stats error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/cache/invalidate", (req, res, next) => {
  try {
    const { type } = req.body;

    switch (type) {
      case 'products':
        cache.invalidateProductCache();
        break;
      case 'images':
        cache.invalidateImageCache();
        break;
      case 'stats':
        cache.invalidateStatsCache();
        break;
      case 'all':
      default:
        cache.invalidateAllCache();
    }

    res.json({
      success: true,
      message: `Cache invalidated: ${type || 'all'}`
    });
  } catch (error) {
    logger.error("Cache invalidation error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.get("/login", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.get("/category", (req, res) => {
  res.sendFile(__dirname + "/public/gender-selection.html");
});

app.get("/dashboard", (req, res) => {
  res.sendFile(__dirname + "/public/user-dashboard.html");
});

const csrfProtection = csrf({ cookie: true });
const apiLimiter = rateLimit({
  windowMs: constants.RATE_LIMIT.WINDOW_MS,
  max: constants.RATE_LIMIT.MAX_REQUESTS,
  message:
    "Çok fazla istek gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin.",
  standardHeaders: true,
  legacyHeaders: false,
});

const csrfProtectedRoutes = express.Router();
csrfProtectedRoutes.use(csrfProtection);


app.post("/api/logout", (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        logger.error("Session destroy error:", err);
      }
    });
  }

  res.clearCookie("sessionId", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
  });

  res.clearCookie("connect.sid", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
  });

  res.clearCookie("_csrf");

  logger.info("User logged out - all sessions cleared");
  res.json({ success: true, message: "Logout successful" });
});

app.get("/api/csrf-token", csrfProtectedRoutes, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.use("/api", apiLimiter, userRoutes);
app.use("/api/simple", simpleUnifiedRoutes);
logger.info("Simple unified routes loaded: /api/simple");

app.use("/api/products", productsRoutes);
logger.info("Products routes restored: /api/products");

app.use("/auth", authRoutes);

app.use("/admin", adminRoutes);
logger.info("Admin routes loaded: /admin");

app.get("/api/image-proxy", async (req, res) => {
  const startTime = Date.now();
  try {
    const { url } = req.query;

    // Check cache first
    const cachedImage = cache.getCachedImage(url);
    if (cachedImage) {
      const duration = Date.now() - startTime;
      res.set("Content-Type", cachedImage.contentType);
      res.set("Cache-Control", "public, max-age=86400");
      res.set("X-Cache", "HIT");
      res.set("X-Response-Time", `${duration}ms`);
      logger.info(`⚡ Image proxy [CACHE HIT] - ${duration}ms`);
      return res.send(cachedImage.buffer);
    }

    const result = await imageProxyService.proxyImage(url);

    const buffer = Buffer.from(result.data);

    cache.setCachedImage(url, {
      buffer,
      contentType: result.contentType
    });

    const duration = Date.now() - startTime;
    res.set("Content-Type", result.contentType);
    res.set("Cache-Control", result.cacheControl);
    res.set("X-Cache", "MISS");
    res.set("X-Response-Time", `${duration}ms`);
    logger.info(`📥 Image proxy [CACHE MISS] - ${duration}ms (${(buffer.length / 1024).toFixed(2)} KB)`);

    res.send(buffer);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`❌ Image proxy error - ${duration}ms:`, error.message);
    res.status(404).send("Resim bulunamadı");
  }
});

app.get("/api/scheduler/status", (req, res) => {
  try {
    const status = schedulerService.getDataFetchStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/api/scheduler/toggle", (req, res) => {
  try {
    const newStatus = schedulerService.toggleDataFetch();
    res.json({
      success: true,
      message: `Veri çekme anahtarı ${newStatus ? "AÇIK" : "KAPALI"} yapıldı`,
      data: {
        enabled: newStatus,
        status: newStatus ? "AÇIK" : "KAPALI",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/api/scheduler/enable", (req, res) => {
  try {
    schedulerService.enableDataFetch();
    res.json({
      success: true,
      message: "Veri çekme anahtarı AÇIK yapıldı",
      data: {
        enabled: true,
        status: "AÇIK",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/api/scheduler/disable", (req, res) => {
  try {
    schedulerService.disableDataFetch();
    res.json({
      success: true,
      message: "Veri çekme anahtarı KAPALI yapıldı",
      data: {
        enabled: false,
        status: "KAPALI",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  try {
    await schedulerService.initialize();

    app.listen(PORT, () => {
      logger.info(`Sunucu çalışıyor: http://localhost:${PORT}`);
      logger.info(`Products API: http://localhost:${PORT}/api/products`);
      logger.info(`Stats API: http://localhost:${PORT}/api/products/stats/summary`);
    });
  } catch (error) {
    logger.error("Sunucu başlatılırken hata:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  logger.info("\nSunucu kapatılıyor...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("\nSunucu kapatılıyor...");
  process.exit(0);
});

startServer();