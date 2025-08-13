import { fetchWithCsrf } from './apis.js';

// DOM Elements
const genderButtons = document.querySelectorAll(".checkboxGender");
const email = localStorage.getItem("userEmail");

// Check if user should be on this page
async function checkUserStatus() {
  try {
    if (!email || email === 'null' || email === 'undefined') {
      console.log("Email bulunamadı, index'e yönlendiriliyor...");
      window.location.replace("/");
      return;
    }

    // Check if user is coming from edit button
    const urlParams = new URLSearchParams(window.location.search);
    const isEditing = urlParams.get('edit') === 'true';

    const res = await fetch(`/api/user-info`);
    const data = await res.json();
    
    if (data.success && data.gender && !isEditing) {
      // User already has gender selected and not editing, redirect to dashboard
      console.log("Gender zaten seçilmiş, dashboard'a yönlendiriliyor...");
      window.location.replace("/dashboard");
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
      localStorage.clear();
      window.location.replace('/');
    }
  } catch (err) {
    console.error("Sayfa başlatılırken hata oluştu:", err);
    localStorage.clear();
    window.location.replace('/');
  }
}

// Gender selection handler
async function selectGender(selectedValue) {
  try {
    console.log("Gender seçiliyor:", selectedValue);
    
    const response = await fetchWithCsrf("/api/update-user", 'POST', { 
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
    
    // Redirect to dashboard after animation
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 300);
    
  } catch (err) {
    console.error("Gender seçimi sırasında hata:", err);
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
