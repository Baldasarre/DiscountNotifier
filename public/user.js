// public/user.js

console.log("user.js modülü başarıyla yüklendi ve çalışmaya başladı.");

import { renderBrandButtons, renderProductCards, userTrackedProducts } from './ui-components.js';
import { fetchWithCsrf } from './utils.js';

// --- DOM Element References ---
const form = document.getElementById("form");
const brandSection = document.getElementById("buttonsDiv");
const genderButtons = document.querySelectorAll(".checkboxGender");
const welcomeMessage = document.getElementById("welcomeMessage");
const genderDiv = document.querySelector(".genderDiv");
const tabBox = document.getElementById("tabBox");
const itemTrackTab = document.getElementById("itemTrackTab");
const followPageTab = document.getElementById("followPageTab");
const itemTrackSection = document.getElementById("linkBoxParrent");
const brandTrackingDiv = document.getElementById("brandTrackingDiv");
const brandButtonsContainer = document.getElementById("brandButtons");
const addedItemsContainer = document.querySelector(".addedItemBoxes");

const email = localStorage.getItem("userEmail");
let selectedGender = null;

// --- Helper Functions ---
function addBrandCheckboxListeners() {
    const brandCheckboxes = document.querySelectorAll(".checkboxBrand");
    brandCheckboxes.forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const label = checkbox.closest(".checkboxLabel");
            label.style.backgroundColor = checkbox.checked ? "#f88379" : "transparent";
            debouncedSave();
        });
    });
}

const debouncedSave = debounce(savePreferences, 3000);

function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

async function savePreferences() {
  if (!selectedGender) return;
  const selectedBrands = [...document.querySelectorAll(".checkboxBrand")]
    .filter((cb) => cb.checked).map((cb) => cb.value);
  const payload = { gender: selectedGender, brands: selectedBrands };
  try {
    await fetchWithCsrf("/api/update-user", 'POST', payload);
  } catch (err) {
    console.error("Tercihler kaydedilirken hata:", err);
  }
}

// --- Main Logic ---
async function initializePage() {
  // 1. Önce arayüzü statik/örnek verilerle çiz
  renderBrandButtons(brandButtonsContainer);
  addBrandCheckboxListeners();
  renderProductCards(addedItemsContainer, userTrackedProducts);

  // 2. Sunucudan gerçek kullanıcı verisini çek
  try {
    if (!email) {
      window.location.href = "/index.html";
      return;
    }
    const res = await fetch(`/api/user-info`);
    const data = await res.json();
    
    if (data.success) {
      selectedGender = data.gender;
      
      // 3. Veriye göre arayüzü güncelle
      if (selectedGender) {
        genderDiv.style.display = "none";
        welcomeMessage.style.display = "none";
        brandSection.style.display = "flex";
        tabBox.classList.remove("element-hidden");
        requestAnimationFrame(() => brandSection.classList.remove("element-hidden"));
      } else {
        welcomeMessage.classList.remove("element-hidden");
      }
      
      // Kayıtlı markaları işaretle
      const brandCheckboxes = document.querySelectorAll(".checkboxBrand");
      brandCheckboxes.forEach((cb) => {
        if (data.brands.includes(cb.value)) {
          cb.checked = true;
          cb.closest(".checkboxLabel").style.backgroundColor = "#f88379";
        }
      });

    } else {
      console.error("Kullanıcı bilgileri alınamadı:", data.error);
      window.location.href = '/index.html';
    }
  } catch (err) {
    console.error("Sayfa başlatılırken hata oluştu:", err);
    welcomeMessage.classList.remove("element-hidden"); // Hata durumunda en azından bir mesaj göster
  }
}

// --- Event Listeners ---
genderButtons.forEach((label) => {
  label.addEventListener("click", () => {
    selectedGender = label.querySelector("input").value;
    savePreferences();
    genderDiv.classList.add("element-hidden");
    welcomeMessage.classList.add("element-hidden");
    setTimeout(() => {
        genderDiv.style.display = "none";
        brandSection.style.display = "flex";
        tabBox.classList.remove("element-hidden");
        itemTrackSection.style.display = "flex";
        brandTrackingDiv.style.display = "none";
        requestAnimationFrame(() => brandSection.classList.remove("element-hidden"));
    }, 400);
  });
});

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

// Sayfa yüklendiğinde ana fonksiyonu çalıştır
window.addEventListener("DOMContentLoaded", initializePage);