import crypto from "crypto";

import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { nowIso } from "../utils/ids.js";
import {
  inventoryKey as qrInventoryKey,
  isReadyQr,
} from "./stock-availability.service.js";

const DEFAULT_CART_RESERVATION_MINUTES = 30;
const DEFAULT_CHECKOUT_RESERVATION_DAYS = 5;

function safePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getCartReservationMs() {
  return (
    safePositiveNumber(
      process.env.CART_RESERVATION_MINUTES,
      DEFAULT_CART_RESERVATION_MINUTES
    ) *
    60 *
    1000
  );
}

export function getCheckoutReservationMs() {
  return (
    safePositiveNumber(
      process.env.CHECKOUT_RESERVATION_DAYS,
      DEFAULT_CHECKOUT_RESERVATION_DAYS
    ) *
    24 *
    60 *
    60 *
    1000
  );
}

export function getInventoryKey(productId, variant) {
  const sku = String(variant?.sku || "").trim();
  return sku
    ? qrInventoryKey(productId, sku)
    : `${String(productId)}::__base__`;
}

export function reservationDocId(inventoryKey) {
  return crypto
    .createHash("sha256")
    .update(String(inventoryKey))
    .digest("hex");
}

export function pruneExpiredHolds(holds, nowMs = Date.now()) {
  return (Array.isArray(holds) ? holds : []).filter((hold) => {
    const expiresAt = Date.parse(String(hold?.expiresAt || ""));
    return Number.isFinite(expiresAt) && expiresAt > nowMs;
  });
}

