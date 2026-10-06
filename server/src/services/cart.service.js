import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { createId, nowIso } from "../utils/ids.js";
import {
  getProductByIdOrSlug,
  resolveVariantOrThrow,
} from "./product.service.js";
import {
  getInventoryKey,
  releaseInventoryHold,
  reserveInventoryHold,
} from "./inventory-reservation.service.js";
import { chooseProductImages } from "./product-colors.service.js";
import { calculateDiscountedPrice } from "./product-pricing.service.js";

function normalizeGiftOptions(value = {}) {
  const tier = ["none", "simple", "premium"].includes(value?.tier)
    ? value.tier
    : value?.giftBox
      ? "premium"
      : "none";

  return {
    tier,
    giftBox: tier === "premium",
    hidePrices: tier !== "none",
    includeGiftReceipt: tier !== "none",
    personalNote:
      tier === "premium" ? String(value?.personalNote || "").trim() : "",
  };
}

export async function getCartByUserId(userId) {
  const db = getDB();
  const doc = await db.collection(COLLECTIONS.CARTS).doc(userId).get();

  if (!doc.exists) {
    return {
      userId,
      items: [],
      giftOptions: normalizeGiftOptions(),
      updatedAt: nowIso(),
    };
  }

  const data = doc.data() || {};
  return {
    userId,
    items: Array.isArray(data.items) ? data.items : [],
    giftOptions: normalizeGiftOptions(data.giftOptions),
    checkoutOrderId: data.checkoutOrderId || null,
    checkoutStartedAt: data.checkoutStartedAt || null,
    updatedAt: data.updatedAt || nowIso(),
  };
}

export async function addCartItem({
  userId,
  productId,
  quantity,
  selectedVariant,
}) {
  const db = getDB();
  const product = await getProductByIdOrSlug(productId);

  if (product.active === false) throw new ApiError(400, "Product is inactive");

  const variant = resolveVariantOrThrow(product, selectedVariant);
  const normalizedSku = variant?.sku || "";
  const cart = await getCartByUserId(userId);

  const existingIndex = cart.items.findIndex(
    (item) =>
      item.productId === product.id &&
      String(item.variant?.sku || "") === String(normalizedSku)
  );

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
      image: chooseProductImages(product, variant?.color)[0] || null,
      price: calculateDiscountedPrice(
        variant?.price ?? product.originalPrice ?? product.price,
        product.discountPercent
      ),
      originalPrice: Number(
        variant?.price ?? product.originalPrice ?? product.price
      ),
      discountPercent: Number(product.discountPercent || 0),
      currency: product.currency || "EUR",
      quantity,
      variant: variant
        ? {
            sku: variant.sku || "",
            size: variant.size || "",
            color: variant.color || "",
          }
        : null,
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

  await db.collection(COLLECTIONS.CARTS).doc(userId).set(nextCart, { merge: true });
  return nextCart;
}

export async function updateCartItem({ userId, itemId, quantity }) {
  const db = getDB();
  const cart = await getCartByUserId(userId);
  const idx = cart.items.findIndex((item) => item.id === itemId);

  if (idx < 0) throw new ApiError(404, "Cart item not found");

  const current = cart.items[idx];
  const product = await getProductByIdOrSlug(current.productId);
  if (product.active === false) throw new ApiError(400, "Product is inactive");

  const variant = current.variant
    ? resolveVariantOrThrow(product, current.variant)
    : null;

  const hold = await reserveInventoryHold({
    holdId: current.id,
    ownerId: userId,
    productId: product.id,
    selectedVariant: variant,
    quantity,
    phase: "cart",
  });

  cart.items[idx] = {
    ...current,
    title: product.title,
    slug: product.slug || product.id,
    image: chooseProductImages(product, variant?.color)[0] || null,
    price: calculateDiscountedPrice(
      variant?.price ?? product.originalPrice ?? product.price,
      product.discountPercent
    ),
    originalPrice: Number(
      variant?.price ?? product.originalPrice ?? product.price
    ),
    discountPercent: Number(product.discountPercent || 0),
    currency: product.currency || "EUR",
    quantity,
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

  await db.collection(COLLECTIONS.CARTS).doc(userId).set(nextCart, { merge: true });
  return nextCart;
}

export async function updateCartGiftOptions({ userId, giftOptions }) {
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

  await db.collection(COLLECTIONS.CARTS).doc(userId).set(nextCart, { merge: true });
  return nextCart;
}

export async function removeCartItem({ userId, itemId }) {
  const db = getDB();
  const cart = await getCartByUserId(userId);
  const removed = cart.items.find((item) => item.id === itemId);

  if (!removed) throw new ApiError(404, "Cart item not found");

  const nextCart = {
    userId,
    items: cart.items.filter((item) => item.id !== itemId),
    giftOptions: normalizeGiftOptions(cart.giftOptions),
    checkoutOrderId: null,
    checkoutStartedAt: null,
    updatedAt: nowIso(),
  };

  await db.collection(COLLECTIONS.CARTS).doc(userId).set(nextCart, { merge: true });
  await releaseInventoryHold({
    holdId: removed.id,
    inventoryKey: getInventoryKey(removed.productId, removed.variant),
  });

  return nextCart;
}

export async function clearCart(userId) {
  const db = getDB();
  const current = await getCartByUserId(userId);

  await Promise.allSettled(
    current.items.map((item) =>
      releaseInventoryHold({
        holdId: item.id,
        inventoryKey: getInventoryKey(item.productId, item.variant),
      })
    )
  );

  const nextCart = {
    userId,
    items: [],
    giftOptions: normalizeGiftOptions(),
    checkoutOrderId: null,
    checkoutStartedAt: null,
    updatedAt: nowIso(),
  };

  await db.collection(COLLECTIONS.CARTS).doc(userId).set(nextCart, { merge: true });
  return nextCart;
}

export async function mergeGuestCartIntoUserCart({ guestId, userId }) {
  if (!guestId || !userId || guestId === userId) return getCartByUserId(userId);

  const db = getDB();
  const guestCart = await getCartByUserId(guestId);
  const userCart = await getCartByUserId(userId);
  const mergedItems = [...userCart.items];

  for (const guestItem of guestCart.items) {
    const index = mergedItems.findIndex(
      (item) =>
        item.productId === guestItem.productId &&
        String(item.variant?.sku || "") === String(guestItem.variant?.sku || "")
    );

    if (index >= 0) {
      mergedItems[index] = {
        ...mergedItems[index],
        quantity:
          Number(mergedItems[index].quantity || 0) +
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

  await db.collection(COLLECTIONS.CARTS).doc(userId).set(nextUserCart, { merge: true });
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
    items: userCart.items.map((item) => ({
      ...item,
      id: item.id || createId("cartitem"),
      updatedAt: now,
    })),
    giftOptions: normalizeGiftOptions(userCart.giftOptions),
    checkoutOrderId: null,
    checkoutStartedAt: null,
    updatedAt: now,
  };

  await db.collection(COLLECTIONS.CARTS).doc(guestId).set(guestCart);
  return guestCart;
}
