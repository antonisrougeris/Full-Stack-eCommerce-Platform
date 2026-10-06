import "../../i18n/auto";
import { localizedPath, productPath, locale, t } from "../../i18n/locale";
/* 3220089_3220172 */

import { initNav } from "../../components/initNav";
import { initMobileMenu } from "../../components/menu";
import {
  updateCartBadge,
  updateCartBadgeFromCart,
} from "../../utils/cart-badge";
import {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  updateCartGiftOptions,
  type Cart,
  type CartItem,
} from "../../services/cart";
import { getProducts, getColorImages, type Product } from "../../services/products";
import "./cart-enhancements.css";

initNav();
initMobileMenu();

const FREE_SHIPPING_TARGET = 50;
const FREE_STICKERS_TARGET = 80;
const PREMIUM_GIFT_PRICE = 1.5;

function getGiftTier(cart: Cart | null | undefined): "none" | "simple" | "premium" {
  const tier = cart?.giftOptions?.tier;
  if (tier === "simple" || tier === "premium" || tier === "none") {
    return tier;
  }
  return cart?.giftOptions?.giftBox ? "premium" : "none";
}

let currentCart: Cart | null = null;
let catalogCache: Product[] | null = null;

function showToast(message: string): void {
  let stack = document.getElementById("toastStack");

  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toastStack";
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }

  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = message;
  stack.appendChild(toast);

  setTimeout(() => {
    toast.remove();
    if (stack && stack.children.length === 0) stack.remove();
  }, 3000);
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getProductImage(product: Product): string {
  return product.image || product.images?.[0] || "";
}

function getCartItems(cart: Cart | null | undefined): CartItem[] {
  if (!cart || !Array.isArray(cart.items)) return [];
  return cart.items;
}

function getCartTotal(cart: Cart | null | undefined): number {
  if (!cart) return 0;

  if (typeof cart.subtotal === "number") {
    return cart.subtotal;
  }

  return getCartItems(cart).reduce((sum, item) => {
    const price = Number( item.price ?? 0);
    const quantity = Number(item.quantity || 0);
    return sum + price * quantity;
  }, 0);
}

function getCartCount(cart: Cart | null | undefined): number {
  if (!cart) return 0;

  if (typeof cart.totalItems === "number") {
    return cart.totalItems;
  }

  return getCartItems(cart).reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );
}

function updateCartHeaderCount(cart: Cart | null | undefined): void {
  const count = getCartCount(cart);

  document
    .querySelectorAll<HTMLElement>(".cart-header h2")
    .forEach((title) => {
      title.textContent = `${t("cart.title", "YOUR CART")} (${count})`;
    });
}

function getCartItemKey(item: CartItem, index: number): string {
  return String(item.id || index);
}

function getCartItemProductId(item: CartItem): string {
  if (typeof item.productId === "string") return item.productId;

  if (item.productId && typeof item.productId === "object") {
    return item.productId ||  "";
  }

  return "";
}

function getCartItemTitle(item: CartItem): string {
  if (item.title) return item.title;
  if (item.title) return item.title;
  return "Product";
}

function getCartItemImage(item: CartItem, catalog: Product[] = []): string {
  const product = catalog.find(p => p.id === item.productId || p._id === item.productId);
  const color = getCartItemVariant(item)?.color || "";
  const exactOption = product?.colorOptions?.find(c => c.name.toLowerCase() === color.toLowerCase());
  if (exactOption?.images?.[0]) return exactOption.images[0];
  if (item.image) return item.image;
  return product ? getColorImages(product, color)[0] || "/assets/img/logo_Image.png" : "/assets/img/logo_Image.png";
}

function getCartItemUnitPrice(item: CartItem): number {
  if (typeof item.price === "number") return item.price;
  if (typeof item.price === "number") return item.price;
  if (typeof item.priceEUR === "number") return item.priceEUR;
  if (typeof item.price === "number") return item.price;
  if (typeof item.priceEUR === "number") return item.priceEUR;
  return 0;
}

function getCartItemVariant(item: CartItem) {
  return item.variant || item.selectedVariant || null;
}


