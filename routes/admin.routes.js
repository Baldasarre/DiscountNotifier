const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const isAdmin = require("../middleware/admin-auth.middleware");
const { createAdminSession } = require("../middleware/admin-auth.middleware");
const monitoringService = require("../services/monitoring.service");
const schedulerService = require("../services/scheduler.service");
const progressTracker = require("../services/progress-tracker.service");
const db = require("../config/database");
const cache = require("../utils/cache");
const { createServiceLogger } = require("../utils/logger");
const fs = require("fs").promises;
const path = require("path");

const logger = createServiceLogger("admin");

    
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const failedLoginAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000;

function isLockedOut(ip) {
  const attempts = failedLoginAttempts.get(ip);
  if (!attempts) return false;

  if (attempts.count >= MAX_FAILED_ATTEMPTS) {
    const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
    if (timeSinceLastAttempt < LOCKOUT_TIME) {
      return true;
    } else {
      failedLoginAttempts.delete(ip);
      return false;
    }
  }
  return false;
}

function recordFailedAttempt(ip) {
  const attempts = failedLoginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  failedLoginAttempts.set(ip, attempts);
}

function clearFailedAttempts(ip) {
  failedLoginAttempts.delete(ip);
}

router.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin-login.html"));
});


router.get("/", (req, res) => {
  res.redirect("/admin/login");
});


router.post("/login", loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;

  if (isLockedOut(clientIp)) {
    logger.warn(`Locked out IP attempted login: ${clientIp}`);
    return res.status(429).json({
      success: false,
      message: "Çok fazla başarısız giriş denemesi. 15 dakika sonra tekrar deneyin."
    });
  }

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Kullanıcı adı ve şifre gerekli" });
  }

  const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    logger.error("Admin credentials not configured in .env");
    return res.status(500).json({ success: false, message: "Sunucu yapılandırma hatası" });
  }

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;

    clearFailedAttempts(clientIp);

    createAdminSession(ADMIN_SESSION_SECRET, {
      ip: clientIp,
      userAgent: req.headers['user-agent']
    });

    res.cookie("adminSession", ADMIN_SESSION_SECRET, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
    });

    logger.info(`[ADMIN-LOGIN] Admin logged in successfully - Username: ${username}, IP: ${clientIp}`);
    return res.json({ success: true, message: "Giriş başarılı" });
  }

  recordFailedAttempt(clientIp);
  const attempts = failedLoginAttempts.get(clientIp);
  const remainingAttempts = MAX_FAILED_ATTEMPTS - attempts.count;

  logger.warn(`Failed admin login attempt from IP: ${clientIp}, username: ${username}, remaining attempts: ${remainingAttempts}`);

  res.status(401).json({
    success: false,
    message: remainingAttempts > 0
      ? `Kullanıcı adı veya şifre hatalı. Kalan deneme: ${remainingAttempts}`
      : "Çok fazla başarısız giriş denemesi. 15 dakika sonra tekrar deneyin."
  });
});


router.post("/logout", (req, res) => {
  const adminSession = req.cookies.adminSession;

  if (adminSession) {
    const { activeSessions } = require("../middleware/admin-auth.middleware");
    activeSessions.delete(adminSession);
  }

  res.clearCookie("adminSession");
  logger.info("Admin logged out");
  res.json({ success: true, message: "Çıkış yapıldı" });
});


router.get("/dashboard", isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin-dashboard.html"));
});


router.get("/api/dashboard-data", isAdmin, async (req, res) => {
  try {
    const data = await monitoringService.getDashboardData();
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error("Dashboard data error:", error);
    res.status(500).json({
      success: false,
      message: "Dashboard verileri alınamadı",
    });
  }
});


router.get("/api/system-metrics", isAdmin, (req, res) => {
  try {
    const metrics = monitoringService.getSystemMetrics();
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error("System metrics error:", error);
    res.status(500).json({
      success: false,
      message: "Sistem metrikleri alınamadı",
    });
  }
});


