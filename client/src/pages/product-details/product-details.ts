import "../../i18n/auto";
/* 3220089_3220172 */

import { initNav } from "../../components/initNav";
import { initMobileMenu } from "../../components/menu";
import { updateCartBadge } from "../../utils/cart-badge";
import {
  getProductById,
  getProducts,
  type Product,
  type ProductVariant,
  type ProductReview,
  getColorImages,
} from "../../services/products";
import { addCartItem } from "../../services/cart";
import { firebaseAuth } from "../../services/firebase";
import { getOrders } from "../../services/orders";
import { createProductReview, getProductReviews } from "../../services/reviews";

import { showToast } from "../../utils/toast.ts";
import { productPath, t } from "../../i18n/locale";
import { STORE_NAME } from "../../config/store";


initNav();
initMobileMenu();
void updateCartBadge();

let selectedVariantStock = 0;
let quantity = 1;

function getQueryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function setText(el: HTMLElement | null, text: string): void {
  if (el) el.textContent = text;
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}



function openExistingCartDrawer(): void {
  const cartLink = document.querySelector<HTMLElement>(
    "[data-cart-link], .cart-link"
  );
  cartLink?.click();
}

function getProductImage(product: Product): string {
  return product.image || product.images?.[0] || "";
}

function isInStock(product: Product, variant?: ProductVariant): boolean {
  if (variant) return Number(variant.stock || 0) > 0;

  if (typeof product.stock === "number") return product.stock > 0;

  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants.some((item) => Number(item.stock || 0) > 0);
  }

  return true;
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function productUrl(product: Product): string {
  const identifier = product.slug || product.id;
  return productPath(identifier);
}

function getFallbackReviews(_product: Product): ProductReview[] {
  return [];
}

function renderReviews(reviews: ProductReview[]): void {
  const reviewsList = document.getElementById("reviewsList");
  const reviewLinkText = document.getElementById("reviewLinkText");
  const productStars = document.getElementById("productStars");

  if (reviewLinkText) {
    reviewLinkText.textContent = `${reviews.length} reviews`;
  }

  if (productStars) {
    const average =
      reviews.length > 0
        ? Math.round(
            reviews.reduce((sum, review) => sum + review.rating, 0) /
              reviews.length
          )
        : 0;

    productStars.textContent = "★".repeat(average) + "☆".repeat(5 - average);
  }

  if (!reviewsList) return;

  if (reviews.length === 0) {
    reviewsList.innerHTML = `<p class="meta">No reviews yet.</p>`;
    return;
  }

  reviewsList.innerHTML = reviews
    .map(
      (review) => `
        <article class="review-card">
          <strong>${safeProductText(review.name)}</strong>
          <div class="review-stars">
            ${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}
          </div>
          <p>${safeProductText(review.comment)}</p>
          ${review.verifiedPurchase ? '<small class="verified-review">Verified purchase</small>' : ""}
        </article>
      `
    )
    .join("");
}

async function setupReviewForm(productId: string): Promise<void> {
  const form = document.getElementById("reviewForm") as HTMLFormElement | null;
  const eligibility = document.getElementById("reviewEligibility");
  if (!form || !eligibility) return;

  const user = firebaseAuth.currentUser;
  if (!user) {
    eligibility.textContent = "Sign in and purchase this product to leave a review.";
    return;
  }

  const orders = await getOrders();
  const hasPurchased = orders.some(
    (order) =>
      order.paymentStatus === "paid" &&
      order.items?.some(
        (item) => String(item.productId || item.id) === String(productId)
      )
  );

  if (!hasPurchased) {
    eligibility.textContent = "A completed purchase is required to leave a review.";
    return;
  }

  form.hidden = false;
  eligibility.textContent = "You purchased this product. Share your experience.";
  const nameInput = form.elements.namedItem("name") as HTMLInputElement | null;
  if (nameInput && !nameInput.value) {
    nameInput.value = user.displayName || user.email?.split("@")[0] || "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const button = form.querySelector<HTMLButtonElement>("button[type='submit']");
    if (button) button.disabled = true;

    try {
      await createProductReview(productId, {
        name: String(data.get("name") || "").trim(),
        rating: Number(data.get("rating") || 0),
        comment: String(data.get("comment") || "").trim(),
      });
      const reviews = await getProductReviews(productId);
      renderReviews(reviews);
      form.reset();
      if (nameInput) nameInput.value = user.displayName || user.email?.split("@")[0] || "";
      eligibility.textContent = "Your verified review was added.";
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to submit review.");
    } finally {
      if (button) button.disabled = false;
    }
  });
}