function getItemAvailableStock(item: CartItem): number {
  const variant = getCartItemVariant(item);

  if (variant && typeof variant.stock === "number") {
    return variant.stock;
  }

  if (typeof item.variant?.stock === "number") {
    return item.variant.stock;
  }

  return 99;
}

function updateProgress(total: number): string {
  let percent = 0;

  if (total < FREE_SHIPPING_TARGET) {
    percent = (total / FREE_SHIPPING_TARGET) * 50;
  } else if (total < FREE_STICKERS_TARGET) {
    percent =
      50 +
      ((total - FREE_SHIPPING_TARGET) /
        (FREE_STICKERS_TARGET - FREE_SHIPPING_TARGET)) *
        50;
  } else {
    percent = 100;
  }

  percent = Math.min(percent, 100);

  const isShippingDone = total >= FREE_SHIPPING_TARGET;
  const isStickerDone = total >= FREE_STICKERS_TARGET;

  let message = "";

  if (total < FREE_SHIPPING_TARGET) {
    message = `${t("cart.only", "Only")} ${formatPrice(
      FREE_SHIPPING_TARGET - total
    )} ${t("cart.awayFreeShipping", "away from free shipping")}`;
  } else if (total < FREE_STICKERS_TARGET) {
    message = `${t("cart.add", "Add")} ${formatPrice(
      FREE_STICKERS_TARGET - total
    )} ${t("cart.moreFreeStickers", "more and get a Sticker Set for free")}`;
  } else {
    message = t("cart.rewardsUnlocked", "You unlocked all rewards");
  }

  return `
    <div class="cart-progress-new">
      <p>${message}</p>

      <div class="progress-bar">
        <div class="progress-fill" style="width:${percent}%"></div>

        <div class="progress-step step-1 ${isShippingDone ? "done" : ""}">
          <div class="icon">
            <svg viewBox="0 0 512 512" width="18" height="18">
              <path d="M386.689 304.403c-35.587 0-64.538 28.951-64.538 64.538s28.951 64.538 64.538 64.538c35.593 0 64.538-28.951 64.538-64.538s-28.951-64.538-64.538-64.538zm0 96.807c-17.796 0-32.269-14.473-32.269-32.269s14.473-32.269 32.269-32.269 32.269 14.473 32.269 32.269-14.473 32.269-32.269 32.269zm-220.504-96.807c-35.587 0-64.538 28.951-64.538 64.538s28.951 64.538 64.538 64.538 64.538-28.951 64.538-64.538-28.951-64.538-64.538-64.538zm0 96.807c-17.796 0-32.269-14.473-32.269-32.269s14.473-32.269 32.269-32.269 32.269 14.473 32.269 32.269-14.473 32.269-32.269 32.269zM430.15 119.675c-2.743-5.448-8.32-8.885-14.419-8.885h-84.975v32.269h75.025l43.934 87.384 28.838-14.5-48.403-96.268z"/>
              <path d="M216.202 353.345h122.084v32.269H216.202zm-98.421 0H61.849c-8.912 0-16.134 7.223-16.134 16.134s7.223 16.134 16.134 16.134h55.933c8.912 0 16.134-7.223 16.134-16.134s-7.223-16.134-16.135-16.134zm390.831-98.636l-31.736-40.874c-3.049-3.937-7.755-6.239-12.741-6.239H346.891V94.655c0-8.912-7.223-16.134-16.134-16.134H61.849c-8.912 0-16.134 7.223-16.134 16.134s7.223 16.134 16.134 16.134h252.773V223.73c0 8.912 7.223 16.134 16.134 16.134h125.478l23.497 30.268v83.211h-44.639c-8.912 0-16.134 7.223-16.134 16.134s7.223 16.134 16.134 16.134h60.773c8.912 0 16.134-7.223 16.135-16.134V264.605c0-3.582-1.194-7.067-3.388-9.896zm-391.906 16.888H42.487c-8.912 0-16.134 7.223-16.134 16.134s7.223 16.134 16.134 16.134h74.218c8.912 0 16.134-7.223 16.134-16.134s-7.222-16.134-16.133-16.134zm37.109-63.463H16.134C7.223 208.134 0 215.357 0 224.269s7.223 16.134 16.134 16.134h137.681c8.912 0 16.134-7.223 16.134-16.134s-7.222-16.135-16.134-16.135zm26.353-63.462H42.487c-8.912 0-16.134 7.223-16.134 16.134s7.223 16.134 16.134 16.134h137.681c8.912 0 16.134-7.223 16.134-16.134s-7.222-16.134-16.134-16.134z"/>
            </svg>
          </div>
          <span data-no-i18n>
            <small>FREE</small>
            SHIPPING
          </span>
        </div>

        <div class="progress-step step-2 ${isStickerDone ? "done" : ""}">
          <div class="icon">
            <svg viewBox="0 0 22 22" width="18" height="18">
              <path d="M19.5 6.25h-1.065A2.709 2.709 0 0 0 18.75 5a2.747 2.747 0 0 0-4.876-1.739L12 5.752l-1.881-2.5A2.747 2.747 0 0 0 5.25 5a2.709 2.709 0 0 0 .315 1.25H4.5A2.253 2.253 0 0 0 2.25 8.5V12a.75.75 0 0 0 .75.75h.25V18A3.383 3.383 0 0 0 7 21.75h10A3.383 3.383 0 0 0 20.75 18v-5.25H21a.75.75 0 0 0 .75-.75V8.5a2.253 2.253 0 0 0-2.25-2.25zm.75 2.25v2.75h-7.5v-3.5h6.75a.751.751 0 0 1 .75.75zm-5.211-4.293A1.223 1.223 0 0 1 16 3.75a1.25 1.25 0 0 1 0 2.5h-2.5l1.539-2.043zM6.75 5A1.252 1.252 0 0 1 8 3.75a1.213 1.213 0 0 1 .948.441L10.5 6.25H8A1.252 1.252 0 0 1 6.75 5zm-3 3.5a.751.751 0 0 1 .75-.75h6.75v3.5h-7.5zm1 9.5v-5.25h6.5v7.5H7c-1.577 0-2.25-.673-2.25-2.25zm14.5 0c0 1.577-.673 2.25-2.25 2.25h-4.25v-7.5h6.5z"/>
            </svg>
          </div>
          <span data-no-i18n>
            <small>FREE</small>
            STICKER SET
          </span>
        </div>
      </div>
    </div>
  `;
}

