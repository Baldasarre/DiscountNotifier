import { fetchWithCsrf } from './apis.js';
import { 
  DELAYS, 
  ROUTES, 
  API_ENDPOINTS
} from './constants.js';
import { 
  DOMUtils, 
  ErrorHandler, 
  StorageUtils 
} from './utils.js';

// DOM Elements
const genderButtons = document.querySelectorAll(".checkboxGender");
const email = StorageUtils.get("userEmail");

// Check if user should be on this page
async function checkUserStatus() {
  try {
    if (!email || email === 'null' || email === 'undefined') {
      console.log("Email bulunamadı, index'e yönlendiriliyor...");
      window.location.replace(ROUTES.INDEX);
      return;
    }

    // Check if user is coming from edit button
    const urlParams = new URLSearchParams(window.location.search);
    const isEditing = urlParams.get('edit') === 'true';

    const res = await fetch(API_ENDPOINTS.USER_INFO);
    const data = await res.json();
    
    if (data.success && data.gender && !isEditing) {
      // User already has gender selected and not editing, redirect to dashboard
      console.log("Gender zaten seçilmiş, dashboard'a yönlendiriliyor...");
      window.location.replace(ROUTES.DASHBOARD);
      return;
    }
    
    // If editing, show current selection as selected (orange)
    if (isEditing && data.success && data.gender) {
      console.log("Editing mode - current gender:", data.gender);
      // Mark current gender as selected
      const currentGenderButton = document.querySelector(`input[value="${data.gender}"]`);
      if (currentGenderButton) {
        const genderElement = currentGenderButton.closest('.checkboxGender');
        genderElement.classList.add('selected');
        // CSS will handle the background color, no need for inline style
      }
    }
    
    if (!data.success) {
      console.error("Kullanıcı bilgileri alınamadı:", data.error);
      StorageUtils.clear();
      window.location.replace(ROUTES.INDEX);
    }
  } catch (err) {
    ErrorHandler.handle(err, 'checkUserStatus');
  }
}

// Gender selection handler
async function selectGender(selectedValue) {
  try {
    console.log("Gender seçiliyor:", selectedValue);
    
    const response = await fetchWithCsrf(API_ENDPOINTS.UPDATE_USER, 'POST', { 
      gender: selectedValue, 
      brands: [] 
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gender update error:", errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log("Gender update success:", result);
    
    // Add exit animation
    document.body.classList.add('page-transition-exit-active');
    
    // Redirect to dashboard after a short delay
    setTimeout(() => {
      window.location.replace(ROUTES.DASHBOARD);
    }, DELAYS.GENDER_SELECTION);
    
  } catch (err) {
    ErrorHandler.handle(err, 'selectGender');
    alert("Bir hata oluştu. Lütfen tekrar deneyin.");
  }
}

// Gender button event listeners
genderButtons.forEach((button) => {
  button.addEventListener("click", (e) => {
    e.preventDefault();
    
    // Remove selected class and reset background from all buttons
    genderButtons.forEach(btn => {
      btn.classList.remove('selected');
      btn.style.backgroundColor = '';
    });
    
    // Add selected class to clicked button
    button.classList.add('selected');
    
    // Get selected value
    const selectedValue = button.querySelector("input").value;
    
    // Disable all buttons to prevent multiple clicks
    genderButtons.forEach(btn => btn.style.pointerEvents = 'none');
    
    // Select gender after a short delay for visual feedback
    setTimeout(() => {
      selectGender(selectedValue);
    }, 200);
  });
});

// Initialize page
window.addEventListener("DOMContentLoaded", () => {
  // Add enter animation
  document.body.classList.add('page-transition-enter-active');
  checkUserStatus();
});
