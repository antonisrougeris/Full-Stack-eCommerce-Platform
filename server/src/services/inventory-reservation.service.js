import crypto from "crypto";
import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { nowIso } from "../utils/ids.js";
import { inventoryKey } from "./stock-availability.service.js";

const DEFAULT_CART_RESERVATION_MINUTES = 30;
const DEFAULT_CHECKOUT_RESERVATION_MINUTES = 30;

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getCartReservationMs() {
  return positiveNumber(
    process.env.CART_RESERVATION_MINUTES,
    DEFAULT_CART_RESERVATION_MINUTES
  ) * 60 * 1000;
}

export function getCheckoutReservationMs() {
  return positiveNumber(
    process.env.CHECKOUT_RESERVATION_MINUTES,
    DEFAULT_CHECKOUT_RESERVATION_MINUTES
  ) * 60 * 1000;
}

export function getInventoryKey(productId, variant) {
  return inventoryKey(productId, variant?.sku || "__base__");
}

export function reservationDocId(key) {
  return crypto.createHash("sha256").update(String(key)).digest("hex");
}

export function pruneExpiredHolds(holds, nowMs = Date.now()) {
  return (Array.isArray(holds) ? holds : []).filter((hold) => {
    const expiresAt = Date.parse(String(hold?.expiresAt || ""));
    return Number.isFinite(expiresAt) && expiresAt > nowMs;
  });
}

export function reservedQuantity(
  holds,
  { excludeHoldId = null, nowMs = Date.now() } = {}
) {
  return pruneExpiredHolds(holds, nowMs).reduce((sum, hold) => {
    if (excludeHoldId && String(hold.id) === String(excludeHoldId)) {
      return sum;
    }
    const quantity = Number(hold.quantity || 0);
    return sum + (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
}

function resolveStoredVariant(product, selectedVariant) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return null;

  const sku = String(selectedVariant?.sku || "");
  const size = String(selectedVariant?.size || "").toLowerCase();
  const color = String(selectedVariant?.color || "").toLowerCase();

  const variant = variants.find(
    (item) =>
      String(item?.sku || "") === sku &&
      String(item?.size || "").toLowerCase() === size &&
      String(item?.color || "").toLowerCase() === color
  );

  if (!variant) {
    throw new ApiError(400, "Selected product variant is no longer available");
  }

  return variant;
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
    const productRef = db.collection(COLLECTIONS.PRODUCTS).doc(String(productId));
    const productSnap = await tx.get(productRef);

    if (!productSnap.exists) throw new ApiError(400, "Product is unavailable");

    const product = { id: productSnap.id, ...productSnap.data() };
    if (product.active === false) throw new ApiError(400, "Product is unavailable");

    const variant = resolveStoredVariant(product, selectedVariant);
    const key = getInventoryKey(product.id, variant);
    const holdRef = db
      .collection(COLLECTIONS.INVENTORY_HOLDS)
      .doc(reservationDocId(key));

    const holdSnap = await tx.get(holdRef);
    const activeHolds = pruneExpiredHolds(
      holdSnap.exists ? holdSnap.data()?.holds : [],
      nowMs
    );

    const reservedByOthers = reservedQuantity(activeHolds, {
      excludeHoldId: holdId,
      nowMs,
    });

    const physicalStock = Number(variant ? variant.stock : product.stock || 0);
    const available = physicalStock - reservedByOthers;

    if (!Number.isSafeInteger(physicalStock) || physicalStock < 0) {
      throw new ApiError(409, "Product stock is invalid");
    }

    if (available < qty) {
      throw new ApiError(409, "Not enough stock for the selected product");
    }

    const nextHold = {
      id: String(holdId),
      ownerId: ownerId ? String(ownerId) : null,
      cartItemId: phase === "cart" ? String(orderItemId) : null,
      orderItemId: String(orderItemId),
      orderId: orderId ? String(orderId) : null,
      productId: product.id,
      sku: String(variant?.sku || ""),
      inventoryKey: key,
      quantity: qty,
      phase,
      expiresAt,
      updatedAt,
    };

    tx.set(
      holdRef,
      {
        inventoryKey: key,
        productId: product.id,
        sku: String(variant?.sku || ""),
        holds: [
          ...activeHolds.filter((hold) => String(hold.id) !== String(holdId)),
          nextHold,
        ],
        updatedAt,
      },
      { merge: true }
    );

    return {
      holdId: String(holdId),
      orderItemId: String(orderItemId),
      inventoryKey: key,
      productId: product.id,
      sku: String(variant?.sku || ""),
      quantity: qty,
      phase,
      orderId: orderId ? String(orderId) : null,
      expiresAt,
      availableAfter: available - qty,
    };
  });
}

export async function releaseInventoryHold({ holdId, inventoryKey }) {
  if (!holdId || !inventoryKey) return;

  const db = getDB();
  const ref = db
    .collection(COLLECTIONS.INVENTORY_HOLDS)
    .doc(reservationDocId(inventoryKey));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;

    const active = pruneExpiredHolds(snap.data()?.holds, Date.now());
    tx.set(
      ref,
      {
        holds: active.filter((hold) => String(hold.id) !== String(holdId)),
        updatedAt: nowIso(),
      },
      { merge: true }
    );
  });
}

export async function readActiveReservationCounts(db = getDB()) {
  const snapshot = await db.collection(COLLECTIONS.INVENTORY_HOLDS).get();
  const counts = new Map();

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const key = String(data.inventoryKey || "");
    if (!key) continue;

    const quantity = reservedQuantity(data.holds);
    if (quantity > 0) counts.set(key, quantity);
  }

  return counts;
}

export function isReservationActive(expiresAt, nowMs = Date.now()) {
  const parsed = Date.parse(String(expiresAt || ""));
  return Number.isFinite(parsed) && parsed > nowMs;
}
