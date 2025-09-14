import {
  renderBrandButtons,
  renderProductCards,
  userTrackedProducts,
  createProductCardHTML,
} from "./ui-components.js";
import {
  fetchWithCsrf,
  fetchTrackedProducts,
  trackProduct,
  untrackProduct,
  untrackBershkaProduct,
} from "./apis.js";
import {
  DELAYS,
  COLORS,
  ROUTES,
  API_ENDPOINTS,
  UI_STATES,
} from "./constants.js";
import { DOMUtils, ErrorHandler, StorageUtils } from "./utils.js";

// --- DOM Element References ---
const form = document.getElementById("form");
const brandSection = document.getElementById("buttonsDiv");
const tabBox = document.getElementById("tabBox");
const itemTrackTab = document.getElementById("itemTrackTab");
const followPageTab = document.getElementById("followPageTab");
const itemTrackSection = document.getElementById("linkBoxParrent");
const brandTrackingDiv = document.getElementById("brandTrackingDiv");
const brandButtonsContainer = document.getElementById("brandButtons");
let addedItemsContainer = null;
const logoutButton = document.getElementById("logoutButton");
const editCategoryButton = document.getElementById("editCategoryButton");
const menuButton = document.getElementById("menuButton");
const menuDropdown = document.getElementById("menuDropdown");

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

const debouncedBrandSave = debounce(
  () => savePreferences(false),
  DELAYS.BRAND_SAVE
);

let currentProducts = [];
let isLoadingProducts = false;

function animateLinkBoxHeight() {
  const linkBox = document.querySelector(".linkBox");
  const hasProducts =
    addedItemsContainer.children.length > 0 &&
    !addedItemsContainer.querySelector('p[style*="text-align: center"]');

  if (hasProducts) {
    linkBox.style.minHeight = "20em";
  } else {
    linkBox.style.minHeight = "20em";
  }
}

function addProductWithAnimation(container, newProduct) {
  const emptyMessage = container.querySelector("p");
  if (
    emptyMessage &&
    emptyMessage.textContent.includes("Henüz takip ettiğiniz ürün yok")
  ) {
    emptyMessage.remove();
  }

  animateLinkBoxHeight();

  const newCardHTML = createProductCardHTML(newProduct);

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = newCardHTML;
  const newCard = tempDiv.firstElementChild;

  Object.assign(newCard.style, {
    opacity: "0",
    transition: "opacity 0.6s ease-out",
    willChange: "opacity",
  });

  container.appendChild(newCard);

  const img = newCard.querySelector(".itemImg");
  if (img) {
    img.onload = () => {
      console.log("🖼️ Dynamic image loaded:", img.src);
    };
    img.onerror = () => {
      console.error("❌ Dynamic image failed to load:", img.src);

      img.src =
        newProduct.brandLogoSrc ||
        `Images/${newProduct.brand?.toLowerCase() || "zara"}.png`;
    };

    if (img.complete && img.naturalWidth === 0) {
      img.src = img.src;
    }
  }

  requestAnimationFrame(() => {
    setTimeout(() => {
      newCard.style.opacity = "1";

      setTimeout(() => {
        newCard.style.willChange = "auto";
      }, 600);
    }, 100);
  });
}

function showToast(message, type = "success") {
  const existingToasts = document.querySelectorAll(".toast");
  existingToasts.forEach((toast) => toast.remove());

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === "success" ? "#4CAF50" : "#f44336"};
    color: white;
    padding: 12px 24px;
    border-radius: 25px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-size: 14px;
    font-weight: 500;
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "1";
  }, 100);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function addBrandCheckboxListeners() {
  if (!brandCheckboxes) {
    brandCheckboxes = document.querySelectorAll(".checkboxBrand");
  }

  brandCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const label = checkbox.closest(".checkboxLabel");
      label.style.backgroundColor = checkbox.checked
        ? COLORS.BRAND_SELECTED
        : COLORS.BRAND_DEFAULT;

      debouncedBrandSave();
    });
  });
}

async function savePreferences(isGenderSelection = false) {
  if (!isGenderSelection && !selectedGender) return;

  const selectedBrands = [...document.querySelectorAll(".checkboxBrand")]
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);

  const payload = {
    gender: selectedGender,
    brands: selectedBrands,
  };

  try {
    console.log("Tercihler kaydediliyor:", payload);
    const response = await fetchWithCsrf(
      API_ENDPOINTS.UPDATE_USER,
      "POST",
      payload
    );
    console.log("Update-user response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Update-user error response:", errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log("Update-user success:", result);
  } catch (err) {
    ErrorHandler.handle(err, "savePreferences");
  }
}

