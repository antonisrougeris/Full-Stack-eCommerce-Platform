import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { createId, nowIso } from "../utils/ids.js";
import { normalizeUrlOrThrow } from "../utils/validators.js";
import {
  getProductByIdOrSlug,
  resolveVariantOrThrow,
} from "./product.service.js";

import {
  getInventoryKey,
  releaseInventoryHold,
  reserveInventoryHold,
} from "./inventory-reservation.service.js";

import {
  chooseProductImages,
} from "./product-colors.service.js";
import {
  calculateDiscountedPrice,
} from "./product-pricing.service.js";

function normalizeGiftOptions(value = {}) {
  const legacyPremium = Boolean(value?.giftBox);
  const tier =
    value?.tier === "simple" ||
    value?.tier === "premium" ||
    value?.tier === "none"
      ? value.tier
      : legacyPremium
        ? "premium"
        : "none";

  return {
    tier,
    giftBox: tier === "premium",
    hidePrices: tier !== "none",
    includeGiftReceipt: tier !== "none",
    personalNote:
      tier === "premium"
        ? String(value?.personalNote || "").trim()
        : "",
  };
}

/* =========================
   GET CART
========================= */

export async function getCartByUserId(userId) {
  const db = getDB();
  const doc = await db.collection(COLLECTIONS.CARTS).doc(userId).get();

  if (!doc.exists) {
    return {
      userId,
      items: [],
      giftOptions: normalizeGiftOptions({ tier: "none" }),
      updatedAt: nowIso(),
    };
  }

  const data = doc.data() || {};

  return {
    userId,
    items: Array.isArray(data.items) ? data.items : [],
    giftOptions: normalizeGiftOptions(data.giftOptions),
    updatedAt: data.updatedAt || nowIso(),
  };
}

/* =========================
   ADD ITEM
========================= */

