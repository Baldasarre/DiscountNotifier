const signInButton = document.getElementById("signInButton");
const emailInput = document.getElementById("emailInput");

let mode = "email";
let currentEmail = "";

// ✅ 1. Sayfa açıldığında oturum kontrolü yap
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("/api/check-session");
    const data = await res.json();

    if (data.loggedIn) {
      showMessage("Oturum aktif. Giriş yapılıyor...");
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

  // 👇 Efekti görsel olarak uygulamak için:
  signInButton.classList.add("buttonClicked");
  setTimeout(() => {
    signInButton.classList.remove("buttonClicked");
  }, 150); // efekt süresi kadar

  // input'u göster
  setTimeout(() => {
    signInButton.style.display = "none";
    emailInput.style.display = "inline-block";
    emailInput.focus();
  }, 350);
});

emailInput.addEventListener("keydown", async (event) => {
  if (event.key === "Enter") {
    event.preventDefault();

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
        const response = await fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: value })
        });

        const result = await response.json();

        if (result.success) {
          currentEmail = value;
          localStorage.setItem("userEmail", currentEmail);
          showMessage(result.message);
          emailInput.value = "";
          emailInput.placeholder = "6 haneli kodu girin";
          mode = "code";
        } else {
          showMessage("Sunucu hatası: " + result.error);
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
        const response = await fetch("/api/verify-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: currentEmail, code })
        });

        const result = await response.json();

        if (result.success) {
          showMessage("Başarıyla giriş yapıldı!");
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

