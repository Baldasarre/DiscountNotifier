import { renderBrandButtons, renderProductCards, userTrackedProducts } from './ui-components.js';
import { fetchWithCsrf } from './apis.js';

// --- DOM Element References ---
const form = document.getElementById("form");
const brandSection = document.getElementById("buttonsDiv");
const tabBox = document.getElementById("tabBox");
const itemTrackTab = document.getElementById("itemTrackTab");
const followPageTab = document.getElementById("followPageTab");
const itemTrackSection = document.getElementById("linkBoxParrent");
const brandTrackingDiv = document.getElementById("brandTrackingDiv");
const brandButtonsContainer = document.getElementById("brandButtons");
const addedItemsContainer = document.querySelector(".addedItemBoxes");
const logoutButton = document.getElementById("logoutButton");
const editCategoryButton = document.getElementById("editCategoryButton");
const menuButton = document.getElementById("menuButton");
const menuDropdown = document.getElementById("menuDropdown");

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
    const response = await fetchWithCsrf("/api/update-user", 'POST', payload);
    console.log("Update-user response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Update-user error response:", errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log("Update-user success:", result);
  } catch (err) {
    console.error("Tercihler kaydedilirken hata:", err);
    console.error("Error details:", err.message, err.stack);
  }
}

async function initializePage() {
  console.log("Dashboard InitializePage başlatıldı");
  
  renderBrandButtons(brandButtonsContainer);
  addBrandCheckboxListeners();
  renderProductCards(addedItemsContainer, userTrackedProducts);

  try {
    if (!email || email === 'null' || email === 'undefined') {
      console.log("Email bulunamadı, index'e yönlendiriliyor...");
      window.location.replace("/");
      return;
    }
    
    console.log("Email mevcut:", email);
    console.log("User-info API çağrısı yapılıyor...");
    const res = await fetch(`/api/user-info`);
    console.log("API Response status:", res.status);
    
    if (!res.ok) {
      console.error("API Response not OK:", res.status, res.statusText);
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    console.log("API Response data:", data);
    
    if (data.success) {
      selectedGender = data.gender;
      
      // If no gender selected, redirect to gender selection
      if (!selectedGender) {
        console.log("Gender seçilmemiş, gender-selection sayfasına yönlendiriliyor...");
        window.location.replace("/category");
        return;
      }
      
      // Show dashboard content
      console.log("Dashboard içeriği gösteriliyor...");
      
      // Load user's brand preferences
      const brandCheckboxes = document.querySelectorAll(".checkboxBrand");
      brandCheckboxes.forEach((cb) => {
        if (data.brands.includes(cb.value)) {
          cb.checked = true;
          cb.closest(".checkboxLabel").style.backgroundColor = "#f88379";
        }
      });

    } else {
      console.error("Kullanıcı bilgileri alınamadı:", data.error);
      localStorage.clear();
      window.location.replace('/');
    }
  } catch (err) {
    console.error("Sayfa başlatılırken hata oluştu:", err);
    localStorage.clear();
    window.location.replace('/');
  }
}

// Tab switching functionality
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

// Logout functionality
async function logout() {
  console.log("Logout başlatılıyor...");
  
  try {
    const response = await fetch('/api/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      console.log("Server logout başarılı");
    }
  } catch (error) {
    console.log("Server logout error:", error);
  }
  
  // Client-side cleanup
  localStorage.clear();
  sessionStorage.clear();
  
  // Clear cookies
  document.cookie.split(";").forEach(function(c) { 
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
  });
  
  // Redirect
  window.location.replace("/");
}

// Menu System
menuButton.addEventListener("click", function(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const isHidden = menuDropdown.classList.contains('menu-hidden');
  
  if (isHidden) {
    menuDropdown.classList.remove('menu-hidden');
    menuDropdown.classList.add('menu-visible');
  } else {
    menuDropdown.classList.remove('menu-visible');
    menuDropdown.classList.add('menu-hidden');
  }
});

// Close menu when clicking outside
document.addEventListener("click", function(e) {
  if (!menuButton.contains(e.target) && !menuDropdown.contains(e.target)) {
    menuDropdown.classList.remove('menu-visible');
    menuDropdown.classList.add('menu-hidden');
  }
});

editCategoryButton.addEventListener("click", function(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // Prevent multiple clicks
  if (editCategoryButton.disabled) return;
  editCategoryButton.disabled = true;
  editCategoryButton.style.opacity = "0.6";
  editCategoryButton.textContent = "Yönlendiriliyor...";
  
  // Close menu
  menuDropdown.classList.remove('menu-visible');
  menuDropdown.classList.add('menu-hidden');
  
  // Redirect to category page with edit parameter
  setTimeout(() => {
    window.location.href = "/category?edit=true";
  }, 500);
});

logoutButton.addEventListener("click", function(e) {
  e.preventDefault();
  e.stopPropagation();
  
  logoutButton.disabled = true;
  logoutButton.style.opacity = "0.5";
  logoutButton.textContent = "Çıkış yapılıyor...";
  
  // Close menu
  menuDropdown.classList.remove('menu-visible');
  menuDropdown.classList.add('menu-hidden');
  
  logout();
});

window.addEventListener("DOMContentLoaded", initializePage);
