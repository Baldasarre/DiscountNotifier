import { fetchWithCsrf } from "./apis.js";
import { DELAYS, ROUTES, API_ENDPOINTS } from "./constants.js";
import { DOMUtils, ErrorHandler, StorageUtils } from "./utils.js";

const genderButtons = document.querySelectorAll(".checkboxGender");
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

    if (data.success && data.gender && !isEditing) {
      console.log("Gender zaten seçilmiş, dashboard'a yönlendiriliyor...");
      window.location.replace(ROUTES.DASHBOARD);
      return;
    }

    if (isEditing && data.success && data.gender) {
      console.log("Editing mode - current gender:", data.gender);
      const currentGenderButton = document.querySelector(
        `input[value="${data.gender}"]`
      );
      if (currentGenderButton) {
        const genderElement = currentGenderButton.closest(".checkboxGender");
        genderElement.classList.add("selected");
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

async function selectGender(selectedValue) {
  try {
    console.log("Gender seçiliyor:", selectedValue);

    const response = await fetchWithCsrf(API_ENDPOINTS.UPDATE_USER, "POST", {
      gender: selectedValue,
      brands: [],
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gender update error:", errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log("Gender update success:", result);

    document.body.classList.add("page-transition-exit-active");

    setTimeout(() => {
      window.location.replace(ROUTES.DASHBOARD);
    }, DELAYS.GENDER_SELECTION);
  } catch (err) {
    ErrorHandler.handle(err, "selectGender");
    alert("Bir hata oluştu. Lütfen tekrar deneyin.");
  }
}

genderButtons.forEach((button) => {
  button.addEventListener("click", (e) => {
    e.preventDefault();

    genderButtons.forEach((btn) => {
      btn.classList.remove("selected");
      btn.style.backgroundColor = "";
    });

    button.classList.add("selected");

    const selectedValue = button.querySelector("input").value;

    genderButtons.forEach((btn) => (btn.style.pointerEvents = "none"));

    setTimeout(() => {
      selectGender(selectedValue);
    }, 200);
  });
});

window.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("page-transition-enter-active");
  checkUserStatus();
});