router.get("/api/db-stats", isAdmin, async (req, res) => {
  try {
    const stats = await monitoringService.getDatabaseStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("DB stats error:", error);
    res.status(500).json({
      success: false,
      message: "Veritabanı istatistikleri alınamadı",
    });
  }
});


router.get("/api/cache-stats", isAdmin, (req, res) => {
  try {
    const stats = monitoringService.getCacheStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("Cache stats error:", error);
    res.status(500).json({
      success: false,
      message: "Cache istatistikleri alınamadı",
    });
  }
});


router.get("/api/api-stats", isAdmin, (req, res) => {
  try {
    const stats = monitoringService.getApiStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("API stats error:", error);
    res.status(500).json({
      success: false,
      message: "API istatistikleri alınamadı",
    });
  }
});


router.get("/api/scheduler-status", isAdmin, (req, res) => {
  try {
    const status = schedulerService.getStatus();
    const dataFetchStatus = schedulerService.getDataFetchStatus();
    res.json({
      success: true,
      data: {
        ...status,
        dataFetchEnabled: dataFetchStatus.enabled,
      },
    });
  } catch (error) {
    logger.error("Scheduler status error:", error);
    res.status(500).json({
      success: false,
      message: "Scheduler durumu alınamadı",
    });
  }
});


router.post("/api/scheduler/toggle", isAdmin, (req, res) => {
  try {
    const newStatus = schedulerService.toggleDataFetch();
    logger.info(`Admin toggled scheduler: ${newStatus}`);
    res.json({
      success: true,
      message: `Veri çekme ${newStatus ? "başlatıldı" : "durduruldu"}`,
      enabled: newStatus,
    });
  } catch (error) {
    logger.error("Scheduler toggle error:", error);
    res.status(500).json({
      success: false,
      message: "Scheduler kontrolü başarısız",
    });
  }
});


router.post("/api/trigger-update/:brand", isAdmin, async (req, res) => {
  try {
    const { brand } = req.params;
    logger.info(`Admin triggered manual update for ${brand}`);

    const jobId = `${brand}-update-${Date.now()}`;

    schedulerService.triggerManualUpdate(brand, false, jobId)
      .then(() => {
        logger.info(`Update job ${jobId} completed`);
      })
      .catch(error => {
        logger.error(`Update job ${jobId} failed:`, error);
        progressTracker.failJob(jobId, error);
      });

    res.json({
      success: true,
      message: `${brand} güncellemesi başlatıldı`,
      jobId: jobId
    });

  } catch (error) {
    logger.error("Manual update error:", error);
    res.status(500).json({
      success: false,
      message: "Güncelleme başarısız",
    });
  }
});