function safeProductText(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Only exact color AND size may be selected. Never match by size alone. */
function setupVariantControls(
  product: Product,
  onColorChanged: (color: string) => void
): () => ProductVariant | undefined {
  const wrapper = document.getElementById("variantControls") as HTMLElement | null;
  const sizeOptions = document.getElementById("sizeOptions");
  const sizeLabel = document.getElementById("selectedSizeText");
  const colorRow = document.getElementById("productColorRow");
  const colorOptions = document.getElementById("productColorOptions");
  const colorLabel = document.getElementById("selectedColorText");
  const stockEl = document.getElementById("productStock");
  const addButton = document.getElementById("productAddToCartBtn") as HTMLButtonElement | null;
  const variants = product.variants || [];
  if (!wrapper || !variants.length) {
    if (wrapper) wrapper.hidden = true;
    return () => undefined;
  }

  const colors = unique([
    ...(product.colorOptions || []).map(x => x.name),
    ...variants.map(x => x.color),
  ]);
  const selectableColors = colors.length ? colors : [""];
  const firstAvailable = variants.find(v => Number(v.stock || 0) > 0);
  let selectedColor = selectableColors.find(c => c.toLowerCase() === String(product.defaultColor || "").toLowerCase())
    || firstAvailable?.color || selectableColors[0];
  const variantsForColor = () =>
    variants.filter(
      v =>
        String(v.color || "").toLowerCase() ===
        selectedColor.toLowerCase()
    );

  const productHasSizes =
    product.category === "tshirt" &&
    variants.some(
      variant =>
        String(variant.size || "").trim().length > 0
    );

  const sizesForColor = () =>
    unique(variantsForColor().map(v => v.size));

  let selectedSize = "";

  const getSelectedVariant = () => {
    const candidates = variantsForColor();

    if (!productHasSizes) {
      return (
        candidates.find(
          variant => Number(variant.stock || 0) > 0
        ) ||
        candidates[0]
      );
    }

    return selectedSize
      ? candidates.find(
          v => String(v.size || "") === selectedSize
        )
      : undefined;
  };

  function redraw(): void {
    const candidates = variantsForColor();

    if (
      selectedSize &&
      !candidates.some(
        v => String(v.size || "") === selectedSize
      )
    ) {
      selectedSize = "";
    }

    const sizes = sizesForColor();
    if (sizeOptions) {
      sizeOptions.innerHTML = sizes.map(size => {
        const variant = candidates.find(v => v.size === size);
        const available = Number(variant?.stock || 0) > 0;
        return `<button type="button" data-size="${safeProductText(size)}" class="option-btn ${size === selectedSize ? "active" : ""} ${available ? "" : "out-of-stock"}" ${available ? "" : "disabled"} aria-pressed="${size === selectedSize}">${safeProductText(size)}</button>`;
      }).join("");
      sizeOptions.hidden =
        !productHasSizes ||
        !sizes.length;
    }

    const sizeRow =
      wrapper?.querySelector<HTMLElement>(
        ".size-row"
      );

    if (sizeRow) {
      sizeRow.hidden =
        !productHasSizes ||
        !sizes.length;
    }

    if (sizeLabel) {
      sizeLabel.textContent =
        productHasSizes
          ? (
              selectedSize ||
              (
                sizes.length === 1
                  ? "Select"
                  : "Select a size"
              )
            )
          : "";
    }
    if (colorRow) colorRow.hidden = colors.length === 0;
    if (colorLabel) colorLabel.textContent = selectedColor || "Default";
    if (colorOptions) {
      colorOptions.innerHTML = selectableColors.map(color => {
        const option = product.colorOptions?.find(c => c.name.toLowerCase() === color.toLowerCase());
        const available = variants.some(v => String(v.color || "").toLowerCase() === color.toLowerCase() && Number(v.stock || 0) > 0);
        const hex = /^#[0-9a-fA-F]{6}$/.test(option?.hex || "") ? option!.hex :
          ({white:"#ffffff",black:"#111111",natural:"#e7decb"} as Record<string,string>)[color.toLowerCase()] || "#d5d5d5";
        return `<button type="button" class="product-color-swatch ${selectedColor === color ? "is-selected" : ""}" data-product-color="${safeProductText(color)}" aria-label="Color ${safeProductText(color || "Default")}" aria-pressed="${selectedColor === color}" ${available ? "" : "disabled"}><span class="product-color-swatch__dot" style="--swatch-color:${hex}"></span><span>${safeProductText(color || "Default")}</span></button>`;
      }).join("");
    }
    const variant = getSelectedVariant();
    const availableInColor = candidates.some(
      candidate => Number(candidate?.stock || 0) > 0
    );

    selectedVariantStock = Number(variant?.stock || 0);

    if (
      selectedVariantStock > 0 &&
      quantity > selectedVariantStock
    ) {
      quantity = 1;
    }

    const quantityText = document.getElementById("quantityValue");
    if (quantityText) quantityText.textContent = String(quantity);

    if (stockEl) {
      if (productHasSizes && !selectedSize) {
        stockEl.textContent =
          availableInColor
            ? "Select a size"
            : "Out of stock";

        stockEl.style.color =
          availableInColor
            ? "#6b6b65"
            : "#b42318";
      } else {
        stockEl.textContent =
          selectedVariantStock > 0
            ? "In stock"
            : "Out of stock";

        stockEl.style.color =
          selectedVariantStock > 0
            ? "#129447"
            : "#b42318";
      }
    }

    if (addButton) {
      addButton.disabled = !availableInColor;
    }
  }

  sizeOptions?.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-size]");
    if (!button || button.disabled) return;
    selectedSize = button.dataset.size || "";
    redraw();
  });
  colorOptions?.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-product-color]");
    if (!button || button.disabled) return;
    selectedColor =
      button.dataset.productColor || "";

    if (productHasSizes) {
      selectedSize = "";
    }

    onColorChanged(selectedColor);
    redraw();
  });
  wrapper.hidden = false;
  onColorChanged(selectedColor);
  redraw();
  return getSelectedVariant;
}

