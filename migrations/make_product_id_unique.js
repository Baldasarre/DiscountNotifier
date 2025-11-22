const sqlite3 = require('sqlite3').verbose();

console.log("🔧 product_id kolonunu UNIQUE yapma migration'ı\n");

const db = new sqlite3.Database('./kunto.db', (err) => {
  if (err) {
    console.error("❌ Veritabanına bağlanılamadı:", err.message);
    process.exit(1);
  }
  console.log("✅ Veritabanına bağlanıldı\n");
});

// SQLite'da mevcut kolona UNIQUE constraint eklemek için tabloyu yeniden oluşturmak gerekiyor
db.serialize(() => {
  console.log("1️⃣ Mevcut duplicate product_id'leri kontrol ediliyor...\n");

  db.get(`
    SELECT product_id, COUNT(*) as count
    FROM zara_products
    GROUP BY product_id
    HAVING count > 1
    ORDER BY count DESC
    LIMIT 1
  `, (err, row) => {
    if (err) {
      console.error("❌ Hata:", err.message);
      process.exit(1);
    }

    if (row) {
      console.log(`⚠️  Duplicate kayıtlar bulundu! Örnek: product_id ${row.product_id} -> ${row.count} kez var\n`);
    }

    console.log("2️⃣ Duplicate kayıtlar temizleniyor (en son güncellenen tutulacak)...\n");

    // Delete duplicates, keep only the most recent one
    db.run(`
      DELETE FROM zara_products
      WHERE id NOT IN (
        SELECT MAX(id)
        FROM zara_products
        GROUP BY product_id
      )
    `, function(err) {
      if (err) {
        console.error("❌ Duplicate temizleme hatası:", err.message);
        process.exit(1);
      }

      console.log(`✅ ${this.changes} duplicate kayıt silindi\n`);

      console.log("3️⃣ Yeni tablo yapısı oluşturuluyor...\n");

      // Create new table with UNIQUE constraint on product_id
      db.run(`
        CREATE TABLE zara_products_new (
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
        )
      `, (err) => {
        if (err) {
          console.error("❌ Yeni tablo oluşturma hatası:", err.message);
          process.exit(1);
        }

        console.log("✅ Yeni tablo oluşturuldu\n");
        console.log("4️⃣ Veriler yeni tabloya kopyalanıyor...\n");

        // Copy data to new table
        db.run(`
          INSERT INTO zara_products_new
          SELECT * FROM zara_products
        `, function(err) {
          if (err) {
            console.error("❌ Veri kopyalama hatası:", err.message);
            console.error("   Hala duplicate kayıtlar olabilir!");
            process.exit(1);
          }

          console.log(`✅ ${this.changes} kayıt kopyalandı\n`);
          console.log("5️⃣ Eski tablo siliniyor ve yenisi adlandırılıyor...\n");

          // Drop old table and rename new one
          db.run("DROP TABLE zara_products", (err) => {
            if (err) {
              console.error("❌ Eski tablo silinirken hata:", err.message);
              process.exit(1);
            }

            db.run("ALTER TABLE zara_products_new RENAME TO zara_products", (err) => {
              if (err) {
                console.error("❌ Tablo yeniden adlandırma hatası:", err.message);
                process.exit(1);
              }

              console.log("✅ Tablo yeniden adlandırıldı\n");

              // Verify
              db.get("SELECT COUNT(*) as count FROM zara_products", (err, row) => {
                if (err) {
                  console.error("❌ Doğrulama hatası:", err.message);
                  process.exit(1);
                }

                console.log("=" .repeat(60));
                console.log("✅ Migration tamamlandı!");
                console.log("=" .repeat(60));
                console.log(`📊 Toplam ürün sayısı: ${row.count}`);
                console.log("🔒 product_id artık UNIQUE - duplicate kayıt olmayacak\n");

                db.close();
                process.exit(0);
              });
            });
          });
        });
      });
    });
  });
});
