// --- DOM Element References ---
// Get references to various elements on the page that we will interact with.
const brandSection = document.getElementById("buttonsDiv");
const genderButtons = document.querySelectorAll(".checkboxGender");
const brandCheckboxes = document.querySelectorAll(".checkboxBrand");
const welcomeMessage = document.getElementById("welcomeMessage");
const genderDiv = document.querySelector(".genderDiv");
const linkBox = document.querySelector(".linkbox");

// --- User Data ---
// Get user's email from browser's local storage to identify them.
const email = localStorage.getItem("userEmail");
// Create a user-friendly name from the email (e.g., "john.doe@email.com" -> "john.doe").
const prefix = email?.split("@")[0] || "Kullanıcı";

// --- State Variable ---
// A variable to keep track of the currently selected gender.
let selectedGender = null;

// --- Initial UI Setup ---
// Add CSS classes to elements to enable smooth transitions.
welcomeMessage.classList.add("element-transition");
genderDiv.classList.add("element-transition");
brandSection.classList.add("element-transition");
// Hide the brand selection section by default.
brandSection.style.display = "none";
brandSection.classList.add("element-hidden");

// --- Helper Functions ---
// A helper function to delay calling another function.
// This is used to prevent sending too many save requests while the user is still clicking.
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

// An asynchronous function that saves the user's preferences to the server.
async function savePreferences() {
  // Don't proceed if essential information is missing.
  if (!email || !selectedGender) {
    console.warn("Kaydetme işlemi için e-posta ve cinsiyet seçimi gerekli.");
    return;
  }

  // Get an array of all selected brand values.
  const selectedBrands = [...brandCheckboxes]
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);

  // Prepare the data payload to send to the server.
  const payload = {
    email,
    gender: selectedGender,
    brands: selectedBrands,
  };

  // Send the data to the server using the Fetch API.
  try {
    const res = await fetch("/api/update-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.success) {
      console.log(
        "Tercihler 3 saniye sonra otomatik olarak kaydedildi.",
        payload
      );
    } else {
      console.error("Sunucu hatası:", result.error);
    }
  } catch (err) {
    console.error("Otomatik kayıt sırasında bir hata oluştu:", err);
  }
}

// Create a debounced version of the save function that waits 3 seconds before executing.
const debouncedSave = debounce(savePreferences, 3000);

/*
function setWelcomeMessage(showUserName = true) { ... }
*/

// --- Event Listeners ---
// This runs once the entire page has finished loading.
window.addEventListener("DOMContentLoaded", async () => {
  try {
    if (!email) {
      // Yeni kullanıcı ise formu direkt göster.
      form.style.opacity = 1;
      return;
    }

    const res = await fetch(
      `/api/user-info?email=${encodeURIComponent(email)}`
    );
    const data = await res.json();

    if (data.success) {
      selectedGender = data.gender;

      if (selectedGender && selectedGender.trim().length > 0) {
        // Mevcut kullanıcı ise marka bölümünü göster.
        // Mesaj zaten HTML'de gizli olduğu için burada ek bir işlem yapmaya gerek yok.
        genderDiv.style.display = "none";
        brandSection.style.display = "flex";
        brandSection.classList.remove("element-hidden");
      } else {
        // --- YENİ EKLENEN MANTIK ---
        // Eğer kullanıcı yeni ise (cinsiyet seçmemişse), karşılama mesajını görünür yap.
        welcomeMessage.classList.remove("element-hidden");
      }
      
      // ... (marka seçimi yükleme kodu aynı kalıyor)
    }
  } catch (err) {
    console.error("Kullanıcı bilgileri çekilirken hata oluştu:", err);
  } finally {
    form.style.opacity = 1;
  }
});

// Add a click listener for each of the gender selection buttons.
genderButtons.forEach((label) => {
  label.addEventListener("click", () => {
    // Save the selected gender's text content.
    selectedGender = label.textContent.trim();
    // Animate out the welcome message and gender buttons.
    welcomeMessage.classList.add("element-hidden");
    genderDiv.classList.add("element-hidden");

    // After a short delay, hide the gender section and show the brand section.
    setTimeout(() => {
      genderDiv.style.display = "none";
      brandSection.style.display = "flex";
      // Use requestAnimationFrame to ensure the animation runs smoothly.
      requestAnimationFrame(() => {
        brandSection.classList.remove("element-hidden");
        // Ensure the welcome message stays hidden.
        welcomeMessage.classList.add("element-hidden");
      });
    }, 400);
  });
});

// Add a change listener for each of the brand checkboxes.
brandCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    // Visually update the label's background color based on checkbox state.
    const label = checkbox.closest(".checkboxLabel");
    if (checkbox.checked) {
      label.style.background = "#f88379";
    } else {
      label.style.background = "transparent";
    }
    // Call the debounced save function to save the new preferences.
    debouncedSave();
  });
});

// --- Tracked Items Section ---
// Get the main container for the tracked product images.
const addedItemsContainer = document.querySelector(".addedItemImgs");

// Use event delegation: add one click listener to the parent container.
// This handles clicks on all items inside it, even those added later.
addedItemsContainer.addEventListener("click", function (event) {
  // Check if the clicked element (or its parent) is a delete button.
  const deleteButton = event.target.closest(".deleteItemButton"); // Check if the clicked element is within an item box.

  const itemBox = event.target.closest(".addedItemImgBox"); // If a delete button was clicked...

  if (deleteButton) {
    console.log("Silme butonuna tıklandı."); // ...find its parent item box and remove it from the page.
    if (itemBox) {
      itemBox.remove();
    }
  } // Otherwise, if an item box itself was clicked (but not the delete button)...
  else if (itemBox) {
    console.log(
      "Ürün kutusuna tıklandı! Gelecekte burada ürün linkine yönlendirme yapılacak."
    ); // --- FUTURE CODE WILL GO HERE ---
    // This section is a placeholder for when we have product URLs. // Example: const url = itemBox.dataset.url; // if (url) { //   window.open(url, '_blank'); // Opens the link in a new tab. // }
  }
});
