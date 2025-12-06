const sqlite3 = require("sqlite3").verbose();
const { createServiceLogger } = require("../utils/logger");

const logger = createServiceLogger("config");

class DatabaseManager {
  constructor() {
    this.db = null;
    this.initDatabase();
  }

  initDatabase() {
    this.db = new sqlite3.Database(
      "./kunto.db",
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
      (err) => {
        if (err) {
          logger.error("SQLite veritabanına bağlanırken hata oluştu:", err.message);
          if (err.message.includes("locked") || err.code === "SQLITE_BUSY") {
            logger.error("⚠️  VERITABANI KİTLİ! DB Browser for SQLite veya başka bir uygulama açık olabilir.");
            logger.error("   Çözüm: DB Browser'da 'Write Changes' veya 'Revert Changes' yapın ve kapatın.");
          }
          process.exit(1);
        } else {
          logger.info("SQLite veritabanına başarıyla bağlanıldı.");
        }
      }
    );

    // Performance optimizations
    this.db.configure("busyTimeout", 5000); // 5 saniye timeout (daha hızlı hata tespiti)

    // Test DB lock status
    this.db.run("PRAGMA query_only = OFF;", (err) => {
      if (err) {
        logger.error("⚠️  VERITABANI KİTLİ! DB Browser for SQLite veya başka bir uygulama açık olabilir.");
        logger.error("   Çözüm: DB Browser'da 'Write Changes' veya 'Revert Changes' yapın ve kapatın.");
        logger.error("   Hata detayı:", err.message);
        process.exit(1);
      }
    });

    this.db.run("PRAGMA journal_mode = WAL;"); // Write-Ahead Logging
    this.db.run("PRAGMA synchronous = NORMAL;");
    this.db.run("PRAGMA cache_size = -64000;"); // 64MB cache
    this.db.run("PRAGMA temp_store = MEMORY;");
    this.db.run("PRAGMA mmap_size = 30000000000;"); // 30GB mmap
  }

  // Transaction wrapper
  async runInTransaction(callback) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run("BEGIN TRANSACTION", (err) => {
          if (err) {
            logger.error("Transaction begin failed", { error: err.message });
            return reject(err);
          }

          callback()
            .then((result) => {
              this.db.run("COMMIT", (commitErr) => {
                if (commitErr) {
                  logger.error("Transaction commit failed", { error: commitErr.message });
                  this.db.run("ROLLBACK");
                  return reject(commitErr);
                }
                resolve(result);
              });
            })
            .catch((callbackErr) => {
              logger.error("Transaction callback failed", { error: callbackErr.message });
              this.db.run("ROLLBACK");
              reject(callbackErr);
            });
        });
      });
    });
  }

  // Graceful shutdown
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          logger.error("Database close failed", { error: err.message });
          reject(err);
        } else {
          logger.info("Database connection closed");
          resolve();
        }
      });
    });
  }

  // Get raw db instance for backward compatibility
  getDb() {
    return this.db;
  }
}

const dbManager = new DatabaseManager();
const db = dbManager.db;

