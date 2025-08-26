const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database(
  "./kunto.db",
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error(
        "SQLite veritabanına bağlanırken hata oluştu:",
        err.message
      );
    } else {
      console.log("SQLite veritabanına başarıyla bağlanıldı.");
    }
  }
);

db.configure("busyTimeout", 30000);
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA synchronous = NORMAL;");

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        verified INTEGER DEFAULT 0,
        gender TEXT,
        brands TEXT,
        code TEXT,
        codeSentAt TEXT,
        attempts INTEGER DEFAULT 0,
        lastLoginAt TEXT,
        createdAt TEXT,
        ip TEXT,
        userAgent TEXT,
        referer TEXT
    )`,
    (err) => {
      if (err) {
        console.error("Users tablosu oluşturulurken hata:", err.message);
      } else {
        console.log("Users tablosu başarıyla doğrulandı/oluşturuldu.");
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    (err) => {
      if (err) {
        console.error(
          "Zara products tablosu oluşturulurken hata:",
          err.message
        );
      } else {
        console.log("Zara products tablosu başarıyla doğrulandı/oluşturuldu.");
      }
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS zara_categories (
        id INTEGER PRIMARY KEY,
        category_id TEXT UNIQUE NOT NULL,
        category_name TEXT NOT NULL,
        category_url TEXT NOT NULL,
        gender TEXT NOT NULL,
        redirect_category_id TEXT,
        seo_keyword TEXT,
        is_active INTEGER DEFAULT 1,
        last_updated TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    (err) => {
      if (err) {
        console.error(
          "Zara categories tablosu oluşturulurken hata:",
          err.message
        );
      } else {
        console.log(
          "Zara categories tablosu başarıyla doğrulandı/oluşturuldu."
        );
      }
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS user_tracked_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        brand TEXT NOT NULL,
        tracking_started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        notification_sent INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id, product_id, brand)
    )`,
    (err) => {
      if (err) {
        console.error(
          "User tracked products tablosu oluşturulurken hata:",
          err.message
        );
      } else {
        console.log(
          "User tracked products tablosu başarıyla doğrulandı/oluşturuldu."
        );
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
        console.error(
          "Cache metadata tablosu oluşturulurken hata:",
          err.message
        );
      } else {
        console.log("Cache metadata tablosu başarıyla doğrulandı/oluşturuldu.");
      }
    }
  );
});

module.exports = db;
