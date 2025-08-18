require("dotenv").config();
require('./config/database');
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require('express-rate-limit'); 
const csrf = require('csurf');
const userRoutes = require('./routes/user.routes'); 
const productsRoutes = require('./routes/products.routes');
const schedulerService = require('./services/scheduler.service');
const helmet = require('helmet');
const config = require('./config/environment');
const { setSessionCookie } = require('./utils/helpers');
const app = express();
const PORT = 3000;


app.use(helmet()); 
app.use(cookieParser());
app.use(cors());
app.use(express.json());
app.use(express.static("public"));


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


app.post('/api/logout', (req, res) => {
  if (process.env.NODE_ENV === 'development') {
    console.log("Logout endpoint called (no CSRF)");
  }
  
  res.clearCookie("sessionId", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/"
  });
  
  res.clearCookie("connect.sid");
  res.clearCookie("_csrf");
  
  if (process.env.NODE_ENV === 'development') {
    console.log("Server-side cookies cleared");
  }
  res.json({ success: true, message: "Logout successful" });
});


app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});


app.use('/api', apiLimiter, csrfProtection, userRoutes);

app.use('/api/products', apiLimiter, productsRoutes);


app.get('/api/image-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url || !url.startsWith('https://static.zara.net/')) {
      return res.status(400).json({ error: 'Geçersiz URL' });
    }

    const axios = require('axios');
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.zara.com/'
      },
      timeout: 10000
    });

    res.set('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400'); // 24 saat cache
    
    response.data.pipe(res);
  } catch (error) {
    console.error('Image proxy hatası:', error.message);
    res.status(404).send('Resim bulunamadı');
  }
});


async function startServer() {
  try {
    // Development modunda scheduler'ı farklı başlat
    if (config.NODE_ENV === 'development') {
      console.log('🔧 Development modunda çalışıyor...');
      
      // Scheduler'ı başlat ama otomatik fetch yapma
      await schedulerService.initialize();
      
      // Development bilgileri
      console.log('📚 Development Endpoints:');
      console.log(`   - Manuel fetch: POST /api/products/refresh`);
      console.log(`   - Scheduler status: GET /api/products/scheduler/status`);
      console.log(`   - Stats: GET /api/products/stats/summary`);
      console.log(`   - Dev status: GET /api/products/dev/status`);
      
    } else {
      // Production modunda normal çalış
      await schedulerService.initialize();
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
      console.log(`📊 Products API: http://localhost:${PORT}/api/products`);
      console.log(`📈 Stats API: http://localhost:${PORT}/api/products/stats/summary`);
    });
  } catch (error) {
    console.error('❌ Sunucu başlatılırken hata:', error);
    process.exit(1);
  }
}


process.on('SIGINT', () => {
  console.log('\n🛑 Sunucu kapatılıyor...');
  schedulerService.stopAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Sunucu kapatılıyor...');
  schedulerService.stopAll();
  process.exit(0);
});

startServer();
