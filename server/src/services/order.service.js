import { getDB } from "../config/db.js";
import { getEffectiveUnitPrice } from "./product-pricing.service.js";
import { localizeProduct } from "./localization.service.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { createId, nowIso } from "../utils/ids.js";
import {
  getCheckoutReservationMs,
  isReservationActive,
  releaseInventoryHold,
  reserveInventoryHold,
} from "./inventory-reservation.service.js";

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const PREMIUM_GIFT_PRICE = Number(process.env.PREMIUM_GIFT_PRICE || 1.5);
const FREE_SHIPPING_THRESHOLD = Number(process.env.FREE_SHIPPING_THRESHOLD || 50);
const STANDARD_SHIPPING_COST = Number(process.env.STANDARD_SHIPPING_COST || 4.9);

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

function giftFeeFor(value) {
  return normalizeGiftOptions(value).tier === "premium"
    ? PREMIUM_GIFT_PRICE
    : 0;
}

function calculateShipping(subtotal) {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_COST;
}

function buildOrderNumber() {
  const prefix = String(process.env.ORDER_PREFIX || "ORD").toUpperCase();
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}

function variantKey(variant) {
  return [
    variant?.sku || "",
    variant?.size || "",
    variant?.color || "",
  ].join("|");
}

function findVariant(product, selectedVariant) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return null;

  const key = variantKey(selectedVariant);
  const variant = variants.find((item) => variantKey(item) === key);
  if (!variant) {
    throw new ApiError(400, `Selected variant does not exist for ${product.title}`);
  }
  return variant;
}

