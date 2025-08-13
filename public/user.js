import { renderBrandButtons, renderProductCards, userTrackedProducts } from './ui-components.js';
import { fetchWithCsrf } from './apis.js';

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

function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

const debouncedBrandSave = debounce(() => savePreferences(false), 3000);


function addBrandCheckboxListeners() {
    const brandCheckboxes = document.querySelectorAll(".checkboxBrand");
    brandCheckboxes.forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const label = checkbox.closest(".checkboxLabel");
            label.style.backgroundColor = checkbox.checked ? "#f88379" : "transparent";
    
            debouncedBrandSave();
        });
    });
}


async function savePreferences(isGenderSelection = false) {

  if (!isGenderSelection && !selectedGender) return;

  const selectedBrands = [...document.querySelectorAll(".checkboxBrand")]
    .filter((cb) => cb.checked).map((cb) => cb.value);
  
  const payload = { 
    gender: selectedGender, 
    brands: selectedBrands 
  };

  try {
    console.log("Tercihler kaydediliyor:", payload);
    await fetchWithCsrf("/api/update-user", 'POST', payload);
  } catch (err) {
    console.error("Tercihler kaydedilirken hata:", err);
  }
}




async function initializePage() {

  renderBrandButtons(brandButtonsContainer);
  addBrandCheckboxListeners();
  renderProductCards(addedItemsContainer, userTrackedProducts);


  brandSection.style.display = 'none';
  tabBox.style.display = 'none';

  try {
    if (!email) {
      window.location.href = "/index.html";
      return;
    }
    const res = await fetch(`/api/user-info`);
    const data = await res.json();
    
    if (data.success) {
      selectedGender = data.gender;
      
  
      if (selectedGender) {
        genderDiv.style.display = "none";
        welcomeMessage.style.display = "none";
        brandSection.style.display = "flex";
        tabBox.style.display = 'flex';
        tabBox.classList.remove("element-hidden");
        requestAnimationFrame(() => brandSection.classList.remove("element-hidden"));
        

        const brandCheckboxes = document.querySelectorAll(".checkboxBrand");
        brandCheckboxes.forEach((cb) => {
          if (data.brands.includes(cb.value)) {
            cb.checked = true;
            cb.closest(".checkboxLabel").style.backgroundColor = "#f88379";
          }
        });

      } else {
        genderDiv.style.display = "flex";
        welcomeMessage.style.display = "block";
        welcomeMessage.classList.remove("element-hidden");
        brandSection.style.display = 'none';
        tabBox.style.display = 'none';
      }

    } else {
      console.error("Kullanıcı bilgileri alınamadı:", data.error);
      window.location.href = '/index.html';
    }
  } catch (err) {
    console.error("Sayfa başlatılırken hata oluştu:", err);
    welcomeMessage.classList.remove("element-hidden");
  }
}


genderButtons.forEach((label) => {
  label.addEventListener("click", () => {
    selectedGender = label.querySelector("input").value;
    savePreferences(true); 

    genderDiv.classList.add("element-hidden");
    welcomeMessage.classList.add("element-hidden");
    setTimeout(() => {
        genderDiv.style.display = "none";
        brandSection.style.display = "flex";
        tabBox.style.display = "flex";
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


window.addEventListener("DOMContentLoaded", initializePage);