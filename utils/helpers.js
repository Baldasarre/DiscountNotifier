const nodemailer = require("nodemailer");
const { createServiceLogger } = require("./logger");

const logger = createServiceLogger("helpers");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function sendEmail(to, code, type = "verify") {
  const subject =
    type === "login" ? "Giriş Kodunuz" : "E-Posta Doğrulama Kodunuz";
  const text = `Merhaba!\n\n${
    type === "login" ? "Giriş" : "Doğrulama"
  } kodunuz: ${code}\n\nKod 5 dakika geçerlidir.`;

  logger.debug("Email will be sent", { to, type, codeLength: code.length });

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    logger.warn("Email service not configured - showing code in console");
    logger.info(`Code for ${to}: ${code}`);
    return;
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      logger.error("Email send failed", error);
    } else {
      logger.info("Email sent successfully", { response: info.response });
    }
  });
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function setSessionCookie(res, userId) {
  res.cookie("sessionId", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: "Lax",
    path: "/",
  });
}

module.exports = {
  sendEmail,
  generateCode,
  setSessionCookie,
};
