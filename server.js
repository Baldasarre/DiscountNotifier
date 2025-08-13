require("dotenv").config();
require('./config/database');
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require('express-rate-limit'); 
const csrf = require('csurf');
const userRoutes = require('./routes/user.routes'); 
const helmet = require('helmet');
const app = express();
const PORT = 3000;


app.use(helmet()); 
app.use(cookieParser());
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Clean URL Routes - HTML dosyalarını temiz URL'lerle serve et
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/category', (req, res) => {
  res.sendFile(__dirname + '/public/gender-selection.html');
});

app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/user-dashboard.html');
});

const csrfProtection = csrf({ cookie: true });
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 150,
    message: 'Çok fazla istek gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin.',
    standardHeaders: true, 
    legacyHeaders: false, 
});


// Logout endpoint - CSRF koruması olmadan
app.post('/api/logout', (req, res) => {
  console.log("Logout endpoint called (no CSRF)");
  
  // Clear server-side session cookie
  res.clearCookie("sessionId", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/"
  });
  
  // Clear any other potential cookies
  res.clearCookie("connect.sid");
  res.clearCookie("_csrf");
  
  console.log("Server-side cookies cleared");
  res.json({ success: true, message: "Logout successful" });
});

// Diğer API endpoint'leri CSRF koruması ile
app.use('/api', apiLimiter, csrfProtection, userRoutes);


app.listen(PORT, () => {
  console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
});
