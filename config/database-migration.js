const db = require('./database');

function addGoogleAuthColumns() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {

      db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
          console.error('Table info error:', err);
          return reject(err);
        }

        const columnNames = columns.map(col => col.name);
        const migrations = [];


        if (!columnNames.includes('googleId')) {
          migrations.push("ALTER TABLE users ADD COLUMN googleId TEXT");
        }
        
        if (!columnNames.includes('provider')) {
          migrations.push("ALTER TABLE users ADD COLUMN provider TEXT DEFAULT 'email'");
        }
        
        if (!columnNames.includes('displayName')) {
          migrations.push("ALTER TABLE users ADD COLUMN displayName TEXT");
        }
        
        if (!columnNames.includes('avatar')) {
          migrations.push("ALTER TABLE users ADD COLUMN avatar TEXT");
        }

        if (migrations.length === 0) {
          console.log('✅ Tüm Google Auth kolonları zaten mevcut');
          return resolve();
        }

        console.log('🔄 Google Auth kolonları ekleniyor...');
        

        let completed = 0;
        migrations.forEach((migration, index) => {
          db.run(migration, (err) => {
            if (err) {
              console.error(`Migration ${index + 1} failed:`, err);
              return reject(err);
            }
            
            completed++;
            console.log(`✅ Migration ${index + 1}/${migrations.length} tamamlandı`);
            
            if (completed === migrations.length) {
              console.log('🎉 Tüm Google Auth migration\'ları başarıyla tamamlandı!');
              resolve();
            }
          });
        });
      });
    });
  });
}


if (require.main === module) {
  addGoogleAuthColumns()
    .then(() => {
      console.log('Database migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addGoogleAuthColumns };
