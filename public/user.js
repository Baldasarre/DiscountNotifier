// --- DOM Element References ---
const form = document.getElementById("form");
const brandSection = document.getElementById("buttonsDiv");
const genderButtons = document.querySelectorAll(".checkboxGender");
const brandCheckboxes = document.querySelectorAll(".checkboxBrand");
const welcomeMessage = document.getElementById("welcomeMessage");
const genderDiv = document.querySelector(".genderDiv");
const linkBox = document.querySelector(".linkbox");
const tabBox = document.getElementById("tabBox");
const itemTrackTab = document.getElementById("itemTrackTab");
const followPageTab = document.getElementById("followPageTab");
const itemTrackSection = document.getElementById("linkBoxParrent");
const brandTrackingDiv = document.getElementById("brandTrackingDiv"); 
const email = localStorage.getItem("userEmail");

let selectedGender = null;

welcomeMessage.classList.add("element-transition");
genderDiv.classList.add("element-transition");
brandSection.classList.add("element-transition");
brandSection.style.display = "none";
brandSection.classList.add("element-hidden");


function debounce(func, delay) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}


async function savePreferences() {
  if (!selectedGender) {
    console.warn("Kaydetme işlemi için cinsiyet seçimi gerekli.");
    return;
  }

  const selectedBrands = [...brandCheckboxes]
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);

  const payload = {
    gender: selectedGender,
    brands: selectedBrands,
  };

  try {
    const res = await fetchWithCsrf("/api/update-user", 'POST', payload);
    const result = await res.json();
    if (result.success) {
      console.log("Tercihler otomatik olarak kaydedildi.", payload);
    } else {
      console.error("Sunucu hatası:", result.error);
    }
  } catch (err) {
    console.error("Otomatik kayıt sırasında bir hata oluştu:", err);
  }
}

const debouncedSave = debounce(savePreferences, 3000);

// --- Event Listeners ---
window.addEventListener("DOMContentLoaded", async () => {
  try {
    if (!email) {
      window.location.href = '/index.html';
      return;
    }

    const res = await fetch(`/api/user-info`);
    const data = await res.json();

    if (data.success) {
      selectedGender = data.gender;

      if (selectedGender && selectedGender.trim().length > 0) {
        genderDiv.style.display = "none";
        brandSection.style.display = "flex";
        brandSection.classList.remove("element-hidden");
        tabBox.classList.remove("element-hidden");
        if (tabBox.classList.contains("tab-2-active")) {
             itemTrackSection.style.display = "none";
             brandTrackingDiv.style.display = "flex";
        } else {
             itemTrackSection.style.display = "flex";
             brandTrackingDiv.style.display = "none";
        }
      } else {
        welcomeMessage.classList.remove("element-hidden");
      }

      brandCheckboxes.forEach((cb) => {
        if (data.brands.includes(cb.value)) {
          cb.checked = true;
          requestAnimationFrame(() => {
            const label = cb.closest(".checkboxLabel");
            if (label) {
              label.style.backgroundColor = "#f88379";
            }
          });
        }
      });
    } else {
        console.error("Kullanıcı bilgileri alınamadı:", data.error);
        window.location.href = '/index.html';
    }
  } catch (err) {
    console.error("Kullanıcı bilgileri çekilirken hata oluştu:", err);
    welcomeMessage.classList.remove("element-hidden");
  } finally {
    form.style.opacity = 1;
  }
});

genderButtons.forEach((label) => {
  label.addEventListener("click", () => {
    const input = label.querySelector('input');
    selectedGender = input.value;
    savePreferences();

    welcomeMessage.classList.add("element-hidden");
    genderDiv.classList.add("element-hidden");

    setTimeout(() => {
      genderDiv.style.display = "none";
      brandSection.style.display = "flex";
      tabBox.classList.remove("element-hidden");
      itemTrackSection.style.display = "flex";
      brandTrackingDiv.style.display = "none";
      requestAnimationFrame(() => {
        brandSection.classList.remove("element-hidden");
      });
    }, 400);
  });
});

brandCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    const label = checkbox.closest(".checkboxLabel");
    if (checkbox.checked) {
      label.style.background = "#f88379";
    } else {
      label.style.background = "transparent";
    }
    debouncedSave();
  });
});

const addedItemsContainer = document.querySelector(".addedItemBoxes");
addedItemsContainer.addEventListener("click", function (event) {
  const deleteButton = event.target.closest("#removeItem");
  const itemBox = event.target.closest(".addedItemImgBox");
  if (deleteButton) {
    if (itemBox) itemBox.remove();
  } else if (itemBox) {
    console.log("Ürün kutusuna tıklandı!");
  }
});

tabBox.classList.remove("tab-2-active");
itemTrackTab.addEventListener("click", () => {
  tabBox.classList.remove("tab-2-active");
  itemTrackSection.style.display = "flex";
  brandTrackingDiv.style.display = "none";
});
followPageTab.addEventListener("click", () => {
  tabBox.classList.add("tab-2-active");
  itemTrackSection.style.display = "none";
  brandTrackingDiv.style.display = "flex";
});