router.get("/api/scraper-progress/:jobId", isAdmin, (req, res) => {
  const { jobId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  logger.info(`SSE connection established for job: ${jobId}`);

  const job = progressTracker.getJob(jobId);
  if (job) {
    logger.debug(`Sending initial state for ${jobId}:`, job);
    res.write(`data: ${JSON.stringify(job)}\n\n`);
  } else {
    logger.warn(`No job found for ${jobId}, sending empty state`);
    res.write(`data: ${JSON.stringify({jobId, status: 'pending'})}\n\n`);
  }

  if (res.flush) res.flush();

  const progressHandler = (progress) => {
    if (progress.jobId === jobId) {
      logger.debug(`Sending SSE progress for ${jobId}: ${progress.percentage}%`);
      res.write(`data: ${JSON.stringify(progress)}\n\n`);

      if (progress.status === 'completed' || progress.status === 'failed') {
        setTimeout(() => {
          res.end();
        }, 1000);
      }
    }
  };

  progressTracker.on('progress', progressHandler);

  req.on("close", () => {
    logger.info(`SSE connection closed for job: ${jobId}`);
    progressTracker.off('progress', progressHandler);
  });
});


router.post("/api/cache/clear", isAdmin, (req, res) => {
  try {
    const { type } = req.body;
    logger.info(`Admin clearing cache: ${type || "all"}`);

    switch (type) {
      case "products":
        cache.invalidateProductCache();
        break;
      case "images":
        cache.invalidateImageCache();
        break;
      case "stats":
        cache.invalidateStatsCache();
        break;
      case "all":
      default:
        cache.invalidateAllCache();
    }

    res.json({
      success: true,
      message: `Cache temizlendi: ${type || "tümü"}`,
    });
  } catch (error) {
    logger.error("Cache clear error:", error);
    res.status(500).json({
      success: false,
      message: "Cache temizleme başarısız",
    });
  }
});


router.post("/api/stats/reset", isAdmin, (req, res) => {
  try {
    logger.info("Admin reset monitoring statistics");
    monitoringService.resetStats();
    res.json({
      success: true,
      message: "İstatistikler sıfırlandı",
    });
  } catch (error) {
    logger.error("Stats reset error:", error);
    res.status(500).json({
      success: false,
      message: "İstatistik sıfırlama başarısız",
    });
  }
});


router.get("/api/logs", isAdmin, async (req, res) => {
  try {
    const { lines = 100, level = "all" } = req.query;
    const logsDir = path.join(__dirname, "../logs");

    const today = new Date().toISOString().split("T")[0];
    const logFiles = {
      app: `app-${today}.log`,
      error: `error-${today}.log`,
    };

    const logFile =
      level === "error" ? logFiles.error : logFiles.app;
    const logPath = path.join(logsDir, logFile);

    try {
      const content = await fs.readFile(logPath, "utf-8");
      const logLines = content.split("\n").filter((line) => line.trim());
      const recentLogs = logLines.slice(-parseInt(lines));

      res.json({
        success: true,
        data: {
          logs: recentLogs,
          file: logFile,
          totalLines: logLines.length,
        },
      });
    } catch (fileError) {
      res.json({
        success: true,
        data: {
          logs: [
            `${new Date().toISOString()} - INFO - Admin dashboard initialized`,
            `${new Date().toISOString()} - INFO - System monitoring active`
          ],
          file: logFile,
          totalLines: 2,
          message: "Log dosyası boş veya henüz oluşturulmamış",
        },
      });
    }
  } catch (error) {
    logger.error("Logs fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Loglar alınamadı",
    });
  }
});


router.get("/api/stream", isAdmin, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  logger.info("Admin connected to monitoring stream");

  const sendUpdate = async () => {
    try {
      const data = await monitoringService.getDashboardData();
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      logger.error("Stream update error:", error);
    }
  };

  sendUpdate();

  const interval = setInterval(sendUpdate, 5000);

  req.on("close", () => {
    clearInterval(interval);
    logger.info("Admin disconnected from monitoring stream");
  });
});


router.get("/api/users", isAdmin, (req, res) => {
  const sql = `
    SELECT
      id,
      email,
      createdAt,
      lastLoginAt,
      brands,
      gender
    FROM users
    WHERE verified = 1
    ORDER BY createdAt ASC
  `;

  db.all(sql, [], (err, users) => {
    if (err) {
      logger.error("[ADMIN] Get users error:", err.message || err);
      return res.status(500).json({
        success: false,
        message: "Kullanıcılar alınamadı: " + (err.message || err)
      });
    }

    const trackingSql = `
      SELECT user_id, COUNT(*) as trackCount
      FROM user_tracked_products_unified
      GROUP BY user_id
    `;

    db.all(trackingSql, [], (err, trackingData) => {
      if (err) {
        logger.error("[ADMIN] Get tracking data error:", err.message || err);
        return res.status(500).json({
          success: false,
          message: "Takip verileri alınamadı: " + (err.message || err)
        });
      }

      const trackingMap = {};
      trackingData.forEach(item => {
        trackingMap[item.user_id] = item.trackCount;
      });

      const usersWithTracking = users.map((user, index) => ({
        userNumber: index + 1,
        ...user,
        trackCount: trackingMap[user.id] || 0,
        brands: user.brands ? JSON.parse(user.brands) : []
      }));

      res.json({
        success: true,
        users: usersWithTracking
      });
    });
  });
});

module.exports = router;