async function initializePage() {
  console.log("Dashboard InitializePage başlatıldı");

  addedItemsContainer = document.querySelector(".addedItemBoxes");
  if (!addedItemsContainer) {
    console.error("❌ addedItemsContainer bulunamadı!");
    return;
  }
  console.log("✅ addedItemsContainer bulundu:", addedItemsContainer);

  addedItemsContainer.addEventListener("click", (e) => {
    if (e.target.id === "removeItem" || e.target.id === "removeItemImg") {
      e.preventDefault();
      e.stopPropagation();

      const productCard = e.target.closest(".addedItemBox");
      if (productCard) {
        const productId = productCard.getAttribute("data-id");
        const productTitle =
          productCard.querySelector(".itemTitle")?.textContent || "Bu ürün";
        if (productId) {
          showRemoveConfirmation(productId, productTitle);
        }
      }
    }
  });

  const addButton = document.querySelector(".addButton");
  const linkInput = document.querySelector(".linkInput");

  if (addButton) {
    addButton.addEventListener("click", handleAddProduct);
    console.log("✅ Add button event listener eklendi");
  } else {
    console.error("❌ Add button bulunamadı!");
  }

  if (linkInput) {
    linkInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddProduct();
      }
    });
    console.log("✅ Link input event listener eklendi");
  } else {
    console.error("❌ Link input bulunamadı!");
  }

  renderBrandButtons(brandButtonsContainer);
  addBrandCheckboxListeners();

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

    if (
      sessionData.email &&
      (!email || email === "null" || email === "undefined")
    ) {
      StorageUtils.set("userEmail", sessionData.email);
      console.log("Email session'dan storage'a kaydedildi:", sessionData.email);
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

      if (!selectedGender) {
        console.log(
          "Gender seçilmemiş, gender-selection sayfasına yönlendiriliyor..."
        );
        window.location.replace(ROUTES.CATEGORY);
        return;
      }

      console.log("Dashboard içeriği gösteriliyor...");

      const brandCheckboxes = document.querySelectorAll(".checkboxBrand");
      brandCheckboxes.forEach((cb) => {
        if (data.brands.includes(cb.value)) {
          cb.checked = true;
          cb.closest(".checkboxLabel").style.backgroundColor =
            COLORS.BRAND_SELECTED;
        }
      });

      await loadUserTrackedProducts();
    } else {
      console.error("Kullanıcı bilgileri alınamadı:", data.error);
      StorageUtils.clear();
      window.location.replace(ROUTES.INDEX);
    }
  } catch (err) {
    ErrorHandler.handle(err, "initializePage");
  }
}

async function loadUserTrackedProducts() {
  const timestamp = new Date().toISOString();
  console.log(`🟢 [${timestamp}] loadUserTrackedProducts BAŞLADI`);

  if (isLoadingProducts) {
    console.log(
      `⚠️ [${timestamp}] loadUserTrackedProducts zaten çalışıyor, atlanıyor...`
    );
    return;
  }

  if (!addedItemsContainer) {
    console.error("❌ addedItemsContainer henüz initialize edilmemiş!");
    return;
  }

  isLoadingProducts = true;

  try {
    console.log(`🔄 [${timestamp}] Takip edilen ürünler yükleniyor...`);
    console.log("📦 Container:", addedItemsContainer);

    addedItemsContainer.innerHTML =
      '<div style="text-align: center; padding: 20px; color: #666;">Takip edilen ürünler yükleniyor...</div>';

    console.log("🔄 fetchTrackedProducts çağrılıyor...");
    const response = await fetchTrackedProducts();
    console.log("📡 API Response:", response);

    if (response.success && response.products && response.products.length > 0) {
      currentProducts = response.products;
      console.log(
        "✅ Takip edilen ürünler yüklendi:",
        currentProducts.length,
        "ürün"
      );
      console.log("📦 Ürün detayları:", currentProducts);
      renderProductCards(addedItemsContainer, currentProducts);
    } else {
      console.log("📝 Henüz takip edilen ürün bulunmuyor");
      console.log("🔍 Response detayları:", response);
      renderProductCards(addedItemsContainer, []);
      currentProducts = [];
    }

    animateLinkBoxHeight();
  } catch (error) {
    console.error("❌ Takip edilen ürünler yüklenirken hata:", error);
    addedItemsContainer.innerHTML =
      '<div style="width: 40rem;position: relative;text-align: center;padding: 40px;color: #666;left: 50%;">Ürünler yüklenirken hata oluştu.</div>';
  } finally {
    isLoadingProducts = false;
  }
}