async function renderRelatedProducts(currentProduct: Product): Promise<void> {
  const relatedProductsEl = document.getElementById("relatedProducts");
  if (!relatedProductsEl) return;

  try {
    const products = await getProducts();

    const related = products
      .filter(
        (item) =>
          item.id !== currentProduct.id &&
          item.active !== false &&
          item.category === "accessory"
      )
      .sort(() => Math.random() - 0.5)
      .slice(0, 4);

    if (related.length === 0) {
      relatedProductsEl.innerHTML = `<p class="meta">No related products found.</p>`;
      return;
    }

    relatedProductsEl.innerHTML = related
      .map((product) => {
        const image = getProductImage(product);

        return `
          <a
            href="${productUrl(product)}"
            class="related-product-card"
          >
            <div class="related-product-image">
              ${
                image
                  ? `<img src="${image}" alt="${product.title}" />`
                  : `<div class="related-product-fallback mini-shirt"></div>`
              }
            </div>

            <div class="related-product-body">
              <h3>${product.title}</h3>
              <p class="related-product-price">
                ${
                  Boolean(product.onSale) &&
                  Number(product.originalPrice ?? product.price) > product.price
                    ? `<span class="related-product-price__old">${formatPrice(Number(product.originalPrice))}</span>`
                    : ""
                }
                <span>${formatPrice(product.price)}</span>
              </p>

              <button
                type="button"
                class="quick-add-btn"
                data-product-id="${product.id}"
                aria-label="Quick add ${product.title} to cart"
              >
                +
              </button>
            </div>
          </a>
        `;
      })
      .join("");

    relatedProductsEl
      .querySelectorAll<HTMLButtonElement>(".quick-add-btn")
      .forEach((btn) => {
        btn.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();

          const productId = btn.dataset.productId;
          const product = related.find((item) => item.id === productId);

          if (!product || !isInStock(product)) {
            showToast("This product is out of stock.");
            return;
          }

          // Multi-color products require explicit selection on Product Details.
          if (unique((product.variants || []).map(v => v.color)).length > 1) {
            window.location.href = productUrl(product);
            return;
          }
          const selectedVariant = product.variants?.find(
            (variant) => Number(variant.stock || 0) > 0
          );

          try {
            btn.disabled = true;
            btn.textContent = "...";

            await addCartItem({
              productId: product.id,
              quantity: 1,
              variant: selectedVariant || null,
            });

            await updateCartBadge();

            btn.classList.add("added");
            btn.textContent = "✓";

            setTimeout(() => {
              btn.disabled = false;
              btn.textContent = "+";
            }, 900);

            openExistingCartDrawer();
          } catch (error: any) {
            console.error("Quick add failed:", error);
            showToast(error?.message || "Failed to add product to cart.");
            btn.disabled = false;
            btn.textContent = "+";
          }
        });
      });
  } catch (error) {
    console.error("Failed to load related products:", error);
    relatedProductsEl.innerHTML = `<p class="meta">Related products could not be loaded.</p>`;
  }
}


