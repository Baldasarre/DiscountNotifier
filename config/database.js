const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./kunto.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error("SQLite veritabanına bağlanırken hata oluştu:", err.message);
    } else {
        console.log('SQLite veritabanına başarıyla bağlanıldı.');
    }
});

// Database ayarları - lock timeout ve busy handler
db.configure("busyTimeout", 30000); // 30 saniye timeout
db.run("PRAGMA journal_mode = WAL;"); // Write-Ahead Logging aktifleştir
db.run("PRAGMA synchronous = NORMAL;"); // Sync modunu normal yap


db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
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
    )`, (err) => {
        if (err) {
            console.error("Users tablosu oluşturulurken hata:", err.message);
        } else {
            console.log("Users tablosu başarıyla doğrulandı/oluşturuldu.");
        }
    });
});

module.exports = db;