function renderCartItem(item: CartItem, index: number, catalog: Product[] = []): string {
  const variant = getCartItemVariant(item);
  const title = getCartItemTitle(item);
  const image = getCartItemImage(item, catalog);
  const unitPrice = getCartItemUnitPrice(item);
  const itemKey = getCartItemKey(item, index);

  const sizeText = variant?.size ? `<p>${t("cart.size", "Size")}: ${variant.size}</p>` : "";
  const colorText = variant?.color ? `<p>${t("cart.color", "Color")}: ${variant.color}</p>` : "";

  return `
    <article class="drawer-cart-item" data-item-id="${itemKey}">
      <img src="${image}" alt="${title}" />

      <div class="drawer-cart-info">
        <p class="cart-stock-status">
          <span class="cart-stock-dot" aria-hidden="true"></span>
          ${t("cart.inStockReady", "In stock, ready to ship")}
        </p>
        <h3>${title}</h3>
        ${sizeText}
        ${colorText}

        <div class="drawer-qty">
          <button type="button" class="cart-decrease" data-item-id="${itemKey}">−</button>
          <span>${item.quantity}</span>
          <button type="button" class="cart-increase" data-item-id="${itemKey}">+</button>
        </div>
      </div>

      <div class="drawer-cart-price">
        <button type="button" class="cart-remove" data-item-id="${itemKey}">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M11.5 8.25a.75.75 0 0 1 .75.75v4.25a.75.75 0 0 1-1.5 0v-4.25a.75.75 0 0 1 .75-.75Z"/>
            <path d="M9.25 9a.75.75 0 0 0-1.5 0v4.25a.75.75 0 0 0 1.5 0v-4.25Z"/>
            <path fill-rule="evenodd" d="M7.25 5.25a2.75 2.75 0 0 1 5.5 0h3a.75.75 0 0 1 0 1.5h-.75v5.45c0 1.68 0 2.52-.327 3.162a3 3 0 0 1-1.311 1.311c-.642.327-1.482.327-3.162.327h-.4c-1.68 0-2.52 0-3.162-.327a3 3 0 0 1-1.311-1.311c-.327-.642-.327-1.482-.327-3.162v-5.45h-.75a.75.75 0 0 1 0-1.5h3Zm1.5 0a1.25 1.25 0 1 1 2.5 0h-2.5Zm-2.25 1.5h7v5.45c0 .865-.001 1.423-.036 1.848-.033.408-.09.559-.128.633a1.5 1.5 0 0 1-.655.655c-.074.038-.225.095-.633.128-.425.035-.983.036-1.848.036h-.4c-.865 0-1.423-.001-1.848-.036-.408-.033-.559-.09-.633-.128a1.5 1.5 0 0 1-.656-.655c-.037-.074-.094-.225-.127-.633-.035-.425-.036-.983-.036-1.848v-5.45Z"/>
          </svg>
        </button>

        <strong>${formatPrice(unitPrice * item.quantity)}</strong>
      </div>
    </article>
  `;
}

