import { fetchWithCsrf } from './utils.js';

const signInButton = document.getElementById("signInButton");
const emailInput = document.getElementById("emailInput");
const sendItButton = document.getElementById("sendIt");

let mode = "email";
let currentEmail = "";

async function handleSubmission() {
  const value = emailInput.value.trim();

  if (mode === "email") {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!value) {
      showMessage("E-posta adresi boş olamaz!");
      return;
    }
    if (!pattern.test(value)) {
      showMessage("Geçerli bir e-posta adresi giriniz!");
      return;
    }
    try {
      const response = await fetchWithCsrf("/api/save", 'POST', { email: value });
      const result = await response.json();

      if (result.success) {
        currentEmail = value;
        localStorage.setItem("userEmail", currentEmail);
        showMessage(result.message);
        emailInput.value = "";
        emailInput.placeholder = "6 haneli kodu girin";
        mode = "code";
      } else {
        showMessage("Sunucu hatası: " + (result.error || "Bilinmeyen hata"));
      }
    } catch (err) {
      showErrMessage("Bağlantı hatası!");
    }
  } else if (mode === "code") {
    const code = value;
    if (!/^\d{6}$/.test(code)) {
      showMessage("6 haneli kodu doğru girin!");
      return;
    }
    try {
      const response = await fetchWithCsrf("/api/verify-code", 'POST', { email: currentEmail, code });
      const result = await response.json();

      if (result.success) {
        showMessage("Başarıyla giriş yapıldı!");
        sendItButton.disabled = true;
        setTimeout(() => {
          showMessage("Kullanıcı sayfanıza yönlendiriliyorsunuz...");
        }, 2000);
        setTimeout(() => {
          window.location.href = "/user.html";
        }, 4000);
      } else {
        showMessage(result.error || "Doğrulama başarısız.");
      }
    } catch (err) {
      showMessage("Kod kontrolünde hata!");
    }
    emailInput.value = "";
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("/api/check-session", {
      credentials: "include",
    });
    const data = await res.json();
    if (data.loggedIn) {
      const signInButton = document.getElementById("signInButton");
      signInButton.textContent = "Oturum aktif. Giriş yapılıyor...";
      signInButton.disabled = true;
      signInButton.style.cursor = "wait";
      setTimeout(() => {
        window.location.href = "/user.html";
      }, 2000);
    }
  } catch (err) {
    console.error("Oturum kontrol hatası:", err);
  }
});

signInButton.addEventListener("click", (event) => {
  event.preventDefault();
  signInButton.classList.add("buttonClicked");
  setTimeout(() => signInButton.classList.remove("buttonClicked"), 150);
  setTimeout(() => {
    signInButton.style.display = "none";
    emailInput.style.display = "inline-block";
    sendItButton.classList.add("visible");
    emailInput.focus();
  }, 350);
});

sendItButton.addEventListener("click", (event) => {
  event.preventDefault();
  sendItButton.classList.add("buttonClicked");
  setTimeout(() => sendItButton.classList.remove("buttonClicked"), 150);
  handleSubmission();
});

emailInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleSubmission();
  }
});

function showMessage(msg) {
  emailInput.value = "";
  emailInput.placeholder = msg;
  emailInput.disabled = false;
  emailInput.blur();
}

function showErrMessage(msg) {
  emailInput.value = "";
  emailInput.placeholder = msg;
  emailInput.disabled = true;
}