export async function addCartItem({
  userId,
  productId,
  quantity,
  selectedVariant,
  qrDestination,
}) {
  const db = getDB();

  const product = await getProductByIdOrSlug(productId);

  if (product.active === false) {
    throw new ApiError(400, "Product is inactive");
  }

  const variant = resolveVariantOrThrow(product, selectedVariant);

  if (product.customQr && !qrDestination) {
    throw new ApiError(400, "qrDestination is required for this product");
  }

  if (!product.customQr && qrDestination) {
    throw new ApiError(400, "This product does not support custom QR");
  }

  if (qrDestination) {
    normalizeUrlOrThrow(qrDestination, "qrDestination");
  }

  const cart = await getCartByUserId(userId);

  const normalizedQrDestination = qrDestination || null;
  const normalizedSku = variant?.sku || "";

  const existingIndex = cart.items.findIndex((item) => {
    const sameProduct = item.productId === product.id;
    const sameQr = (item.qrDestination || null) === normalizedQrDestination;
    const sameSku = (item.variant?.sku || "") === normalizedSku;

    return sameProduct && sameQr && sameSku;
  });

  if (existingIndex >= 0) {
    const existing = cart.items[existingIndex];
    const nextQty = Number(existing.quantity || 0) + quantity;

    const hold = await reserveInventoryHold({
      holdId: existing.id,
      ownerId: userId,
      productId: product.id,
      selectedVariant: variant,
      quantity: nextQty,
      phase: "cart",
    });

    cart.items[existingIndex] = {
      ...existing,
      quantity: nextQty,
      reservationExpiresAt: hold.expiresAt,
      updatedAt: nowIso(),
    };
  } else {
    const itemId = createId("cartitem");

    const hold = await reserveInventoryHold({
      holdId: itemId,
      ownerId: userId,
      productId: product.id,
      selectedVariant: variant,
      quantity,
      phase: "cart",
    });

    cart.items.push({
      id: itemId,
      productId: product.id,
      slug: product.slug || product.id,
      title: product.title,
image:
  chooseProductImages(
    product,
    variant?.color
  )[0] || null,
      // Δεν εμπιστευόμαστε ποτέ τιμές από client.
      // Αυτό είναι server snapshot για εμφάνιση cart.
      // Στο checkout πρέπει πάλι να ξαναϋπολογίζονται από product DB.
price: calculateDiscountedPrice(
  variant?.price ??
    product.originalPrice ??
    product.price,
  product.discountPercent
),
      originalPrice: Number(
        variant?.price ??
        product.originalPrice ??
        product.price
      ),
      discountPercent: Number(
        product.discountPercent || 0
      ),
      currency: product.currency || "EUR",

      quantity,
      variant: variant
        ? {
            sku: variant.sku || "",
            size: variant.size || "",
            color: variant.color || "",
          }
        : null,
      qrDestination: normalizedQrDestination,
      customQr: !!product.customQr,
      reservationExpiresAt: hold.expiresAt,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  const nextCart = {
    userId,
    items: cart.items,
    giftOptions: normalizeGiftOptions(cart.giftOptions),
    checkoutOrderId: null,
    checkoutStartedAt: null,
    updatedAt: nowIso(),
  };

  await db.collection(COLLECTIONS.CARTS).doc(userId).set(nextCart, {
    merge: true,
  });

  return nextCart;
}

/* =========================
   UPDATE ITEM
========================= */

export async function updateCartItem({
  userId,
  itemId,
  quantity,
  qrDestination,
}) {
  const db = getDB();
  const cart = await getCartByUserId(userId);

  const idx = cart.items.findIndex((item) => item.id === itemId);

  if (idx < 0) {
    throw new ApiError(404, "Cart item not found");
  }

  const current = cart.items[idx];
  const product = await getProductByIdOrSlug(current.productId);

  if (product.active === false) {
    throw new ApiError(400, "Product is inactive");
  }

  const resolvedVariant = current.variant
    ? resolveVariantOrThrow(product, current.variant)
    : null;

  const hold = await reserveInventoryHold({
    holdId: current.id,
    ownerId: userId,
    productId: product.id,
    selectedVariant: resolvedVariant,
    quantity,
    phase: "cart",
  });

  let nextQrDestination = null;

  if (current.customQr) {
    nextQrDestination = qrDestination || current.qrDestination;

    if (!nextQrDestination) {
      throw new ApiError(400, "qrDestination is required for this product");
    }

    normalizeUrlOrThrow(nextQrDestination, "qrDestination");
  } else if (qrDestination) {
    throw new ApiError(400, "This product does not support custom QR");
  }

  cart.items[idx] = {
    ...current,

    // refresh από server product, όχι παλιό/πειραγμένο cart data
    title: product.title,
    slug: product.slug || product.id,
image:
  chooseProductImages(
    product,
    resolvedVariant?.color
  )[0] || null,

price: calculateDiscountedPrice(
  resolvedVariant?.price ??
    product.originalPrice ??
    product.price,
  product.discountPercent
),
    originalPrice: Number(
      resolvedVariant?.price ??
      product.originalPrice ??
      product.price
    ),
    discountPercent: Number(
      product.discountPercent || 0
    ),
    currency: product.currency || "EUR",

    quantity,
    qrDestination: nextQrDestination,
    reservationExpiresAt: hold.expiresAt,
    updatedAt: nowIso(),
  };

  const nextCart = {
    userId,
    items: cart.items,
    giftOptions: normalizeGiftOptions(cart.giftOptions),
    checkoutOrderId: null,
    checkoutStartedAt: null,
    updatedAt: nowIso(),
  };

  await db.collection(COLLECTIONS.CARTS).doc(userId).set(nextCart, {
    merge: true,
  });

  return nextCart;
}

export async function updateCartGiftOptions({
  userId,
  giftOptions,
}) {
  const db = getDB();
  const cart = await getCartByUserId(userId);

  const nextCart = {
    userId,
    items: cart.items,
    giftOptions: normalizeGiftOptions(giftOptions),
    checkoutOrderId: null,
    checkoutStartedAt: null,
    updatedAt: nowIso(),
  };

  await db.collection(COLLECTIONS.CARTS).doc(userId).set(nextCart, {
    merge: true,
  });

  return nextCart;
}

/* =========================
   DELETE ITEM
========================= */

export async function removeCartItem({ userId, itemId }) {
  const db = getDB();
  const cart = await getCartByUserId(userId);

  const removedItem = cart.items.find((item) => item.id === itemId);
  const nextItems = cart.items.filter((item) => item.id !== itemId);

  if (!removedItem || nextItems.length === cart.items.length) {
    throw new ApiError(404, "Cart item not found");
  }

  const nextCart = {
    userId,
    items: nextItems,
    giftOptions: normalizeGiftOptions(cart.giftOptions),
    checkoutOrderId: null,
    checkoutStartedAt: null,
    updatedAt: nowIso(),
  };

  await db.collection(COLLECTIONS.CARTS).doc(userId).set(nextCart, {
    merge: true,
  });

  await releaseInventoryHold({
    holdId: removedItem.id,
    inventoryKey: getInventoryKey(
      removedItem.productId,
      removedItem.variant
    ),
  });

  return nextCart;
}

/* =========================
   CLEAR CART
========================= */

export async function clearCart(userId) {
  const db = getDB();
  const current = await getCartByUserId(userId);

  const nextCart = {
    userId,
    items: [],
    giftOptions: normalizeGiftOptions({ tier: "none" }),
    checkoutOrderId: null,
    checkoutStartedAt: null,
    updatedAt: nowIso(),
  };

  await db.collection(COLLECTIONS.CARTS).doc(userId).set(nextCart, {
    merge: true,
  });

  await Promise.all(
    (current.items || []).map((item) =>
      releaseInventoryHold({
        holdId: item.id,
        inventoryKey: getInventoryKey(
          item.productId,
          item.variant
        ),
      })
    )
  );

  return nextCart;
}


export async function mergeGuestCartIntoUserCart({ guestId, userId }) {
  if (!guestId || !userId || guestId === userId) {
    return getCartByUserId(userId);
  }

  const db = getDB();

  const guestCart = await getCartByUserId(guestId);
  const userCart = await getCartByUserId(userId);

if (guestCart.copiedFromUserCart && guestCart.sourceUserId === userId) {
  const now = nowIso();

  const nextUserCart = {
    userId,
    items: Array.isArray(guestCart.items)
      ? guestCart.items.map((item) => ({
          ...item,
          updatedAt: now,
        }))
      : [],
    giftOptions: normalizeGiftOptions(
      guestCart.giftOptions || userCart.giftOptions
    ),
    checkoutOrderId: null,
    checkoutStartedAt: null,
    updatedAt: now,
  };

  await db.collection(COLLECTIONS.CARTS).doc(userId).set(nextUserCart);
  await db.collection(COLLECTIONS.CARTS).doc(guestId).delete();

  return nextUserCart;
}
  const mergedItems = [...(userCart.items || [])];

  for (const guestItem of guestCart.items || []) {
    const sameIndex = mergedItems.findIndex((item) => {
      const sameProduct = item.productId === guestItem.productId;
      const sameQr = (item.qrDestination || null) === (guestItem.qrDestination || null);
      const sameSku = (item.variant?.sku || "") === (guestItem.variant?.sku || "");

      return sameProduct && sameQr && sameSku;
    });

    if (sameIndex >= 0) {
      mergedItems[sameIndex] = {
        ...mergedItems[sameIndex],
        quantity:
          Number(mergedItems[sameIndex].quantity || 0) +
          Number(guestItem.quantity || 0),
        updatedAt: nowIso(),
      };
    } else {
      mergedItems.push({
        ...guestItem,
        id: guestItem.id || createId("cartitem"),
        updatedAt: nowIso(),
      });
    }
  }

  const nextUserCart = {
    userId,
    items: mergedItems,
    giftOptions: normalizeGiftOptions(
      guestCart.giftOptions || userCart.giftOptions
    ),
    checkoutOrderId: null,
    checkoutStartedAt: null,
    updatedAt: nowIso(),
  };

  await db.collection(COLLECTIONS.CARTS).doc(userId).set(nextUserCart, {
    merge: true,
  });

  await db.collection(COLLECTIONS.CARTS).doc(guestId).delete();

  return nextUserCart;
}

export async function copyUserCartToGuestCart({ userId, guestId }) {
  if (!userId) throw new ApiError(401, "Missing user id");
  if (!guestId) throw new ApiError(400, "Missing guest id");

  const db = getDB();

  const userCart = await getCartByUserId(userId);
  const now = nowIso();

  const guestCart = {
    userId: guestId,
    sourceUserId: userId,
    copiedFromUserCart: true,
    items: Array.isArray(userCart.items)
      ? userCart.items.map((item) => ({
          ...item,
          id: item.id || createId("cartitem"),
          updatedAt: now,
        }))
      : [],
    giftOptions: normalizeGiftOptions(userCart.giftOptions),
    checkoutOrderId: null,
    checkoutStartedAt: null,
    updatedAt: now,
  };

  await db.collection(COLLECTIONS.CARTS).doc(guestId).set(guestCart);

  return guestCart;
}