async function renderCrossSell(cartItems: CartItem[], products: Product[]): Promise<string> {
  try {

    const currentIds = new Set(
      cartItems.map((item) => getCartItemProductId(item)).filter(Boolean)
    );

    const suggestions = products
      .filter(
        (product) =>
          product.active !== false &&
          product.category === "accessory" &&
          !currentIds.has(product.id) &&
          !currentIds.has(product._id || "")
      )
      .sort(() => Math.random() - 0.5)
      .slice(0, 6);

    if (suggestions.length === 0) return "";

    return `
      <section class="cart-cross-sell">
        <h3 class="cross-header">
          ${t("cart.othersBought", "Others also bought:")}
          <div class="cross-arrows">
            <button type="button" class="cross-prev">‹</button>
            <button type="button" class="cross-next">›</button>
          </div>
        </h3>

        <div class="cart-cross-sell-row">
          ${suggestions
            .map((product) => {
              const image = getProductImage(product);

              return `
<article
  class="cart-cross-card"
  data-id="${product.id}"
  data-slug="${product.slug || product.id}"
>                  <img src="${image || "/assets/img/logo_Image.png"}" alt="${
                product.title
              }" />
                  <h4>${product.title}</h4>
                  <p>${formatPrice(product.price)}</p>

                  <button class="cross-add" data-id="${product.id}">
                    ${t("cart.addButton", "Add")}
                  </button>
                </article>
              `;
            })
            .join("")}
        </div>
      </section>
    `;
  } catch (error) {
    console.error("Cross-sell render failed:", error);
    return "";
  }
}

async function getCatalogCached(): Promise<Product[]> {
  if (catalogCache) {
    return catalogCache;
  }

  catalogCache =
    await getProducts()
      .catch(
        () => [] as Product[]
      );

  return catalogCache;
}