export async function checkoutCartForOwner({
  locale = "en",
  ownerId,
  ownerType,
  customer,
  phoneCountryCode,
  shippingAddress,
  delivery = "home",
  notes,
  giftOptions = { tier: "none", giftBox: false, personalNote: "" },
  documentType = "receipt",
  invoiceDetails = null,
}) {
  if (!ownerId) throw new ApiError(401, "Missing checkout owner");
  if (delivery !== "home") throw new ApiError(400, "Unsupported delivery method");

  const db = getDB();
  const createdAt = nowIso();

  const result = await db.runTransaction(async (tx) => {
    const cartRef = db.collection(COLLECTIONS.CARTS).doc(ownerId);
    const cartSnap = await tx.get(cartRef);
    const cart = cartSnap.exists ? cartSnap.data() : { items: [] };
    const cartItems = Array.isArray(cart.items) ? cart.items : [];

    if (!cartItems.length) throw new ApiError(400, "Cart is empty");

    if (cart.checkoutOrderId) {
      const existingRef = db
        .collection(COLLECTIONS.ORDERS)
        .doc(String(cart.checkoutOrderId));
      const existingSnap = await tx.get(existingRef);

      if (existingSnap.exists) {
        const existing = { id: existingSnap.id, ...existingSnap.data() };
        if (
          existing.ownerId === ownerId &&
          existing.ownerType === ownerType &&
          existing.paymentStatus === "pending" &&
          existing.stockReservationState === "held" &&
          isReservationActive(existing.stockReservationExpiresAt)
        ) {
          return {
            orderId: existing.id,
            orderNumber: existing.orderNumber,
            order: existing,
            reused: true,
          };
        }
      }
    }

    const productRefs = cartItems.map((item) =>
      db.collection(COLLECTIONS.PRODUCTS).doc(String(item.productId))
    );
    const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

    const orderItems = [];
    let subtotal = 0;

    for (let index = 0; index < cartItems.length; index += 1) {
      const cartItem = cartItems[index];
      const productSnap = productSnaps[index];

      if (!productSnap.exists) throw new ApiError(400, "Product is unavailable");

      const product = { id: productSnap.id, ...productSnap.data() };
      if (product.active === false) {
        throw new ApiError(400, `Product "${product.title}" is unavailable`);
      }

      const localized = localizeProduct(product, locale);
      const quantity = number(cartItem.quantity);

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new ApiError(400, "Invalid item quantity");
      }

      const variant = findVariant(product, cartItem.variant);
      const unitPrice = getEffectiveUnitPrice(product, variant);
      const lineTotal = unitPrice * quantity;
      subtotal += lineTotal;

      orderItems.push({
        id: cartItem.id || createId("orderitem"),
        productId: product.id,
        slug: product.slug || product.id,
        title: localized.title,
        image: Array.isArray(product.images)
          ? product.images[0] || null
          : product.image || null,
        quantity,
        unitPrice,
        originalUnitPrice: number(variant?.price ?? product.price),
        discountPercent: Number(product.discountPercent || 0),
        currency: product.currency || "EUR",
        lineTotal,
        sku: variant?.sku || "",
        variant: variant
          ? {
              sku: variant.sku || "",
              size: variant.size || "",
              color: variant.color || "",
            }
          : null,
      });
    }

    const shippingCost = calculateShipping(subtotal);
    const giftFee = giftFeeFor(giftOptions);
    const total = subtotal + shippingCost + giftFee;
    const orderId = createId("order");

    const order = {
      id: orderId,
      orderNumber: buildOrderNumber(),
      locale: locale === "el" ? "el" : "en",
      ownerId,
      ownerType,
      customer: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone || "",
        phoneCountryCode: phoneCountryCode || "GR",
      },
      shippingAddress: {
        firstName: shippingAddress.firstName || customer.firstName,
        lastName: shippingAddress.lastName || customer.lastName,
        email: shippingAddress.email || customer.email,
        phone: shippingAddress.phone || customer.phone || "",
        country: shippingAddress.country || "",
        city: shippingAddress.city || "",
        postalCode: shippingAddress.postalCode || "",
        addressLine1: shippingAddress.addressLine1 || "",
        addressLine2: shippingAddress.addressLine2 || "",
      },
      delivery: "home",
      notes: notes || "",
      giftOptions: {
        ...normalizeGiftOptions(giftOptions),
        price: giftFee,
      },
      giftFee,
      billing: {
        documentType: documentType === "invoice" ? "invoice" : "receipt",
        invoiceDetails: documentType === "invoice" ? invoiceDetails : null,
      },
      shipping: {
        provider: process.env.SHIPPING_PROVIDER || "standard",
        status: "pending",
      },
      items: orderItems,
      subtotal,
      shippingCost,
      total,
      currency: "EUR",
      status: "pending",
      paymentStatus: "pending",
      paymentProvider: "viva",
      createdAt,
      updatedAt: createdAt,
    };

    tx.set(db.collection(COLLECTIONS.ORDERS).doc(orderId), order);
    tx.set(
      cartRef,
      {
        checkoutOrderId: orderId,
        checkoutStartedAt: createdAt,
        updatedAt: createdAt,
      },
      { merge: true }
    );

    return {
      orderId,
      orderNumber: order.orderNumber,
      order,
      reused: false,
    };
  });

  if (result.reused) return result;

  const holds = [];
  try {
    for (const item of result.order.items) {
      holds.push(
        await reserveInventoryHold({
          holdId: `order:${result.orderId}:${item.id}`,
          orderItemId: item.id,
          ownerId,
          productId: item.productId,
          selectedVariant: item.variant,
          quantity: item.quantity,
          phase: "checkout",
          orderId: result.orderId,
          ttlMs: getCheckoutReservationMs(),
        })
      );
    }
  } catch (error) {
    await Promise.allSettled(
      holds.map((hold) =>
        releaseInventoryHold({
          holdId: hold.holdId,
          inventoryKey: hold.inventoryKey,
        })
      )
    );

    await db.collection(COLLECTIONS.ORDERS).doc(result.orderId).set(
      {
        stockReservationState: "failed",
        stockReservationError: error?.message || "Could not reserve inventory",
        updatedAt: nowIso(),
      },
      { merge: true }
    );

    await db.collection(COLLECTIONS.CARTS).doc(ownerId).set(
      {
        checkoutOrderId: null,
        checkoutStartedAt: null,
        updatedAt: nowIso(),
      },
      { merge: true }
    );

    throw error;
  }

  const stockReservationExpiresAt =
    holds.map((hold) => hold.expiresAt).sort().at(-1) ||
    new Date(Date.now() + getCheckoutReservationMs()).toISOString();

  const patch = {
    stockReservations: holds,
    stockReservationState: "held",
    stockReservationExpiresAt,
    updatedAt: nowIso(),
  };

  await db.collection(COLLECTIONS.ORDERS).doc(result.orderId).set(patch, {
    merge: true,
  });

  result.order = { ...result.order, ...patch };
  return result;
}

export async function getOrdersForUser(userId) {
  if (!userId) throw new ApiError(401, "Missing user id");

  const snapshot = await getDB()
    .collection(COLLECTIONS.ORDERS)
    .where("ownerId", "==", userId)
    .where("ownerType", "==", "user")
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((order) => String(order.paymentStatus || "").toLowerCase() === "paid")
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
    );
}

export async function getOrderByIdForUser(userId, orderId) {
  if (!userId) throw new ApiError(401, "Missing user id");
  const snap = await getDB().collection(COLLECTIONS.ORDERS).doc(orderId).get();

  if (!snap.exists) throw new ApiError(404, "Order not found");

  const order = { id: snap.id, ...snap.data() };
  if (order.ownerId !== userId || order.ownerType !== "user") {
    throw new ApiError(403, "You do not have access to this order");
  }
  return order;
}

export async function getOrderByVivaOrderCodeForUser(userId, vivaOrderCode) {
  if (!userId) throw new ApiError(401, "Missing user id");

  const snapshot = await getDB()
    .collection(COLLECTIONS.ORDERS)
    .where("ownerId", "==", userId)
    .where("ownerType", "==", "user")
    .where("payment.vivaOrderCode", "==", String(vivaOrderCode))
    .limit(1)
    .get();

  if (snapshot.empty) throw new ApiError(404, "Order not found");
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}
