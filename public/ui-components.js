// public/ui-components.js

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

const userTrackedProducts = [
  {
    id: 1, imgSrc: "Images/1.jpg", brandLogoSrc: "Images/zara.png",
    title: "YIKANMIŞ KAPİTONE CEKET", discountStatus: "ÜRÜN HENÜZ İNDİRİME GİRMEDİ",
    addedPrice: "940,00 TL", productUrl: "#",
  },
];

export function renderBrandButtons(container) {
  const html = brandsData.map(brand => `
    <label class="checkboxLabel">
      <input class="checkboxBrand" type="checkbox" name="brands" value="${brand.value}" />
      <img class="brandLogos" src="${brand.logo}" alt="${brand.value}" />
    </label>
  `).join('');
  container.innerHTML = html;
}

export function createProductCardHTML(product) {
    const priceText = product.addedPrice || `Fiyat: ${product.new_price.toFixed(2)} TL`;
    const discountStatusText = product.discountStatus || "TAKİP EDİLİYOR";
    const brandLogo = product.brandLogoSrc || `Images/zara.png`;

    return `
      <div class="addedItemBox" data-id="${product.id}">
        <img class="itemImg" src="${product.imgSrc}" alt="${product.title}" />
        <div class="addedItemButtonsAndInfoBox">
          <div class="addedItemInfoBox">
            <img class="itemBrandImg" src="${brandLogo}" alt="${product.brand || 'Zara'}" />
            <button id="removeItem"><img id="removeItemImg" src="Images/close-icon.png" alt="Kaldır"></button>
          </div>
          <h1 class="itemTitle">${product.title}</h1>
          <h1 class="itemDiscountStatus">${discountStatusText}</h1>
          <p class="itemInfo">${priceText}</p>
          <div class="addedItemImgBoxButtons">
            <button onclick="window.open('${product.productUrl}', '_blank')" id="goToTheProduct" class="itemButtons">
              Ürüne Git
            </button>
          </div>
        </div>
      </div>`;
}

export function renderProductCards(container, products) {
  if (!products || products.length === 0) {
    container.innerHTML = "";
    return;
  }
  const allCardsHTML = products.map(product => createProductCardHTML(product)).join('');
  container.innerHTML = allCardsHTML;
}

export { userTrackedProducts };