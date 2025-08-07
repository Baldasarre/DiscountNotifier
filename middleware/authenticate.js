const fs = require('fs');

function authenticate(req, res, next) {
    const sessionId = req.cookies.sessionId;
    if (!sessionId) {
        return res.status(401).json({ error: "Yetkisiz erişim. Lütfen giriş yapın." });
    }

    try {
        const users = JSON.parse(fs.readFileSync("users.json", "utf8"));
        const user = users.find(u => u.id === sessionId && u.verified);

        if (!user) {
            res.clearCookie("sessionId");
            return res.status(401).json({ error: "Geçersiz oturum." });
        }

        req.user = user; 
        next();

    } catch (error) {
        console.error("Middleware hatası:", error);
        return res.status(500).json({ error: "Sunucu tarafında bir hata oluştu." });
    }
}

module.exports = authenticate;