async function renderCartFromState(
  targetId: string,
  cart: Cart
): Promise<void> {
  const container =
    document.getElementById(
      targetId
    );

  if (!container) return;

  container.classList.remove(
    "cart-empty-state"
  );

  const items =
    getCartItems(cart);

  const merchandiseTotal =
    getCartTotal(cart);

  const giftTier =
    getGiftTier(cart);

  const giftFee =
    giftTier === "premium"
      ? PREMIUM_GIFT_PRICE
      : 0;

  const total =
    merchandiseTotal + giftFee;

  updateCartHeaderCount(cart);

  if (items.length === 0) {
    container.classList.add(
      "cart-empty-state"
    );

    container.innerHTML = `
      <section class="cart-empty">
        <h2>${t("cart.empty", "Your cart is empty")}</h2>
        <a class="btn-primary cart-empty-btn" href="${localizedPath("/products", locale)}">
          ${t("cart.shopProducts", "SHOP PRODUCTS")}
        </a>
      </section>
    `;

    return;
  }

  const catalog =
    await getCatalogCached();

  const crossSell =
    await renderCrossSell(
      items,
      catalog
    );

  container.innerHTML = `
    ${updateProgress(merchandiseTotal)}

    <section class="drawer-cart-list">
      ${items
        .map(
          (item, index) =>
            renderCartItem(
              item,
              index,
              catalog
            )
        )
        .join("")}
    </section>

    <button
      type="button"
      class="cart-gift-row"
      data-gift-open
      aria-haspopup="dialog"
    >
      <span class="cart-gift-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H8.5A2.5 2.5 0 1 1 11 4.5C11 6 12 7 12 7Zm0 0h3.5A2.5 2.5 0 1 0 13 4.5C13 6 12 7 12 7Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="cart-gift-text">
        ${giftTier !== "none"
          ? giftTier === "premium"
            ? t("cart.premiumGiftAdded", "PREMIUM GIFT ADDED")
            : t("cart.giftReadyAdded", "GIFT-READY OPTION ADDED")
          : t("cart.makeGift", "MAKE THIS A GIFT")}
      </span>
      <span class="cart-gift-arrow" aria-hidden="true">→</span>
    </button>

    <div class="cart-gift-dialog hidden" data-gift-dialog role="dialog" aria-modal="true" aria-labelledby="cartGiftTitle">
      <div class="cart-gift-dialog__backdrop" data-gift-close></div>
      <div class="cart-gift-dialog__panel">
        <button type="button" class="cart-gift-dialog__close" data-gift-close aria-label="${t("cart.closeGift", "Close gift options")}">×</button>
        <span class="cart-gift-dialog__eyebrow">${t("cart.makeItGift", "Make it a gift")}</span>
        <h3 id="cartGiftTitle">${t("cart.chooseGift", "Choose your gift experience")}</h3>
        <p class="cart-gift-dialog__copy">
          ${t("cart.giftCopy", "Choose a simple gift-ready order or upgrade to premium packaging with a personal message.")}
        </p>

        <div class="cart-gift-tiers">
          <label class="cart-gift-tier" data-gift-tier-option="simple">
            <input
              type="radio"
              name="cartGiftTier"
              value="simple"
              ${giftTier === "simple" ? "checked" : ""}
            />
            <span class="cart-gift-tier__copy">
              <strong>${t("cart.giftReady", "Gift-ready")}</strong>
              <small>${t("cart.giftReadyCopy", "Hide prices in the parcel and include a gift/returns receipt card.")}</small>
            </span>
            <span class="cart-gift-tier__price">${t("cart.freeWord", "Free")}</span>
          </label>

          <label class="cart-gift-tier cart-gift-tier--premium" data-gift-tier-option="premium">
            <input
              type="radio"
              name="cartGiftTier"
              value="premium"
              ${giftTier === "premium" ? "checked" : ""}
            />
            <span class="cart-gift-tier__copy">
              <strong>${t("cart.premiumGift", "Premium gift")}</strong>
              <small>${t("cart.premiumGiftCopy", "Premium gift box, hidden prices, gift/returns receipt and personal note.")}</small>
            </span>
            <span class="cart-gift-tier__price">+${formatPrice(PREMIUM_GIFT_PRICE)}</span>
          </label>
        </div>

        <label class="cart-gift-note ${giftTier === "premium" ? "" : "hidden"}" data-gift-note-wrap>
          <span>${t("cart.personalNote", "Personal note")} <small>${t("cart.premiumOnly", "(premium only)")}</small></span>
          <textarea id="cartGiftNote" maxlength="200" rows="5" placeholder="${t("cart.writeMessage", "Write your message...")}">${escapeHtml(
            cart.giftOptions?.personalNote || ""
          )}</textarea>
          <small>${t("cart.max200", "Maximum 200 characters.")}</small>
        </label>

        <div class="cart-gift-dialog__actions">
          <button type="button" class="cart-gift-cancel" data-gift-close>${t("cart.cancel", "Cancel")}</button>
          <button type="button" class="cart-gift-save" data-gift-save>${t("cart.saveGift", "Save gift options")}</button>
        </div>
      </div>
    </div>

    <section class="cart-summary">
      ${giftTier !== "none" ? `
      <div class="cart-summary-gift">
        <span>${giftTier === "premium" ? t("cart.premiumGift", "Premium gift") : t("cart.giftReady", "Gift-ready")}</span>
        <strong>${giftTier === "premium" ? "+" + formatPrice(giftFee) : t("cart.freeWord", "Free")}</strong>
      </div>` : ""}
      <div>
        <span>${t("cart.total", "Total")}</span>
        <strong>${formatPrice(total)}</strong>
      </div>
      <div class="cart-summary-meta">
        <small>${getCartCount(cart)} ${t("cart.item", "item")}${
          getCartCount(cart) === 1
            ? ""
            : "s"
        }</small>
      </div>
    </section>

    ${crossSell}

    <div class="checkout-container">
      <button id="checkoutBtn" class="btn-primary drawer-checkout">
        ${t("cart.checkout", "Proceed to Checkout")}
      </button>
      <a class="cart-return-note" href="${localizedPath("/returns", locale)}">${t("cart.returns14", "14-Day Returns")}</a>
    </div>
  `;
}