function getProductIdentifier(): string | null {
  const queryId = getQueryParam("id") || getQueryParam("productId") || getQueryParam("slug");
  if (queryId) return queryId;

  const match = window.location.pathname.match(/\/product\/([^/]+)$/);
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }

  return null;
}

function removeReviewQueryParams(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("name") && !params.has("rating") && !params.has("comment")) {
    return;
  }

  ["name", "rating", "comment"].forEach((key) => params.delete(key));
  const query = params.toString();
  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname}${query ? `?${query}` : ""}`
  );
}

async function initProductDetailsPage(): Promise<void> {
  removeReviewQueryParams();
  
  const details = document.getElementById("productDetails");
  if (!details) return;

const id = getProductIdentifier();

  const titleEl = document.getElementById("productTitle");
  const metaEl = document.getElementById("productMeta");
  const descEl = document.getElementById("productDescription");
  const priceEl = document.getElementById("productPrice");
  const stockEl = document.getElementById("productStock");
  const badgeEl = document.getElementById("productBadge") as HTMLElement | null;
  const saleBadgeEl = document.getElementById("productSaleBadge") as HTMLElement | null;
  const imageEl = document.getElementById(
    "productImage"
  ) as HTMLImageElement | null;
  const imageFallback = document.getElementById(
    "productImageFallback"
  ) as HTMLElement | null;
  const thumbnailsEl = document.getElementById(
    "productThumbnails"
  ) as HTMLElement | null;
  const addBtn = document.getElementById(
    "productAddToCartBtn"
  ) as HTMLButtonElement | null;

  const quantityValue = document.getElementById("quantityValue");
  const decreaseQty = document.getElementById(
    "decreaseQty"
  ) as HTMLButtonElement | null;
  const increaseQty = document.getElementById(
    "increaseQty"
  ) as HTMLButtonElement | null;

  function updateQuantity(): void {
    if (selectedVariantStock > 0) {
      quantity = Math.min(quantity, selectedVariantStock);
    }

    quantity = Math.max(1, quantity);

    if (quantityValue) {
      quantityValue.textContent = String(quantity);
    }
  }

  decreaseQty?.addEventListener("click", () => {
    quantity = Math.max(1, quantity - 1);
    updateQuantity();
  });

  increaseQty?.addEventListener("click", () => {
    if (selectedVariantStock > 0 && quantity >= selectedVariantStock) {
      quantity = selectedVariantStock;
      updateQuantity();

      showToast(
        `Only ${selectedVariantStock} item${
          selectedVariantStock === 1 ? "" : "s"
        } available in the selected color and size.`
      );
      return;
    }

    quantity += 1;
    updateQuantity();
  });

  updateQuantity();

  if (!id) {
    setText(titleEl, "Product not found");
    setText(descEl, "The product link is invalid.");
    if (addBtn) addBtn.style.display = "none";
    return;
  }

  try {
    const product = await getProductById(id);

    if (!product) {
      throw new Error("Product not found");
    }

    const confirmedProduct: Product = product;

    if (product.active === false) {
  throw new Error("This product is no longer available.");
}

document.title = `${product.title} | ${STORE_NAME}`;



const description =
  product.shortDescription ||
  product.description ||
  "A quality product from ${STORE_NAME}.";


const productIdentifier = product.slug || product.id;
const productUrl = new URL(
  productPath(productIdentifier),
  window.location.origin
).href;

let canonical = document.querySelector<HTMLLinkElement>(
  'link[rel="canonical"]'
);

if (!canonical) {
  canonical = document.createElement("link");
  canonical.rel = "canonical";
  document.head.appendChild(canonical);
}

canonical.href = productUrl;
const productImage =
  product.images?.[0] ||
  product.image ||
  "";

setMetaName("description", description);

setMetaProperty("og:title", `${product.title} | ${STORE_NAME}`);
setMetaProperty("og:description", description);
setMetaProperty("og:image", productImage);
setMetaProperty("og:url", productUrl);
setMetaProperty("og:type", "product");

setMetaName("twitter:title", `${product.title} | ${STORE_NAME}`);
setMetaName("twitter:description", description);
setMetaName("twitter:image", productImage);

injectProductSchema(product);

    setText(titleEl, product.title);
    setText(
      metaEl,
      product.category === "tshirt"
        ? "T-Shirt • Premium quality"
        : "Accessory • Premium quality"
    );
    setText(descEl, product.description || product.shortDescription || "");

    const discountPercent = Math.max(0, Number(product.discountPercent || 0));
    const originalPrice = Number(product.originalPrice ?? product.price);
    const onSale = Boolean(product.onSale) && discountPercent > 0 && originalPrice > product.price;

    if (priceEl) {
      priceEl.innerHTML = onSale
        ? `<span class="product-price__old">${formatPrice(originalPrice)}</span><span class="product-price__current">${formatPrice(product.price)}</span>`
        : `<span class="product-price__current">${formatPrice(product.price)}</span>`;
    }

    setText(stockEl, isInStock(product) ? "In stock" : "Out of stock");

    if (saleBadgeEl && onSale) {
      saleBadgeEl.hidden = false;
      saleBadgeEl.textContent = `-${discountPercent}%`;
    } else if (saleBadgeEl) {
      saleBadgeEl.hidden = true;
      saleBadgeEl.textContent = "";
    }

    if (badgeEl && product.badge) {
      badgeEl.hidden = false;
      badgeEl.textContent = product.badge;
    } else if (badgeEl) {
      badgeEl.hidden = true;
      badgeEl.textContent = "";
    }

    /* =========================================================
   PRODUCT IMAGE GALLERY
   ========================================================= */

let productImages = unique([
  ...(product.images || []),
  product.image,
]);

const firstImage = productImages[0] || "";

const imageStage = document.getElementById(
  "productImageStage"
) as HTMLElement | null;

const imageViewport =
  document.getElementById(
    "productImageViewport"
  ) as HTMLElement | null;

const prevImageBtn = document.getElementById(
  "productImagePrev"
) as HTMLButtonElement | null;

const nextImageBtn = document.getElementById(
  "productImageNext"
) as HTMLButtonElement | null;

let currentImageIndex = 0;


/* -------------------------
   SET MAIN IMAGE
------------------------- */

const setMainImage = (src: string): void => {
  if (!imageEl || !src) return;

  const index = productImages.indexOf(src);

  if (index >= 0) {
    currentImageIndex = index;
  }

  imageEl.src = src;
  imageEl.alt = product.title;
  imageEl.hidden = false;

  /* Reset zoom when changing image */
  imageEl.style.transform = "scale(1)";
  imageEl.style.transformOrigin = "center center";

  imageStage?.classList.remove("is-zooming");

  if (imageFallback) {
    imageFallback.hidden = true;
  }

  thumbnailsEl
    ?.querySelectorAll<HTMLButtonElement>(
      ".product-thumbnail"
    )
    .forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.src === src
      );
    });
};


/* -------------------------
   CHANGE IMAGE BY INDEX
------------------------- */

const showImageAtIndex = (index: number): void => {
  if (productImages.length === 0) return;

  currentImageIndex =
    (index + productImages.length) %
    productImages.length;

  setMainImage(
    productImages[currentImageIndex]
  );
};


const showPreviousImage = (): void => {
  showImageAtIndex(currentImageIndex - 1);
};


const showNextImage = (): void => {
  showImageAtIndex(currentImageIndex + 1);
};


/* -------------------------
   FIRST IMAGE
------------------------- */

if (firstImage) {
  setMainImage(firstImage);
} else if (imageFallback) {
  imageFallback.hidden = false;

  if (imageEl) {
    imageEl.hidden = true;
  }
}


/* -------------------------
   SHOW / HIDE ARROWS
------------------------- */

const hasMultipleImages =
  productImages.length > 1;

if (prevImageBtn) {
  prevImageBtn.hidden = !hasMultipleImages;
}

if (nextImageBtn) {
  nextImageBtn.hidden = !hasMultipleImages;
}


/* -------------------------
   ARROW BUTTONS
------------------------- */

prevImageBtn?.addEventListener(
  "click",
  (event) => {
    event.preventDefault();
    event.stopPropagation();

    showPreviousImage();
  }
);


nextImageBtn?.addEventListener(
  "click",
  (event) => {
    event.preventDefault();
    event.stopPropagation();

    showNextImage();
  }
);


/* Color-specific galleries rebuild thumbnails and keep existing zoom/arrows. */
function renderProductThumbnails(): void {
  const multiple = productImages.length > 1;
  if (prevImageBtn) prevImageBtn.hidden = !multiple;
  if (nextImageBtn) nextImageBtn.hidden = !multiple;
  if (!thumbnailsEl) return;
  thumbnailsEl.hidden = !multiple;
  thumbnailsEl.innerHTML = multiple ? productImages.map((src, index) => `
    <button type="button" class="product-thumbnail ${index === currentImageIndex ? "active" : ""}"
      data-image-index="${index}" data-src="${safeProductText(src)}" aria-label="Show product photo ${index + 1}">
