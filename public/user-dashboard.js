import { renderBrandButtons, renderProductCards, userTrackedProducts } from './ui-components.js';
import { fetchWithCsrf } from './apis.js';
import { 
  DELAYS, 
  COLORS, 
  ROUTES, 
  API_ENDPOINTS,
  UI_STATES
} from './constants.js';
import { 
  DOMUtils, 
  ErrorHandler, 
  StorageUtils 
} from './utils.js';

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

// Cache brand checkboxes for better performance
let brandCheckboxes = null;

const email = StorageUtils.get("userEmail");
let selectedGender = null;

function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

const debouncedBrandSave = debounce(() => savePreferences(false), DELAYS.BRAND_SAVE);

function addBrandCheckboxListeners() {
  // Cache brand checkboxes once
  if (!brandCheckboxes) {
    brandCheckboxes = document.querySelectorAll(".checkboxBrand");
  }
  
  brandCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const label = checkbox.closest(".checkboxLabel");
      label.style.backgroundColor = checkbox.checked ? COLORS.BRAND_SELECTED : COLORS.BRAND_DEFAULT;
      
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
    const response = await fetchWithCsrf(API_ENDPOINTS.UPDATE_USER, 'POST', payload);
    console.log("Update-user response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Update-user error response:", errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log("Update-user success:", result);
  } catch (err) {
    ErrorHandler.handle(err, 'savePreferences');
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
      window.location.replace(ROUTES.INDEX);
      return;
    }
    
    console.log("Email mevcut:", email);
    console.log("User-info API çağrısı yapılıyor...");
    const res = await fetch(API_ENDPOINTS.USER_INFO);
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
        window.location.replace(ROUTES.CATEGORY);
        return;
      }
      
      // Show dashboard content
      console.log("Dashboard içeriği gösteriliyor...");
      
      // Load user's brand preferences
      const brandCheckboxes = document.querySelectorAll(".checkboxBrand");
      brandCheckboxes.forEach((cb) => {
        if (data.brands.includes(cb.value)) {
          cb.checked = true;
          cb.closest(".checkboxLabel").style.backgroundColor = COLORS.BRAND_SELECTED;
        }
      });

    } else {
      console.error("Kullanıcı bilgileri alınamadı:", data.error);
      StorageUtils.clear();
      window.location.replace(ROUTES.INDEX);
    }
  } catch (err) {
    ErrorHandler.handle(err, 'initializePage');
  }
}

// Tab switching functionality
itemTrackTab.addEventListener("click", () => {
  DOMUtils.removeClass("tabBox", UI_STATES.TAB_ACTIVE);
  DOMUtils.showElement("linkBoxParrent");
  DOMUtils.hideElement("brandTrackingDiv");
});

followPageTab.addEventListener("click", () => {
  DOMUtils.addClass("tabBox", UI_STATES.TAB_ACTIVE);
  DOMUtils.hideElement("linkBoxParrent");
  DOMUtils.showElement("brandTrackingDiv");
});

// Logout functionality
async function logout() {
  console.log("Logout başlatılıyor...");
  
  try {
    const response = await fetch(API_ENDPOINTS.LOGOUT, {
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
  StorageUtils.clear();
  sessionStorage.clear();
  
  // Clear cookies
  document.cookie.split(";").forEach(function(c) { 
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
  });
  
  // Redirect
  window.location.replace(ROUTES.INDEX);
}

// Menu System
menuButton.addEventListener("click", function(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const isHidden = menuDropdown.classList.contains(UI_STATES.MENU_HIDDEN);
  
  if (isHidden) {
    DOMUtils.removeClass("menuDropdown", UI_STATES.MENU_HIDDEN);
    DOMUtils.addClass("menuDropdown", UI_STATES.MENU_VISIBLE);
  } else {
    DOMUtils.removeClass("menuDropdown", UI_STATES.MENU_VISIBLE);
    DOMUtils.addClass("menuDropdown", UI_STATES.MENU_HIDDEN);
  }
});

// Close menu when clicking outside
document.addEventListener("click", function(e) {
  if (!menuButton.contains(e.target) && !menuDropdown.contains(e.target)) {
    DOMUtils.removeClass("menuDropdown", UI_STATES.MENU_VISIBLE);
    DOMUtils.addClass("menuDropdown", UI_STATES.MENU_HIDDEN);
  }
});

editCategoryButton.addEventListener("click", function(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // Prevent multiple clicks
  if (editCategoryButton.disabled) return;
  DOMUtils.setDisabled("editCategoryButton", true);
  DOMUtils.setOpacity("editCategoryButton", COLORS.BUTTON_DISABLED);
  DOMUtils.setText("editCategoryButton", "Yönlendiriliyor...");
  
  // Close menu
  DOMUtils.removeClass("menuDropdown", UI_STATES.MENU_VISIBLE);
  DOMUtils.addClass("menuDropdown", UI_STATES.MENU_HIDDEN);
  
  // Redirect to category page with edit parameter
  setTimeout(() => {
    window.location.href = `${ROUTES.CATEGORY}?edit=true`;
  }, DELAYS.MENU_REDIRECT);
});

logoutButton.addEventListener("click", function(e) {
  e.preventDefault();
  e.stopPropagation();
  
  DOMUtils.setDisabled("logoutButton", true);
  DOMUtils.setOpacity("logoutButton", COLORS.BUTTON_LOADING);
  DOMUtils.setText("logoutButton", "Çıkış yapılıyor...");
  
  // Close menu
  DOMUtils.removeClass("menuDropdown", UI_STATES.MENU_VISIBLE);
  DOMUtils.addClass("menuDropdown", UI_STATES.MENU_HIDDEN);
  
  logout();
});

window.addEventListener("DOMContentLoaded", initializePage);