async function handleAddProduct() {
  const linkInput = document.querySelector(".linkInput");
  const addButton = document.querySelector(".addButton");

  if (!linkInput || !addButton) {
    console.error("Link input veya add button bulunamadı");
    return;
  }

  const productUrl = linkInput.value.trim();

  if (!productUrl) {
    showToast("Lütfen bir ürün linki girin.", "error");
    return;
  }

  if (
    !productUrl.includes("zara.com") &&
    !productUrl.includes("bershka.com") &&
    !productUrl.includes("stradivarius.com")
  ) {
    showToast(
      "Sadece Zara, Bershka ve Stradivarius ürün linkleri desteklenmektedir.",
      "error"
    );
    return;
  }

  addButton.disabled = true;
  addButton.textContent = "Ekleniyor...";
  addButton.style.opacity = "0.6";

  try {
    console.log("🔄 Ürün ekleniyor:", productUrl);

    const response = await trackProduct(productUrl);

    if (response.success) {
      console.log("✅ Ürün başarıyla eklendi:", response);
      console.log("🔍 Product detayları:", response.product);
      console.log("🔍 Product keys:", Object.keys(response.product || {}));

      linkInput.value = "";

      const productName =
        response.product.title || response.product.name || "Ürün";
      showToast(`${productName} takip listesine eklendi!`, "success");

      const isBershka = productUrl.includes("bershka.com");
      const isStradivarius = productUrl.includes("stradivarius.com");
      const isZara = productUrl.includes("zara.com");

      if (response.product.imageUrl || response.product.image_url) {
        const imageUrl =
          response.product.imageUrl || response.product.image_url;
        const imageKey = `product_image_${
          response.product.id || response.product.product_id
        }`;

        let originalImageUrl = imageUrl;
        if (imageUrl.includes("/api/image-proxy?url=")) {
          const urlParam = imageUrl.split("url=")[1];
          if (urlParam) {
            originalImageUrl = decodeURIComponent(urlParam);
          }
        }
        localStorage.setItem(imageKey, originalImageUrl);
        console.log(
          `💾 Orijinal fotoğraf URL localStorage'a kaydedildi: ${imageKey} -> ${originalImageUrl}`
        );
      }

      let brandLogo, defaultImage, brandName;
      if (isBershka) {
        brandLogo = "Images/bershka.png";
        defaultImage = "Images/bershka.png";
        brandName = "Bershka";
      } else if (isStradivarius) {
        brandLogo = "Images/stradivarius.png";
        defaultImage = "Images/stradivarius.png";
        brandName = "Stradivarius";
      } else {
        brandLogo = "Images/zara.png";
        defaultImage = "Images/zara.png";
        brandName = "Zara";
      }

      const newProductForUI = {
        id: response.product.id || response.product.product_id,
        imgSrc:
          response.product.imageUrl ||
          response.product.imgSrc ||
          response.product.image_url ||
          defaultImage,
        brandLogoSrc: brandLogo,
        title: response.product.title || response.product.name,
        brand: brandName,
        addedPrice:
          response.product.formattedPrice ||
          response.product.price ||
          response.product.sale_price ||
          "Fiyat yükleniyor...",
        productUrl:
          response.product.productUrl || response.product.product_url || "#",
      };

      console.log("🖼️ Yeni ürün UI objesi:", newProductForUI);
      console.log("🖼️ Ürün imageUrl:", response.product.imageUrl);

      currentProducts.push(newProductForUI);

      const hasExistingProducts =
        addedItemsContainer.children.length > 0 &&
        !addedItemsContainer.querySelector('div[style*="text-align: center"]');

      if (!hasExistingProducts) {
        renderProductCards(addedItemsContainer, currentProducts);
      } else {
        addProductWithAnimation(addedItemsContainer, newProductForUI);
      }
    } else {
      console.error("❌ Ürün eklenemedi:", response.message);
      showToast(
        response.message || "Ürün eklenirken bir hata oluştu.",
        "error"
      );
    }
  } catch (error) {
    console.error("❌ Ürün eklenirken hata:", error);
    showToast(error.message || "Ürün eklenirken bir hata oluştu.", "error");
  } finally {
    addButton.disabled = false;
    addButton.textContent = "Ekle";
    addButton.style.opacity = "1";
  }
}

