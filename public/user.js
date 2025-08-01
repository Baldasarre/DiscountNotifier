// DOM Elements
const saveButton = document.getElementById("saveButton");
const brandSection = document.getElementById("buttonsDiv");
const genderButtons = document.querySelectorAll(".checkboxGender");
const brandCheckboxes = document.querySelectorAll(".checkboxBrand");
const email = localStorage.getItem("userEmail");
const prefix = email?.split("@")[0] || "Kullanıcı";
const welcomeMessage = document.getElementById("welcomeMessage");
const genderDiv = document.querySelector(".genderDiv");
const linkBox = document.querySelector(".linkbox");

let selectedGender = null;


welcomeMessage.classList.add("element-transition");
genderDiv.classList.add("element-transition");
brandSection.classList.add("element-transition");
brandSection.style.display = "none";
brandSection.classList.add("element-hidden");
saveButton.classList.add("element-transition");
saveButton.style.display = "none";
saveButton.classList.add("element-hidden");

genderButtons.forEach((label) => {
  label.addEventListener("click", () => {
    selectedGender = label.textContent.trim();
    welcomeMessage.classList.add("element-hidden");
    genderDiv.classList.add("element-hidden");

    setTimeout(() => {
      genderDiv.style.display = "none";
      welcomeMessage.innerHTML = `Hoş geldin <span style="font-weight: bold;">${prefix}</span>, takip etmek istediğin markaları seçebilir, direkt ürün takibi yapabilirsin.`;
      brandSection.style.display = "flex";
      saveButton.style.display = "block"; 
      requestAnimationFrame(() => {
        welcomeMessage.classList.remove("element-hidden");
        brandSection.classList.remove("element-hidden");
        saveButton.classList.remove("element-hidden");
      });
      
    }, 400); 
  });
});

// Brand selection visual effect
brandCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    const label = checkbox.closest(".checkboxLabel");
    if (checkbox.checked) {
      label.style.background =
        "linear-gradient(to top, #f88379 -20%, transparent 100%)";
    } else {
      label.style.background = "transparent";
    }
  });
});

// Fetch user info on page load
window.addEventListener("DOMContentLoaded", async () => {
  if (!email) return;

  try {
    const res = await fetch(
      `/api/user-info?email=${encodeURIComponent(email)}`
    );
    const data = await res.json();

    if (data.success) {
      selectedGender = data.gender;
      
      if (selectedGender && selectedGender.trim().length > 0) {
        genderDiv.style.display = "none"; 
        brandSection.style.display = "flex"; 
        brandSection.classList.remove("element-hidden"); 
        
        welcomeMessage.innerHTML = `Hoş geldin <span style="font-weight: bold;">${prefix}</span>, takip etmek istediğin markaları seçebilir, direkt ürün takibi yapabilirsin.`;
        
        brandSection.style.flexDirection = "column";
        brandSection.style.alignItems = "center";
      } else {
        welcomeMessage.innerHTML = `Kimin ürünlerini takip etmek istersin? Bu seçim, belirli bir ürün için özel takip yapmanı engellemez.`;
      }

      brandCheckboxes.forEach((cb) => {
        if (data.brands.includes(cb.value)) {
          cb.checked = true;
          requestAnimationFrame(() => {
            const label = cb.closest(".checkboxLabel");
            if (label) {
              label.style.background =
                "linear-gradient(to top, #f88379 40%, transparent 100%)";
            }
          });
        }
      });
    }
  } catch (err) {
    console.error("Failed to fetch user info:", err);
  }
});

// Save user preferences
saveButton.addEventListener("click", async (event) => {
  event.preventDefault();

  if (!email) return alert("E-posta bilgisi eksik!");
  if (!selectedGender) return alert("Lütfen bir cinsiyet seçin!");

  const selectedBrands = [...brandCheckboxes]
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);

  const payload = {
    email,
    gender: selectedGender,
    brands: selectedBrands,
  };

  try {
    const res = await fetch("/api/update-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    welcomeMessage.innerHTML =
      "Seçimlerin başarıyla kayıt edildi! İndirime giren bir ürün olursa sana anında haber vereceğiz.";
    welcomeMessage.classList.remove("element-hidden");

    if (window.innerWidth <= 768) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (err) {
    welcomeMessage.textContent = "Kayıt sırasında bir hata oluştu!";
  }
});