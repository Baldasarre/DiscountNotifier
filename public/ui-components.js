const brandsData = [
  { value: "Zara", logo: "Images/zara.png" },
  { value: "Mango", logo: "Images/mango.png" },
  { value: "Massimo_Dutti", logo: "Images/Massimo_Dutti.png" },
  { value: "Oysho", logo: "Images/oysho.png" },
  { value: "Stradivarius", logo: "Images/stradivarius.png" },
  { value: "Bershka", logo: "Images/bershka.png" },
  { value: "H&M", logo: "Images/hm.png" },
  { value: "Pull&Bear", logo: "Images/pb.png" },
];

const userTrackedProducts = [];

export function renderBrandButtons(container) {
  const html = brandsData
    .map(
      (brand) => `
    <label class="checkboxLabel">
      <input class="checkboxBrand" type="checkbox" name="brands" value="${brand.value}" />
      <img class="brandLogos" src="${brand.logo}" alt="${brand.value}" />
    </label>
  `
    )
    .join("");
  container.innerHTML = html;
}

export function createProductCardHTML(product) {
  const priceText =
    product.formattedPrice ||
    product.addedPrice ||
    product.price ||
    "Fiyat bilgisi yok";
  const brandLogo =
    product.brandLogoSrc || `Images/${product.brand || "zara"}.png`;

  let imgSrc =
    product.imageUrl ||
    product.imgSrc ||
    `Images/${product.brand || "zara"}.png`;

  if (product.brand === "Bershka") {
    console.log(`🔍 Bershka ürünü: ${product.id}`, {
      productUrl: product.productUrl,
      hasProductUrl: !!product.productUrl,
      brand: product.brand,
    });
  }

  return `
      <div class="addedItemBox" data-id="${product.id}" data-product-id="${
    product.id
  }">
        <img class="itemImg" src="${imgSrc}" alt="${product.title}" />
        <div class="addedItemButtonsAndInfoBox">
          <div class="addedItemInfoBox">
            <img class="itemBrandImg" src="${brandLogo}" alt="${
    product.brand || "Zara"
  }" />
            <button onclick="window.open('${
              product.productUrl
            }', '_blank')" id="goToTheProduct" class="itemButtons">
              Ürüne Git
            </button>
            <button id="removeItem"><img id="removeItemImg" src="Images/close-icon.png" alt="Kaldır"></button>
          </div>
          <h1 class="itemTitle">${product.title}</h1>
          <p class="itemInfo">${priceText}</p>
        </div>
      </div>`;
}

export function renderProductCards(container, products) {
  if (!container) {
    console.error("Container bulunamadı");
    return;
  }

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div style="width: 40rem;position: relative;text-align: center;padding: 40px;color: #666;left: 50%;">
        <h3>Henüz takip ettiğin ürün yok</h3>
        <p>Yukarıdaki alana bir ürünün linkini yapıştırarak takip etmeye başlayabilirsin.</p>
      </div>
      
    `;
    return;
  }

  console.log("🎨 Ürünler render ediliyor:", products.length, "ürün");
  console.log(
    "🔍 Ürün ID'leri:",
    products.map((p) => p.id)
  );

  const ids = products.map((p) => p.id);
  const uniqueIds = [...new Set(ids)];
  if (ids.length !== uniqueIds.length) {
    console.warn("⚠️ DUPLICATE ÜRÜNLER BULUNDU!");
    console.log("Tüm ID'ler:", ids);
    console.log("Unique ID'ler:", uniqueIds);
  }

  const allCardsHTML = products
    .map((product) => createProductCardHTML(product))
    .join("");
  container.innerHTML = allCardsHTML;
}

export { userTrackedProducts };