async function renderCart(
  targetId: string
): Promise<void> {
  const cart =
    await getCart();

  currentCart = cart;

  await renderCartFromState(
    targetId,
    cart
  );
}

async function refreshAllCartViews(
  nextCart?: Cart
): Promise<void> {
  const loading =
    document.getElementById(
      "cartLoading"
    );

  const error =
    document.getElementById(
      "cartError"
    );

  if (loading) {
    loading.hidden = false;
  }

  if (error) {
    error.hidden = true;
  }

  try {
    if (nextCart) {
      currentCart = nextCart;

      await renderCartFromState(
        "cartDrawerContent",
        nextCart
      );

      updateCartBadgeFromCart(
        nextCart
      );
    } else {
      await renderCart(
        "cartDrawerContent"
      );

      if (currentCart) {
        updateCartBadgeFromCart(
          currentCart
        );
      } else {
        await updateCartBadge();
      }
    }

    window.dispatchEvent(
      new CustomEvent(
        "commerce:cart-updated"
      )
    );
  } catch (err) {
    console.error(
      "Cart render failed:",
      err
    );

    if (error) {
      error.hidden = false;
      error.textContent =
        err instanceof Error
          ? err.message
          : "Failed to load cart.";
    }
  } finally {
    if (loading) {
      loading.hidden = true;
    }
  }
}

async function changeItemQuantity(
  itemId: string,
  nextQuantity: number
) {
  const cart =
    currentCart ||
    await getCart();

  currentCart = cart;

  const items =
    getCartItems(cart);

  const item =
    items.find(
      (entry, index) =>
        getCartItemKey(
          entry,
          index
        ) === itemId
    );

  if (!item) return;

  if (nextQuantity <= 0) {
    const nextCart =
      await removeCartItem(
        itemId
      );

    await refreshAllCartViews(
      nextCart
    );

    return;
  }

  const maxStock =
    getItemAvailableStock(
      item
    );

  if (nextQuantity > maxStock) {
    showToast(
      t("cart.noMoreSize", "We don't have more items in this size.")
    );

    return;
  }

  const nextCart =
    await updateCartItem(
      itemId,
      {
        quantity:
          nextQuantity,
      }
    );

  await refreshAllCartViews(
    nextCart
  );
}

async function deleteItem(
  itemId: string
): Promise<void> {
  const nextCart =
    await removeCartItem(
      itemId
    );

  await refreshAllCartViews(
    nextCart
  );
}

