const nodemailer = require("nodemailer");

// Transporter ayarları doğru görünüyor.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function sendEmail(to, code, type = "verify") {
  const subject = type === "login" ? "Giriş Kodunuz" : "E-Posta Doğrulama Kodunuz";
  const text = `Merhaba!\n\n${type === "login" ? "Giriş" : "Doğrulama"} kodunuz: ${code}\n\nKod 5 dakika geçerlidir.`;
  
  console.log(`[DEBUG] E-posta gönderilecek: ${to}`);
  console.log(`[DEBUG] Kod: ${code}`);
  console.log(`[DEBUG] Tip: ${type}`);
  
  // Geçici olarak email gönderimini devre dışı bırak - sadece console'a yaz
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("⚠️  Email servisi yapılandırılmamış - kod console'da gösteriliyor");
    console.log(`📧 ${to} adresine gönderilecek kod: ${code}`);
    return;
  }
  
  const mailOptions = { 
    from: process.env.EMAIL_USER,
    to, 
    subject, 
    text 
  };
  
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        console.error("Mail gönderilemedi:", error);
    } else {
        console.log("Mail gönderildi:", info.response);
    }
  });
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = {
    sendEmail,
    generateCode
};