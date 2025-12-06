import { fetchWithCsrf } from "./apis.js";
import { DELAYS, ROUTES, API_ENDPOINTS } from "./constants.js";
import { DOMUtils, ErrorHandler, StorageUtils } from "./utils.js";

const categoryButtons = document.querySelectorAll(".checkboxCategory");
const email = StorageUtils.get("userEmail");

async function checkUserStatus() {
  try {
   
    const sessionCheck = await fetch(API_ENDPOINTS.CHECK_SESSION, {
      credentials: "include",
    });
    const sessionData = await sessionCheck.json();
    
    if (!sessionData.loggedIn) {
      console.log("Session bulunamadı, index'e yönlendiriliyor...");
      window.location.replace(ROUTES.INDEX);
      return;
    }
    
   
    if (sessionData.email && (!email || email === "null" || email === "undefined")) {
      StorageUtils.set("userEmail", sessionData.email);
      console.log("Email session'dan storage'a kaydedildi:", sessionData.email);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const isEditing = urlParams.get("edit") === "true";

    const res = await fetch(API_ENDPOINTS.USER_INFO);
    const data = await res.json();

    if (data.success && data.category && !isEditing) {
      console.log("Kategori zaten seçilmiş, dashboard'a yönlendiriliyor...");
      window.location.replace(ROUTES.DASHBOARD);
      return;
    }

    if (isEditing && data.success && data.category) {
      console.log("Editing mode - current category:", data.category);
      const currentCategoryButton = document.querySelector(
        `input[value="${data.category}"]`
      );
      if (currentCategoryButton) {
        const categoryElement = currentCategoryButton.closest(".checkboxCategory");
        categoryElement.classList.add("selected");
      }
    }

    if (!data.success) {
      console.error("Kullanıcı bilgileri alınamadı:", data.error);
      StorageUtils.clear();
      window.location.replace(ROUTES.INDEX);
    }
  } catch (err) {
    ErrorHandler.handle(err, "checkUserStatus");
  }
}

async function selectCategory(selectedValue) {
  try {
    console.log("Kategori seçiliyor:", selectedValue);

    const response = await fetchWithCsrf(API_ENDPOINTS.UPDATE_USER, "POST", {
      category: selectedValue,
      brands: [],
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Kategori güncelleme hatası:", errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log("Kategori güncelleme başarılı:", result);

    document.body.classList.add("page-transition-exit-active");

    setTimeout(() => {
      window.location.replace(ROUTES.DASHBOARD);
    }, DELAYS.CATEGORY_SELECTION);
  } catch (err) {
    ErrorHandler.handle(err, "selectCategory");
    alert("Bir hata oluştu. Lütfen tekrar deneyin.");
  }
}

categoryButtons.forEach((button) => {
  button.addEventListener("click", (e) => {
    e.preventDefault();

    categoryButtons.forEach((btn) => {
      btn.classList.remove("selected");
      btn.style.backgroundColor = "";
    });

    button.classList.add("selected");

    const selectedValue = button.querySelector("input").value;

    categoryButtons.forEach((btn) => (btn.style.pointerEvents = "none"));

    setTimeout(() => {
      selectCategory(selectedValue);
    }, 200);
  });
});

window.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("page-transition-enter-active");
  checkUserStatus();
});