function showRemoveConfirmation(productId, productTitle) {
  const confirmationToast = document.createElement("div");
  confirmationToast.id = `confirmation-${Date.now()}`;
  confirmationToast.innerHTML = `
    <div style="
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      max-width: 380px;
      text-align: center;
    ">
      <div style="margin-bottom: 15px; color: #333; font-size: 16px;">
        Silmek istediğinize emin misiniz?
      </div>
      <div style="display: flex; gap: 10px; justify-content: center;">
        <button class="cancel-btn" data-toast-id="${confirmationToast.id}" style="
          background: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 8px 16px;
          cursor: pointer;
          font-size: 14px;
        ">İptal</button>
        <button class="confirm-btn" data-product-id="${productId}" data-toast-id="${confirmationToast.id}" style="
          background: #ff4444;
          color: white;
          border: none;
          border-radius: 6px;
          padding: 8px 16px;
          cursor: pointer;
          font-size: 14px;
        ">Evet</button>
      </div>
    </div>
  `;

  confirmationToast.style.cssText = `
    position: fixed;
    bottom: 20%;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10001;
    animation: slideUp 0.3s ease-out;
  `;

  const cancelBtn = confirmationToast.querySelector(".cancel-btn");
  const confirmBtn = confirmationToast.querySelector(".confirm-btn");

  cancelBtn.addEventListener("click", () => {
    removeConfirmationToast(confirmationToast.id);
  });

  confirmBtn.addEventListener("click", async () => {
    const productId = confirmBtn.dataset.productId;
    removeConfirmationToast(confirmationToast.id);
    await handleRemoveProduct(productId);
  });

  document.body.appendChild(confirmationToast);

  setTimeout(() => {
    if (document.getElementById(confirmationToast.id)) {
      removeConfirmationToast(confirmationToast.id);
    }
  }, 10000);
}

function removeConfirmationToast(toastId) {
  const toast = document.getElementById(toastId);
  if (toast) {
    toast.style.animation = "slideDown 0.3s ease-in";
    setTimeout(() => toast.remove(), 300);
  }
}

async function handleRemoveProduct(productId) {
  try {
    const product = currentProducts.find((p) => p.id === productId);
    const isBershka = product && product.brand === "Bershka";

    let response;
    if (isBershka) {
      response = await untrackBershkaProduct(productId);
    } else {
      response = await untrackProduct(productId);
    }

    if (response.success) {
      showToast("Ürün takip listesinden kaldırıldı.", "success");

      const productElement = document.querySelector(`[data-id="${productId}"]`);
      if (productElement) {
        productElement.style.transition = "opacity 0.3s ease-out";
        productElement.style.opacity = "0";

        setTimeout(() => {
          productElement.remove();

          currentProducts = currentProducts.filter(
            (product) => product.id !== productId
          );

          if (currentProducts.length === 0) {
            renderProductCards(addedItemsContainer, []);
          }

          animateLinkBoxHeight();
        }, 300);
      }
    } else {
      showToast("Ürün kaldırılırken bir hata oluştu.", "error");
    }
  } catch (error) {
    console.error("❌ Ürün kaldırılırken hata:", error);
    showToast("Ürün kaldırılırken hata oluştu.", "error");
  }
}

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

async function logout() {
  console.log("Logout başlatılıyor...");

  try {
    const response = await fetch(API_ENDPOINTS.LOGOUT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      console.log("Server logout başarılı");
    }
  } catch (error) {
    console.log("Server logout error:", error);
  }

  StorageUtils.clear();
  sessionStorage.clear();

  document.cookie.split(";").forEach(function (c) {
    document.cookie = c
      .replace(/^ +/, "")
      .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
  });

  window.location.replace(ROUTES.INDEX);
}

menuButton.addEventListener("click", function (e) {
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

document.addEventListener("click", function (e) {
  if (!menuButton.contains(e.target) && !menuDropdown.contains(e.target)) {
    DOMUtils.removeClass("menuDropdown", UI_STATES.MENU_VISIBLE);
    DOMUtils.addClass("menuDropdown", UI_STATES.MENU_HIDDEN);
  }
});

editCategoryButton.addEventListener("click", function (e) {
  e.preventDefault();
  e.stopPropagation();

  if (editCategoryButton.disabled) return;
  DOMUtils.setDisabled("editCategoryButton", true);
  DOMUtils.setOpacity("editCategoryButton", COLORS.BUTTON_DISABLED);
  DOMUtils.setText("editCategoryButton", "Yönlendiriliyor...");

  DOMUtils.removeClass("menuDropdown", UI_STATES.MENU_VISIBLE);
  DOMUtils.addClass("menuDropdown", UI_STATES.MENU_HIDDEN);

  setTimeout(() => {
    window.location.href = `${ROUTES.CATEGORY}?edit=true`;
  }, DELAYS.MENU_REDIRECT);
});

logoutButton.addEventListener("click", function (e) {
  e.preventDefault();
  e.stopPropagation();

  DOMUtils.setDisabled("logoutButton", true);
  DOMUtils.setOpacity("logoutButton", COLORS.BUTTON_LOADING);
  DOMUtils.setText("logoutButton", "Çıkış yapılıyor...");

  DOMUtils.removeClass("menuDropdown", UI_STATES.MENU_VISIBLE);
  DOMUtils.addClass("menuDropdown", UI_STATES.MENU_HIDDEN);

  logout();
});

if (form) {
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    console.log("🚫 Form submit önlendi - handleAddProduct çağırılıyor");
    handleAddProduct();
  });
}

window.addEventListener("DOMContentLoaded", initializePage);