function bindCartActions(): void {
  document.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement | null;
    const option =
      target?.closest<HTMLElement>("[data-gift-tier-option]");

    if (!option) return;

    const input =
      option.querySelector<HTMLInputElement>(
        'input[name="cartGiftTier"]'
      );

    option.dataset.wasChecked =
      input?.checked ? "true" : "false";
  });

  document.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;

    if (target?.name !== "cartGiftTier") return;

    const noteWrap =
      document.querySelector<HTMLElement>("[data-gift-note-wrap]");

    noteWrap?.classList.toggle(
      "hidden",
      target.value !== "premium"
    );
  });

  document.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const giftTierOption =
      target.closest<HTMLElement>("[data-gift-tier-option]");

    if (giftTierOption) {
      event.preventDefault();

      const input =
        giftTierOption.querySelector<HTMLInputElement>(
          'input[name="cartGiftTier"]'
        );

      if (!input) return;

      const wasChecked =
        giftTierOption.dataset.wasChecked === "true";

      document
        .querySelectorAll<HTMLInputElement>(
          'input[name="cartGiftTier"]'
        )
        .forEach((radio) => {
          radio.checked = false;
        });

      if (!wasChecked) {
        input.checked = true;
      }

      const selectedTier =
        document.querySelector<HTMLInputElement>(
          'input[name="cartGiftTier"]:checked'
        )?.value || "none";

      document
        .querySelector<HTMLElement>("[data-gift-note-wrap]")
        ?.classList.toggle(
          "hidden",
          selectedTier !== "premium"
        );

      return;
    }

    const giftOpen = target.closest("[data-gift-open]");
    const giftClose = target.closest("[data-gift-close]");
    const giftSave = target.closest("[data-gift-save]") as HTMLButtonElement | null;
    const giftDialog = document.querySelector<HTMLElement>("[data-gift-dialog]");

    if (giftOpen) {
      giftDialog?.classList.remove("hidden");
      document.body.classList.add("gift-dialog-open");
      window.setTimeout(() => {
        document.getElementById("cartGiftNote")?.focus();
      }, 0);
      return;
    }

    if (giftClose) {
      giftDialog?.classList.add("hidden");
      document.body.classList.remove("gift-dialog-open");
      return;
    }

    if (giftSave) {
      const tier = (
        document.querySelector<HTMLInputElement>(
          'input[name="cartGiftTier"]:checked'
        )?.value || "none"
      ) as "none" | "simple" | "premium";

      const personalNote =
        tier === "premium"
          ? (
              document.getElementById("cartGiftNote") as HTMLTextAreaElement | null
            )?.value?.trim() || ""
          : "";

      try {
        giftSave.disabled = true;
        giftSave.textContent = t("cart.saving", "Saving...");

        const nextCart = await updateCartGiftOptions({
          tier,
          giftBox: tier === "premium",
          personalNote,
        });

        await refreshAllCartViews(nextCart);
        document.body.classList.remove("gift-dialog-open");
        showToast(t("cart.giftSaved", "Gift options saved."));
      } catch (error: any) {
        giftSave.disabled = false;
        giftSave.textContent = t("cart.saveGift", "Save gift options");
        showToast(error?.message || t("cart.giftFailed", "Failed to save gift options."));
      }

      return;
    }

    const card = target.closest(".cart-cross-card") as HTMLElement | null;

    if (card && !target.closest(".cross-add")) {
const identifier = card.dataset.slug || card.dataset.id;
if (!identifier) return;

window.location.href = productPath(identifier);

return;
    }

    const addBtn = target.closest(".cross-add") as HTMLButtonElement | null;

    if (addBtn) {
      const id = addBtn.dataset.id;
      if (!id) return;

      try {
        const products = await getProducts();
        const product = products.find(
          (p) => p.id === id || p._id === id || p.slug === id
        );

        if (!product) {
          showToast(t("cart.productNotFound", "Product not found."));
          return;
        }

        if (new Set((product.variants || []).map(v => String(v.color || "").toLowerCase())).size > 1) {
          window.location.href = productPath(product.slug || product.id);
          return;
        }
        const selectedVariant =
          product.variants?.find((variant) => Number(variant.stock || 0) > 0) ||
          null;

        addBtn.disabled = true;
        addBtn.textContent = "...";

        const nextCart =
          await addCartItem({
            productId:
              product._id ||
              product.id,

            quantity: 1,
            variant:
              selectedVariant,
          });

        await refreshAllCartViews(
          nextCart
        );
        openCartDrawer();

        addBtn.textContent = "✓";
        setTimeout(() => {
          addBtn.disabled = false;
          addBtn.textContent = t("cart.addButton", "Add");
        }, 800);
      } catch (error: any) {
        console.error("Cross-sell add failed:", error);
        showToast(error?.message || "Failed to add product to cart.");
        addBtn.disabled = false;
        addBtn.textContent = "Add";
      }

      return;
    }

    const nextBtn = target.closest(".cross-next");
    const prevBtn = target.closest(".cross-prev");

    if (nextBtn) {
      const row = document.querySelector(".cart-cross-sell-row");
      row?.scrollBy({ left: 260, behavior: "smooth" });
      return;
    }

    if (prevBtn) {
      const row = document.querySelector(".cart-cross-sell-row");
      row?.scrollBy({ left: -260, behavior: "smooth" });
      return;
    }

    const decrease = target.closest(".cart-decrease") as HTMLElement | null;
    const increase = target.closest(".cart-increase") as HTMLElement | null;
    const remove = target.closest(".cart-remove") as HTMLElement | null;
    const checkout = target.closest("#checkoutBtn") as HTMLElement | null;

    if (decrease) {
      const itemId = decrease.dataset.itemId;
      if (!itemId) return;

      try {
        const item =
          getCartItems(
            currentCart
          ).find(
            (entry, index) =>
              getCartItemKey(
                entry,
                index
              ) === itemId
          );

        if (!item) return;

        await changeItemQuantity(
          itemId,
          Number(
            item.quantity || 0
          ) - 1
        );
      } catch (error: any) {
        console.error("Decrease quantity failed:", error);
        showToast(error?.message || "Failed to update quantity.");
      }
      return;
    }

    if (increase) {
      const itemId = increase.dataset.itemId;
      if (!itemId) return;

      try {
        const item =
          getCartItems(
            currentCart
          ).find(
            (entry, index) =>
              getCartItemKey(
                entry,
                index
              ) === itemId
          );

        if (!item) return;

        await changeItemQuantity(
          itemId,
          Number(
            item.quantity || 0
          ) + 1
        );
      } catch (error: any) {
        console.error("Increase quantity failed:", error);
        showToast(error?.message || "Failed to update quantity.");
      }
      return;
    }

    if (remove) {
      const itemId = remove.dataset.itemId;
      if (!itemId) return;

      try {
        await deleteItem(itemId);
      } catch (error: any) {
        console.error("Remove item failed:", error);
        showToast(error?.message || "Failed to remove item.");
      }
      return;
    }

    if (checkout) {
      window.location.href = localizedPath("/checkout", locale);
    }
  });
}

