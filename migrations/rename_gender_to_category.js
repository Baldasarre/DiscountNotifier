const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "..", "kunto.db");
const db = new sqlite3.Database(dbPath);

console.log("🔧 Starting migration: Renaming 'gender' to 'category' columns...");

db.serialize(() => {
  db.run("BEGIN TRANSACTION");

  const tablesToMigrate = [
    { name: "users", oldCol: "gender", newCol: "category" },
    { name: "zara_categories", oldCol: "gender", newCol: "category" },
    { name: "oysho_categories", oldCol: "gender", newCol: "category" },
    { name: "stradivarius_categories", oldCol: "gender", newCol: "category" }
  ];

  let completedMigrations = 0;
  const totalMigrations = tablesToMigrate.length;

  tablesToMigrate.forEach(table => {
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table.name}'`, (err, row) => {
      if (err) {
        console.error(`❌ Error checking for table ${table.name}:`, err);
        db.run("ROLLBACK");
        db.close();
        return;
      }
      if (!row) {
        console.log(`⚠️ Table '${table.name}' does not exist, skipping migration.`);
        completedMigrations++;
        if (completedMigrations === totalMigrations) {
          commitTransaction();
        }
        return;
      }

      db.all(`PRAGMA table_info(${table.name})`, (err, columns) => {
        if (err) {
          console.error(`❌ Error checking table info for ${table.name}:`, err);
          db.run("ROLLBACK");
          db.close();
          return;
        }

        const hasOldCol = columns.some(col => col.name === table.oldCol);
        const hasNewCol = columns.some(col => col.name === table.newCol);

        if (hasOldCol && !hasNewCol) {
          console.log(`➕ Renaming column '${table.oldCol}' to '${table.newCol}' in table '${table.name}'...`);
          db.run(`ALTER TABLE ${table.name} RENAME COLUMN ${table.oldCol} TO ${table.newCol}`, (err) => {
            if (err) {
              console.error(`❌ Error renaming column in ${table.name}:`, err);
              db.run("ROLLBACK");
              db.close();
            } else {
              console.log(`✅ Column '${table.oldCol}' renamed to '${table.newCol}' in '${table.name}'`);
              completedMigrations++;
              if (completedMigrations === totalMigrations) {
                commitTransaction();
              }
            }
          });
        } else {
          if (hasNewCol) {
            console.log(`✓ Column '${table.newCol}' already exists in '${table.name}', skipping rename.`);
          } else {
            console.log(`⚠️ Column '${table.oldCol}' not found in '${table.name}', skipping rename.`);
          }
          completedMigrations++;
          if (completedMigrations === totalMigrations) {
            commitTransaction();
          }
        }
      });
    });
  });

  function commitTransaction() {
    db.run("COMMIT", (err) => {
      if (err) {
        console.error("❌ Transaction commit failed:", err);
      } else {
        console.log("✅ Migration transaction committed successfully!");
      }
      db.close();
    });
  }
});
