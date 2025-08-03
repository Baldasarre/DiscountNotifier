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

function debounce(func, delay) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

async function savePreferences() {
  if (!email || !selectedGender) {
    console.warn("Kaydetme işlemi için e-posta ve cinsiyet seçimi gerekli.");
    return;
  }

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
    if (result.success) {
      console.log("Tercihler 3 saniye sonra otomatik olarak kaydedildi.", payload);
    } else {
      console.error("Sunucu hatası:", result.error);
    }
  } catch (err) {
    console.error("Otomatik kayıt sırasında bir hata oluştu:", err);
  }
}

const debouncedSave = debounce(savePreferences, 3000);

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

        welcomeMessage.innerHTML = "";
        const textPart1 = document.createTextNode("Hoş geldin ");
        const textPart2 = document.createTextNode(
          ", takip etmek istediğin markaları seçebilir, direkt ürün takibi yapabilirsin."
        );
        const boldElement = document.createElement("strong");
        boldElement.textContent = prefix;
        // welcomeMessage.appendChild(textPart1);
        // welcomeMessage.appendChild(boldElement);
        // welcomeMessage.appendChild(textPart2);

        brandSection.style.flexDirection = "row";
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
    console.error("Kullanıcı bilgileri çekilirken hata oluştu:", err);
  }
});

genderButtons.forEach((label) => {
  label.addEventListener("click", () => {
    selectedGender = label.textContent.trim();
    
    welcomeMessage.classList.add("element-hidden");
    genderDiv.classList.add("element-hidden");

    setTimeout(() => {
      genderDiv.style.display = "none";

      welcomeMessage.innerHTML = "";
      const textPart1 = document.createTextNode("Hoş geldin ");
      const textPart2 = document.createTextNode(
        ", takip etmek istediğin markaları seçebilir, direkt ürün takibi yapabilirsin."
      );
      const boldElement = document.createElement("strong");
      boldElement.textContent = prefix;
      // welcomeMessage.appendChild(textPart1);
      // welcomeMessage.appendChild(boldElement);
      // welcomeMessage.appendChild(textPart2);

      brandSection.style.display = "flex";
      
      requestAnimationFrame(() => {
        welcomeMessage.classList.remove("element-hidden");
        brandSection.classList.remove("element-hidden");
      });
    }, 400);
  });
});

brandCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
 
    const label = checkbox.closest('.checkboxLabel');
    if (checkbox.checked) {
      label.style.background = "linear-gradient(to top, #f88379 -20%, transparent 100%)";
    } else {
      label.style.background = "transparent";
    }
    debouncedSave();
  });
});