export function reservedQuantity(holds, { excludeHoldId = null, nowMs = Date.now() } = {}) {
  return pruneExpiredHolds(holds, nowMs).reduce((sum, hold) => {
    if (excludeHoldId && String(hold.id) === String(excludeHoldId)) {
      return sum;
    }

    const quantity = Number(hold.quantity || 0);
    return sum + (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
}

function rawVariant(product, selectedVariant) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];

  if (!variants.length) {
    return { variant: null, index: -1 };
  }

  const sku = String(selectedVariant?.sku || "").trim();
  const size = String(selectedVariant?.size || "").trim().toLowerCase();
  const color = String(selectedVariant?.color || "").trim().toLowerCase();

  const index = variants.findIndex(
    (variant) =>
      String(variant?.sku || "").trim() === sku &&
      String(variant?.size || "").trim().toLowerCase() === size &&
      String(variant?.color || "").trim().toLowerCase() === color
  );

  if (index < 0) {
    throw new ApiError(400, "Selected size/color is no longer available");
  }

  return {
    variant: variants[index],
    index,
  };
}

function rawFallbackStock(product, variant) {
  const value = Number(variant ? variant.stock : product?.stock);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

async function readyQrCountInTransaction(tx, db, product, variant) {
  if (!product?.customQr || !variant?.sku) {
    return 0;
  }

  const key = getInventoryKey(product.id, variant);

  const snapshot = await tx.get(
    db
      .collection(COLLECTIONS.QR_CODES)
      .where("status", "==", "available")
      .where("inventoryKey", "==", key)
  );

  return snapshot.docs.filter((doc) => isReadyQr(doc.data())).length;
}

export async function reserveInventoryHold({
  holdId,
  ownerId,
  productId,
  selectedVariant,
  orderItemId = holdId,
  quantity,
  phase = "cart",
  orderId = null,
  ttlMs = phase === "checkout"
    ? getCheckoutReservationMs()
    : getCartReservationMs(),
}) {
  const qty = Number(quantity);

  if (!holdId) throw new ApiError(400, "Missing inventory hold id");
  if (!productId) throw new ApiError(400, "Missing product id");
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > 99) {
    throw new ApiError(400, "Quantity must be between 1 and 99");
  }

  const db = getDB();
  const nowMs = Date.now();
  const updatedAt = nowIso();
  const expiresAt = new Date(nowMs + ttlMs).toISOString();

  return db.runTransaction(async (tx) => {
    const productRef = db
      .collection(COLLECTIONS.PRODUCTS)
      .doc(String(productId));

    const productSnap = await tx.get(productRef);

    if (!productSnap.exists) {
      throw new ApiError(400, "Product is unavailable");
    }

    const product = {
      id: productSnap.id,
      ...productSnap.data(),
    };

    if (product.active === false) {
      throw new ApiError(400, "Product is unavailable");
    }

    const { variant } = rawVariant(product, selectedVariant);
    const inventoryKey = getInventoryKey(product.id, variant);

    const holdRef = db
      .collection(COLLECTIONS.INVENTORY_HOLDS)
      .doc(reservationDocId(inventoryKey));

    const [holdSnap, readyCount] = await Promise.all([
      tx.get(holdRef),
      readyQrCountInTransaction(tx, db, product, variant),
    ]);

    const activeHolds = pruneExpiredHolds(
      holdSnap.exists ? holdSnap.data()?.holds : [],
      nowMs
    );

    const reservedByOthers = reservedQuantity(activeHolds, {
      excludeHoldId: holdId,
      nowMs,
    });

    const baseStock =
      rawFallbackStock(product, variant) +
      readyCount;

    const availableForThisHold =
      baseStock - reservedByOthers;

    if (availableForThisHold < qty) {
      throw new ApiError(
        409,
        "Not enough stock for the selected size/color"
      );
    }

    const nextHold = {
      id: String(holdId),
      ownerId: ownerId ? String(ownerId) : null,
      cartItemId:
        phase === "cart"
          ? String(orderItemId)
          : null,
      orderItemId:
        String(orderItemId),
      orderId: orderId ? String(orderId) : null,
      productId: product.id,
      sku: String(variant?.sku || ""),
      inventoryKey,
      quantity: qty,
      phase,
      expiresAt,
      updatedAt,
    };

    const nextHolds = [
      ...activeHolds.filter(
        (hold) => String(hold.id) !== String(holdId)
      ),
      nextHold,
    ];

    tx.set(
      holdRef,
      {
        inventoryKey,
        productId: product.id,
        sku: String(variant?.sku || ""),
        holds: nextHolds,
        updatedAt,
      },
      { merge: true }
    );

    return {
      holdId: String(holdId),
      orderItemId: String(orderItemId),
      inventoryKey,
      productId: product.id,
      sku: String(variant?.sku || ""),
      quantity: qty,
      phase,
      orderId: orderId ? String(orderId) : null,
      expiresAt,
      availableAfter: availableForThisHold - qty,
    };
  });
}

export async function releaseInventoryHold({
  holdId,
  inventoryKey,
}) {
  if (!holdId || !inventoryKey) return;

  const db = getDB();
  const ref = db
    .collection(COLLECTIONS.INVENTORY_HOLDS)
    .doc(reservationDocId(inventoryKey));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;

    const nowMs = Date.now();
    const active = pruneExpiredHolds(snap.data()?.holds, nowMs);
    const next = active.filter(
      (hold) => String(hold.id) !== String(holdId)
    );

    tx.set(
      ref,
      {
        holds: next,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
  });
}

export async function readActiveReservationCounts(db = getDB()) {
  const snapshot = await db
    .collection(COLLECTIONS.INVENTORY_HOLDS)
    .get();

  const counts = new Map();
  const nowMs = Date.now();

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const key = String(data.inventoryKey || "");

    if (!key) continue;

    const quantity = reservedQuantity(data.holds, {
      nowMs,
    });

    if (quantity > 0) {
      counts.set(key, quantity);
    }
  }

  return counts;
}

export function isReservationActive(expiresAt, nowMs = Date.now()) {
  const parsed = Date.parse(String(expiresAt || ""));
  return Number.isFinite(parsed) && parsed > nowMs;
}