// Graceful shutdown listeners
process.on("SIGINT", async () => {
  await dbManager.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await dbManager.close();
  process.exit(0);
});

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        verified INTEGER DEFAULT 0,
        category TEXT,
        brands TEXT,
        code TEXT,
        codeSentAt TEXT,
        attempts INTEGER DEFAULT 0,
        lastLoginAt TEXT,
        createdAt TEXT,
        ip TEXT,
        userAgent TEXT,
        referer TEXT,
        googleId TEXT,
        provider TEXT,
        displayName TEXT,
        avatar TEXT
    )`,
    (err) => {
      if (err) {
        logger.error("Users tablosu oluşturulurken hata:", err.message);
      } else {
        logger.info("Users tablosu başarıyla doğrulandı/oluşturuldu.");
      }
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS zara_products (
        id INTEGER PRIMARY KEY,
        product_id TEXT UNIQUE NOT NULL,
        reference TEXT NOT NULL,
        display_reference TEXT,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        section TEXT,
        section_name TEXT,
        category_id TEXT,
        category_name TEXT,
        brand_code TEXT DEFAULT 'zara',
        seo_keyword TEXT,
        seo_product_id TEXT,
        main_color_hex TEXT,
        num_additional_colors INTEGER DEFAULT 0,
        availability TEXT,
        image_url TEXT,
        product_url TEXT,
        grid_position INTEGER,
        family_name TEXT,
        subfamily_name TEXT,
        is_on_sale INTEGER DEFAULT 0,
        sale_price INTEGER,
        last_updated TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        color_name TEXT,
        color_id TEXT
    )`,
    (err) => {
      if (err) {
        logger.error("Zara products tablosu oluşturulurken hata:", err.message);
      } else {
        logger.info("Zara products tablosu başarıyla doğrulandı/oluşturuldu.");
      }
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS zara_categories (
        id INTEGER PRIMARY KEY,
        category_id TEXT UNIQUE NOT NULL,
        category_name TEXT NOT NULL,
        category_url TEXT NOT NULL,
        category TEXT NOT NULL,
        redirect_category_id TEXT,
        seo_keyword TEXT,
        is_active INTEGER DEFAULT 1,
        last_updated TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    (err) => {
      if (err) {
        logger.error("Zara categories tablosu oluşturulurken hata:", err.message);
      } else {
        logger.info("Zara categories tablosu başarıyla doğrulandı/oluşturuldu.");
      }
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS stradivarius_categories (
        id INTEGER PRIMARY KEY,
        category_id TEXT UNIQUE NOT NULL,
        category_name TEXT NOT NULL,
        category_name_en TEXT,
        key_field TEXT,
        path TEXT,
        is_active INTEGER DEFAULT 1,
        last_updated TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    (err) => {
      if (err) {
        logger.error("Stradivarius categories tablosu oluşturulurken hata:", err.message);
      } else {
        logger.info("Stradivarius categories tablosu başarıyla doğrulandı/oluşturuldu.");
      }
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS stradivarius_unique_product_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unique_id TEXT UNIQUE NOT NULL,
        product_id TEXT NOT NULL,
        name TEXT NOT NULL,
        brand TEXT DEFAULT 'stradivarius',
        price INTEGER NOT NULL,
        sale_price INTEGER,
        currency TEXT DEFAULT 'TL',
        availability TEXT,
        sizes TEXT,
        colors TEXT,
        color_name TEXT,
        color_code TEXT,
        image_url TEXT,
        product_url TEXT,
        category_id TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    (err) => {
      if (err) {
        logger.error("Stradivarius unique product details tablosu oluşturulurken hata:", err.message);
      } else {
        logger.info("Stradivarius unique product details tablosu başarıyla doğrulandı/oluşturuldu.");
      }
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS bershka_categories (
        id INTEGER PRIMARY KEY,
        category_id TEXT UNIQUE NOT NULL,
        category_name TEXT NOT NULL,
        category_name_en TEXT,
        key_field TEXT,
        path TEXT,
        is_active INTEGER DEFAULT 1,
        last_updated TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    (err) => {
      if (err) {
        logger.error("Bershka categories tablosu oluşturulurken hata:", err.message);
      } else {
        logger.info("Bershka categories tablosu başarıyla doğrulandı/oluşturuldu.");
      }
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS cache_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_key TEXT UNIQUE NOT NULL,
        last_updated TEXT NOT NULL,
        next_update TEXT,
        status TEXT DEFAULT 'active'
    )`,
    (err) => {
      if (err) {
        logger.error("Cache metadata tablosu oluşturulurken hata:", err.message);
      } else {
        logger.info("Cache metadata tablosu başarıyla doğrulandı/oluşturuldu.");
      }
    }
  );
});

// Export both db instance and dbManager for backward compatibility
module.exports = db;
module.exports.dbManager = dbManager;