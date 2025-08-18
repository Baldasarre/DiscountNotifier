const db = require('../config/database'); 
const { setSessionCookie } = require('../utils/helpers');

function authenticate(req, res, next) {
    const sessionId = req.cookies.sessionId;
    if (!sessionId) {
        return res.status(401).json({ error: "Yetkisiz erişim. Lütfen giriş yapın." });
    }

    const sql = `SELECT * FROM users WHERE id = ?`;

    db.get(sql, [sessionId], (err, user) => {
        if (err) {
            console.error("Middleware veritabanı hatası:", err.message);
            return res.status(500).json({ error: "Sunucu tarafında bir hata oluştu." });
        }

          if (!user || !user.verified) {
            res.clearCookie("sessionId", { path: '/' });
            return res.status(401).json({ error: "Geçersiz oturum." });
        }
        
        // Her istekte cookie'yi yenile (1 hafta süre ile)
        setSessionCookie(res, user.id);
        
        req.user = user; 
        next();
    });
}

module.exports = authenticate;