function openCartDrawer(): void {
  const drawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("cartOverlay");

  drawer?.classList.remove("hidden");
  overlay?.classList.remove("hidden");
  document.body.classList.add("cart-open");

  requestAnimationFrame(() => {
    drawer?.classList.add("open");
  });
}

function closeCartDrawer(): void {
  const drawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("cartOverlay");

  drawer?.classList.remove("open");
  document.body.classList.remove("cart-open");

  window.dispatchEvent(
    new CustomEvent("commerce:cart-updated")
  );

  setTimeout(() => {
    drawer?.classList.add("hidden");
    overlay?.classList.add("hidden");
  }, 250);
}

function setupCartDrawer(): void {
  const root =
    document.documentElement;

  if (
    root.dataset
      .cartDrawerDelegated ===
    "true"
  ) {
    return;
  }

  root.dataset
    .cartDrawerDelegated =
    "true";

  document.addEventListener(
    "click",
    (event) => {
      const target =
        event.target as
          HTMLElement | null;

      if (!target) return;

      const cartLink =
        target.closest<
          HTMLAnchorElement
        >(
          "[data-cart-link], .cart-link"
        );

      if (cartLink) {
        const drawer =
          document.getElementById(
            "cartDrawer"
          );

        const overlay =
          document.getElementById(
            "cartOverlay"
          );

        /*
         * If this page does not include the drawer markup,
         * keep the normal /cart navigation fallback.
         */
        if (
          drawer &&
          overlay
        ) {
          event.preventDefault();

          openCartDrawer();

          void renderCart(
            "cartDrawerContent"
          );
        }

        return;
      }

      if (
        target.closest(
          "#closeCart"
        ) ||
        target ===
          document.getElementById(
            "cartOverlay"
          )
      ) {
        event.preventDefault();
        closeCartDrawer();
      }
    }
  );
}

async function initCart(): Promise<void> {
  bindCartActions();
  setupCartDrawer();
  await refreshAllCartViews();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void initCart();
  });
} else {
  void initCart();
}
