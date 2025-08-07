require("dotenv").config();

const express = require("express");
const fs = require("fs");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const nodemailer = require("nodemailer");
const cookieParser = require("cookie-parser");
const rateLimit = require('express-rate-limit'); 
const authenticate = require('./middleware/authenticate');

const app = express();
const PORT = 3000;

app.use(cookieParser());
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

//Rate limit
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10, 
    message: 'Çok fazla istek gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin.',
    standardHeaders: true, 
    legacyHeaders: false, 
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ... (sendEmail ve generateCode fonksiyonları burada değişmeden kalır) ...
function sendEmail(to, code, type = "verify") {
  const subject =
    type === "login" ? "Giriş Kodunuz" : "E-Posta Doğrulama Kodunuz";
  const text = `Merhaba!\n\n${
    type === "login" ? "Giriş" : "Doğrulama"
  } kodunuz: ${code}\n\nKod 5 dakika geçerlidir.`;

  const mailOptions = {
    from: "appsailonsales@gmail.com",
    to,
    subject,
    text,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("Mail gönderilemedi:", error);
    else console.log("Mail gönderildi:", info.response);
  });
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}


// ... ( /api/save ve /api/verify-code endpoint'leri burada değişmeden kalır) ...
app.post("/api/save", apiLimiter, (req, res) => { 
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "E-posta eksik." });
  let users = [];
  try {
    users = JSON.parse(fs.readFileSync("users.json", "utf8"));
  } catch {
    users = [];
  }
  const code = generateCode();
  const now = new Date().toISOString();
  const ip = req.ip;
  const userAgent = req.headers["user-agent"] || null;
  const referer = req.headers["referer"] || null;
  let message = "";
  const userIndex = users.findIndex((u) => u.email === email);
  if (userIndex === -1) {
    const newUser = {
      id: uuidv4(), email, createdAt: now, ip, userAgent, referer, verified: false, code, codeSentAt: now, attempts: 0,
    };
    users.push(newUser);
    message = "Doğrulama için kod gönderildi.";
    sendEmail(email, code, "verify");
  } else {
    const user = users[userIndex];
    user.code = code;
    user.codeSentAt = now;
    user.attempts = 0;
    if (user.verified) {
      message = "Giriş için kod gönderildi.";
      sendEmail(email, code, "login");
    } else {
      message = "Doğrulama için kod gönderildi.";
      sendEmail(email, code, "verify");
    }
  }
  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
  res.json({ success: true, message });
});
app.post("/api/verify-code", apiLimiter, (req, res) => { 
  const { email, code } = req.body;
  if (!email || !code)
    return res.status(400).json({ error: "E-posta ve kod gerekli." });
  let users = [];
  try {
    users = JSON.parse(fs.readFileSync("users.json", "utf8"));
  } catch {
    return res.status(500).json({ error: "Veri okunamadı." });
  }
  const user = users.find((u) => u.email === email);
  if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
  const CODE_VALIDITY_SECONDS = 300;
  const sentTime = new Date(user.codeSentAt).getTime();
  const now = Date.now();
  const timeElapsed = (now - sentTime) / 1000;
  if (timeElapsed > CODE_VALIDITY_SECONDS) {
    return res.status(400).json({ error: "Kodun süresi doldu." });
  }
  if (user.attempts >= 5) {
    return res.status(403).json({ error: "Çok fazla hatalı deneme. Lütfen tekrar kod alın." });
  }
  if (user.code !== code) {
    user.attempts += 1;
    fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
    return res.status(400).json({ error: "Kod hatalı. Kalan deneme hakkı: " + (5 - user.attempts), });
  }
  user.verified = true;
  user.lastLoginAt = new Date().toISOString();
  delete user.code;
  delete user.codeSentAt;
  user.attempts = 0;
  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
  res.cookie("sessionId", user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 14,
    sameSite: "Lax",
  });
  res.json({ success: true, message: "Kod doğru. Giriş başarılı." });
});


app.post("/api/update-user", authenticate, (req, res) => {
 
  const { email } = req.user;
  const { gender, brands } = req.body;

  if (!gender) {
    return res.status(400).json({ error: "Eksik bilgi var." });
  }

  let users = [];
  try {
    users = JSON.parse(fs.readFileSync("users.json", "utf8"));
  } catch {
    return res.status(500).json({ error: "Veri okunamadı." });
  }

  const user = users.find((u) => u.email === email);
  if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

  user.gender = gender;
  user.brands = brands || [];

  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
  res.json({ success: true, message: "Bilgiler başarıyla güncellendi." });
});

app.get("/api/user-info", authenticate, (req, res) => {
  const { email } = req.user;

  let users = [];
  try {
    users = JSON.parse(fs.readFileSync("users.json", "utf8"));
  } catch {
    return res.status(500).json({ error: "Veri okunamadı." });
  }

  const user = users.find((u) => u.email === email);
  if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

  const { gender = null, brands = [] } = user;
  res.json({ success: true, gender, brands });
});

app.get("/api/check-session", (req, res) => {
  const sessionId = req.cookies.sessionId;

  if (!sessionId) {
    return res.json({ loggedIn: false });
  }

  let users = [];
  try {
    users = JSON.parse(fs.readFileSync("users.json", "utf8"));
  } catch (error) {
    console.error("Kullanıcı verisi okunurken hata:", error);
    return res.status(500).json({ error: "Sunucu hatası." });
  }

  const user = users.find((u) => u.id === sessionId && u.verified);

  if (user) {
    return res.json({ loggedIn: true, email: user.email });
  } else {
    res.clearCookie("sessionId");
    return res.json({ loggedIn: false });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
});