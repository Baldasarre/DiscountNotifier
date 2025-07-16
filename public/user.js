// DOM Elements
const saveButton = document.getElementById("saveButton");
const brandSection = document.getElementById("buttonsDiv");
const genderButtons = document.querySelectorAll(".checkboxGender");
const brandCheckboxes = document.querySelectorAll(".checkboxBrand");
const email = localStorage.getItem("userEmail");
const prefix = email?.split("@")[0] || "Kullanıcı";
const welcomeMessage = document.getElementById("welcomeMessage");

let selectedGender = null;

// Hide brand section initially
brandSection.style.display = "none";

// Handle gender selection by user
genderButtons.forEach((label) => {
  label.addEventListener("click", () => {
    selectedGender = label.textContent.trim();

    brandSection.style.display = "flex";
    genderButtons.forEach((l) => (l.style.display = "none"));
    label.style.backgroundColor = "#f88379";
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
  const email = localStorage.getItem("userEmail");
  if (!email) return;

  const prefix = email.split("@")[0];
  const target = document.getElementById("userEmailPrefix");
  if (target) target.textContent = prefix;

  try {
    const res = await fetch(
      `/api/user-info?email=${encodeURIComponent(email)}`
    );
    const data = await res.json();

    if (data.success) {
      selectedGender = data.gender;
      welcomeMessage.innerHTML = `Kimin ürünlerini takip etmek istersin? Bu seçim, belirli bir ürün için özel takip yapmanı engellemez.`;
      if (selectedGender && selectedGender.trim().length > 0) {
        const genderContainer = document.querySelector(".genderDiv");
        if (genderContainer && genderContainer.parentNode) {
          genderContainer.parentNode.removeChild(genderContainer);
        }
        brandSection.style.display = "flex";
        brandSection.style.flexDirection = "column";
        brandSection.style.alignItems = "center";
        welcomeMessage.innerHTML = `Hoş geldin <span style="font-weight: bold;">${prefix}</span>, takip etmek istediğin markaları seçebilirsin.`;
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

  const email = localStorage.getItem("userEmail");
  if (!email) return alert("E-posta bilgisi eksik!");
  if (!selectedGender) return alert("Please select a gender!");

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

    // Sadece mobilde scroll to top
    if (window.innerWidth <= 768) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (err) {
    userPanelMessage.textContent = "Kayıt hatası!";
  }
});
