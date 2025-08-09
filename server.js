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


const csrfProtection = csrf({ cookie: true });
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 150,
    message: 'Çok fazla istek gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin.',
    standardHeaders: true, 
    legacyHeaders: false, 
});


app.use('/api', apiLimiter, csrfProtection, userRoutes);


app.listen(PORT, () => {
  console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
});
