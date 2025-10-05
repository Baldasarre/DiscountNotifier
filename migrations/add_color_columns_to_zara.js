const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "..", "kunto.db");
const db = new sqlite3.Database(dbPath);

console.log("🔧 Starting Zara products table migration...");

db.serialize(() => {
  // Check if columns exist
  db.all("PRAGMA table_info(zara_products)", (err, columns) => {
    if (err) {
      console.error("❌ Error checking table structure:", err);
      db.close();
      return;
    }

    const hasColorId = columns.some((col) => col.name === "color_id");
    const hasColorName = columns.some((col) => col.name === "color_name");

    console.log("📋 Current columns:", columns.map((c) => c.name).join(", "));

    if (!hasColorId) {
      console.log("➕ Adding color_id column...");
      db.run("ALTER TABLE zara_products ADD COLUMN color_id TEXT", (err) => {
        if (err) {
          console.error("❌ Error adding color_id:", err);
        } else {
          console.log("✅ color_id column added");
        }
      });
    } else {
      console.log("✓ color_id column already exists");
    }

    if (!hasColorName) {
      console.log("➕ Adding color_name column...");
      db.run("ALTER TABLE zara_products ADD COLUMN color_name TEXT", (err) => {
        if (err) {
          console.error("❌ Error adding color_name:", err);
        } else {
          console.log("✅ color_name column added");
        }
      });
    } else {
      console.log("✓ color_name column already exists");
    }

    // Check row count
    db.get("SELECT COUNT(*) as count FROM zara_products", (err, row) => {
      if (err) {
        console.error("❌ Error counting rows:", err);
      } else {
        console.log(`\n📊 Total Zara products in database: ${row.count}`);
      }

      // Show sample data
      db.all("SELECT * FROM zara_products LIMIT 3", (err, rows) => {
        if (err) {
          console.error("❌ Error fetching sample data:", err);
        } else if (rows.length > 0) {
          console.log("\n📦 Sample products:");
          rows.forEach((row, i) => {
            console.log(`\n  ${i + 1}. ${row.name}`);
            console.log(`     Product ID: ${row.product_id}`);
            console.log(`     Reference: ${row.reference}`);
            console.log(`     Display Ref: ${row.display_reference}`);
            console.log(`     Color ID: ${row.color_id || "NULL"}`);
            console.log(`     Color Name: ${row.color_name || "NULL"}`);
          });
        } else {
          console.log("\n⚠️  No products found in zara_products table");
        }

        console.log("\n✅ Migration completed!");
        db.close();
      });
    });
  });
});