<img src="${safeProductText(src)}" alt="${safeProductText(confirmedProduct.title)} photo ${index + 1}" />
    </button>`).join("") : "";
}
function switchGalleryForColor(color: string): void {
productImages = unique(
  getColorImages(confirmedProduct, color)
);
  currentImageIndex = 0;
  renderProductThumbnails();
  if (productImages.length) setMainImage(productImages[0]);
  else {
    if (imageEl) imageEl.hidden = true;
    if (imageFallback) imageFallback.hidden = false;
  }
  if (productImages[0]) {
    setMetaProperty("og:image", new URL(productImages[0], window.location.origin).href);
    setMetaName("twitter:image", new URL(productImages[0], window.location.origin).href);
  }
}
renderProductThumbnails();
thumbnailsEl?.addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-image-index]");
  if (!button) return;
  showImageAtIndex(Number(button.dataset.imageIndex || 0));
});

/* =========================================================
   DESKTOP ZOOM
   ONLY OVER THE REAL VISIBLE IMAGE
   ========================================================= */

function resetProductZoom(): void {
  if (!imageEl || !imageViewport) return;

  imageEl.style.transform =
    "scale(1)";

  imageEl.style.transformOrigin =
    "center center";

  imageViewport.classList.remove(
    "is-zooming"
  );

  imageViewport.style.cursor =
    "default";
}


function getVisibleImageRect() {
  if (
    !imageEl ||
    !imageViewport ||
    !imageEl.naturalWidth ||
    !imageEl.naturalHeight
  ) {
    return null;
  }

  const container =
    imageViewport.getBoundingClientRect();

  const naturalWidth =
    imageEl.naturalWidth;

  const naturalHeight =
    imageEl.naturalHeight;

  /*
   * Same calculation as object-fit: contain
   */
  const scale = Math.min(
    container.width / naturalWidth,
    container.height / naturalHeight
  );

  const width =
    naturalWidth * scale;

  const height =
    naturalHeight * scale;

  const left =
    container.left +
    (container.width - width) / 2;

  const top =
    container.top +
    (container.height - height) / 2;

  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}


if (
  imageViewport &&
  imageEl
) {

  imageViewport.addEventListener(
    "mousemove",
    (event) => {

      if (
        !window.matchMedia(
          "(hover: hover) and (pointer: fine)"
        ).matches
      ) {
        return;
      }

      if (imageEl.hidden) {
        return;
      }

      const imageRect =
        getVisibleImageRect();

      if (!imageRect) {
        resetProductZoom();
        return;
      }

      /*
       * Is the mouse REALLY over
       * the visible photo?
       */
      const insideImage =
        event.clientX >= imageRect.left &&
        event.clientX <= imageRect.right &&
        event.clientY >= imageRect.top &&
        event.clientY <= imageRect.bottom;

      /*
       * Mouse is inside the container,
       * but NOT over the real photo.
       */
      if (!insideImage) {
        resetProductZoom();
        return;
      }


      /*
       * Now we're actually over
       * visible image pixels.
       */

      imageViewport.classList.add(
        "is-zooming"
      );

      imageViewport.style.cursor =
        "zoom-in";


      const x =
        ((event.clientX -
          imageRect.left) /
          imageRect.width) *
        100;

      const y =
        ((event.clientY -
          imageRect.top) /
          imageRect.height) *
        100;


      imageEl.style.transformOrigin =
        `${x}% ${y}%`;

      imageEl.style.transform =
        "scale(2)";
    }
  );


  imageViewport.addEventListener(
    "mouseleave",
    () => {
      resetProductZoom();
    }
  );
}


/* =========================================================
   KEYBOARD LEFT / RIGHT
   ========================================================= */

if (imageStage) {

  imageStage.setAttribute(
    "tabindex",
    "0"
  );

  imageStage.addEventListener(
    "keydown",
    (event) => {

      if (productImages.length <= 1) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPreviousImage();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNextImage();
      }
    }
  );
}

    try {
      const reviews = await getProductReviews(product.id);
      renderReviews(reviews.length ? reviews : getFallbackReviews(product));
      await setupReviewForm(product.id);
    } catch (reviewError) {
      console.error("Failed to load reviews:", reviewError);
      renderReviews(getFallbackReviews(product));
    }

    const getSelectedVariant = setupVariantControls(product, switchGalleryForColor);
    selectedVariantStock = 0;
    updateQuantity();

    await renderRelatedProducts(product);

    if (addBtn) {
      addBtn.disabled = !isInStock(product, getSelectedVariant());

      addBtn.addEventListener("click", async () => {
        const selectedVariant =
          getSelectedVariant();

        const requiresSizeSelection =
          product.category === "tshirt" &&
          (product.variants || []).some(
            variant =>
              String(
                variant.size || ""
              ).trim().length > 0
          );

        if (
          requiresSizeSelection &&
          !selectedVariant
        ) {
          const originalText =
            addBtn.textContent ||
            "Add to cart";

          addBtn.textContent =
            t("product.chooseSize", "Choose a size");

          document
            .getElementById(
              "sizeOptions"
            )
            ?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });

          window.setTimeout(() => {
            addBtn.textContent =
              originalText;
          }, 1200);

          return;
        }

        if (!isInStock(product, selectedVariant)) {
          showToast("This variant is out of stock.");
          return;
        }

        const availableStock =
          selectedVariant?.stock ?? product.stock ?? selectedVariantStock;

        if (availableStock > 0 && quantity > availableStock) {
          quantity = availableStock;
          updateQuantity();

          showToast(
            `Only ${availableStock} item${
              availableStock === 1 ? "" : "s"
            } available in the selected color and size.`
          );
          return;
        }

        try {
          addBtn.disabled = true;
          addBtn.textContent = t("product.adding", "Adding...");

          await addCartItem({
            productId: product.id,
            quantity,
            variant: selectedVariant || null,
          });

          await updateCartBadge();

          addBtn.textContent =
            t("product.added", "Added to cart!");

          setTimeout(() => {
            addBtn.disabled =
              !isInStock(
                product,
                getSelectedVariant()
              );

            addBtn.textContent =
              t("product.addToCart", "Add to cart");
          }, 900);

          openExistingCartDrawer();
        } catch (error: any) {
          console.error("Failed to add product to cart:", error);
          showToast(error?.message || "Failed to add product to cart.");
          addBtn.disabled = false;
          addBtn.textContent = "Add to cart";
        }
      });
    }
  } catch (error: any) {
    console.error("Failed to load product:", error);

    setText(titleEl, "Error loading product");
    setText(metaEl, "");
    setText(descEl, error?.message || "Failed to load product details.");
    setText(priceEl, "");
    setText(stockEl, "");

    if (addBtn) addBtn.style.display = "none";
  }
}

void initProductDetailsPage();



function injectProductSchema(product: any): void {
  const old = document.getElementById("productJsonLd");
  old?.remove();

  const script = document.createElement("script");
  script.id = "productJsonLd";
  script.type = "application/ld+json";

  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description || product.shortDescription || "",
    image: product.images?.[0] || product.image || "",
    brand: {
      "@type": "Brand",
      name: STORE_NAME
    },
    offers: {
  "@type": "Offer",
  url: window.location.href,
  price: String(product.price || product.priceEUR || 0),
  priceCurrency: "EUR",
  availability: isInStock(product)
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock",
  seller: {
    "@type": "Organization",
    name: "${STORE_NAME}"
  }
}
  });

  document.head.appendChild(script);
}

function setMetaProperty(property: string, content: string): void {
  let meta = document.querySelector<HTMLMetaElement>(
    `meta[property="${property}"]`
  );

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.appendChild(meta);
  }

  meta.content = content;
}

function setMetaName(name: string, content: string): void {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);

  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }

  meta.content = content;
}


