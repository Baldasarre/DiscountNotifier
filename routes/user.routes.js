const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../config/database");
const authenticate = require("../middleware/authenticate");
const {
  sendEmail,
  generateCode,
  setSessionCookie,
} = require("../utils/helpers");
const router = express.Router();

router.post("/save", (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "E-posta eksik." });

  const selectSql = `SELECT * FROM users WHERE email = ?`;

  db.get(selectSql, [email], (err, user) => {
    if (err) return res.status(500).json({ error: "Veritabanı hatası." });

    const code = generateCode();
    const now = new Date().toISOString();
    let message = "";

    if (!user) {
      const insertSql = `INSERT INTO users (id, email, createdAt, ip, userAgent, referer, verified, code, codeSentAt, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        uuidv4(),
        email,
        now,
        req.ip,
        req.headers["user-agent"] || null,
        req.headers["referer"] || null,
        0,
        code,
        now,
        0,
      ];
      db.run(insertSql, params, (err) => {
        if (err)
          return res.status(500).json({ error: "Kullanıcı oluşturulamadı." });
        message = "Doğrulama için kod gönderildi.";
        sendEmail(email, code, "verify");
        res.json({ success: true, message });
      });
    } else {
      const updateSql = `UPDATE users SET code = ?, codeSentAt = ?, attempts = 0 WHERE email = ?`;

      db.serialize(() => {
        db.run(updateSql, [code, now, email], function (err) {
          if (err) {
            console.log("Database update error:", err.message);
            return res
              .status(500)
              .json({ error: `Kullanıcı güncellenemedi: ${err.message}` });
          }

          if (this.changes === 0) {
            if (process.env.NODE_ENV === "development") {
              console.error("No rows updated - user might not exist");
            }
            return res.status(404).json({ error: "Kullanıcı bulunamadı" });
          }

          message = user.verified
            ? "Giriş için kod gönderildi."
            : "Doğrulama için kod gönderildi.";
          if (process.env.NODE_ENV === "development") {
            console.log("Sending email to:", email, "Code:", code);
          }
          sendEmail(email, code, user.verified ? "login" : "verify");
          res.json({ success: true, message });
        });
      });
    }
  });
});

router.post("/verify-code", (req, res) => {
  const { email, code } = req.body;
  if (!email || !code)
    return res.status(400).json({ error: "E-posta ve kod gerekli." });

  const selectSql = `SELECT * FROM users WHERE email = ?`;

  db.get(selectSql, [email], (err, user) => {
    if (err) return res.status(500).json({ error: "Veritabanı hatası." });
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

    const CODE_VALIDITY_SECONDS = 300;
    const timeElapsed =
      (Date.now() - new Date(user.codeSentAt).getTime()) / 1000;

    if (timeElapsed > CODE_VALIDITY_SECONDS)
      return res.status(400).json({ error: "Kodun süresi doldu." });
    if (user.attempts >= 5)
      return res.status(403).json({ error: "Çok fazla hatalı deneme." });

    if (user.code !== code) {
      const updateSql = `UPDATE users SET attempts = attempts + 1 WHERE email = ?`;
      db.run(updateSql, [email]);
      return res
        .status(400)
        .json({ error: `Kod hatalı. Kalan deneme: ${4 - user.attempts}` });
    }

    const updateSql = `UPDATE users SET verified = 1, lastLoginAt = ?, code = NULL, codeSentAt = NULL, attempts = 0 WHERE email = ?`;
    db.run(updateSql, [new Date().toISOString(), email], function (err) {
      if (err)
        return res.status(500).json({ error: "Doğrulama sırasında hata." });

      setSessionCookie(res, user.id);
      res.json({ success: true, message: "Kod doğru. Giriş başarılı." });
    });
  });
});

router.post("/update-user", authenticate, (req, res) => {
  const { email } = req.user;
  const { gender, brands } = req.body;
  if (!gender) return res.status(400).json({ error: "Eksik bilgi var." });

  const brandsJson = JSON.stringify(brands || []);
  const updateSql = `UPDATE users SET gender = ?, brands = ? WHERE email = ?`;

  db.run(updateSql, [gender, brandsJson, email], (err) => {
    if (err) return res.status(500).json({ error: "Veri güncellenemedi." });
    res.json({ success: true, message: "Bilgiler başarıyla güncellendi." });
  });
});

router.get("/user-info", authenticate, (req, res) => {
  const { user } = req;
  const brands = user.brands ? JSON.parse(user.brands) : [];
  res.json({ success: true, gender: user.gender, brands });
});

router.get("/check-session", (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (!sessionId) return res.json({ loggedIn: false });

  const sql = `SELECT * FROM users WHERE id = ? AND verified = 1`;
  db.get(sql, [sessionId], (err, user) => {
    if (err || !user) {
      res.clearCookie("sessionId");
      return res.json({ loggedIn: false });
    }

    setSessionCookie(res, user.id);

    return res.json({ loggedIn: true, email: user.email });
  });
});

module.exports = router;
