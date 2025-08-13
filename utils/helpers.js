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
  const mailOptions = { 
    from: process.env.EMAIL_USER,
    to, 
    subject, 
    text 
  };

  console.log(`[DEBUG] E-posta şu adrese gönderiliyor: ${to}`);
  
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