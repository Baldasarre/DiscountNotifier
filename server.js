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
const schedulerService = require("./services/scheduler.service");
const helmet = require("helmet");
const config = require("./config/environment");
const { setSessionCookie } = require("./utils/helpers");
const imageProxyService = require("./services/image-proxy.service");
const app = express();
const PORT = 3000;

app.use(helmet());
app.use(cookieParser());
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 saat
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

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
  windowMs: 15 * 60 * 1000,
  max: 150,
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
        console.error("Session destroy error:", err);
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

  console.log("🚪 User logged out - all sessions cleared");
  res.json({ success: true, message: "Logout successful" });
});

app.get("/api/csrf-token", csrfProtectedRoutes, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.use("/api", apiLimiter, userRoutes);
app.use("/api/simple", simpleUnifiedRoutes);
console.log("✅ Simple unified routes loaded: /api/simple");

app.use("/api/products", productsRoutes);
console.log("✅ Products routes restored: /api/products");

app.use("/auth", authRoutes);

app.get("/api/image-proxy", async (req, res) => {
  try {
    const { url } = req.query;

    const result = await imageProxyService.proxyImage(url);

    res.set("Content-Type", result.contentType);
    res.set("Cache-Control", result.cacheControl);

    result.data.pipe(res);
  } catch (error) {
    console.error("Image proxy hatası:", error.message);
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

async function startServer() {
  try {
    await schedulerService.initialize();

    app.listen(PORT, () => {
      console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
      console.log(`📊 Products API: http://localhost:${PORT}/api/products`);
      console.log(
        `📈 Stats API: http://localhost:${PORT}/api/products/stats/summary`
      );
    });
  } catch (error) {
    console.error("❌ Sunucu başlatılırken hata:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  console.log("\n🛑 Sunucu kapatılıyor...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Sunucu kapatılıyor...");
  process.exit(0);
});

startServer();
