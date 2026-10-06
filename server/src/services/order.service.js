import { getDB } from "../config/db.js";
import {
  getEffectiveUnitPrice,
} from "./product-pricing.service.js";
import {
  localizeProduct,
} from "./localization.service.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { createId, nowIso } from "../utils/ids.js";
import {
  getCheckoutReservationMs,
  isReservationActive,
  releaseInventoryHold,
  reserveInventoryHold,
} from "./inventory-reservation.service.js";

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const PREMIUM_GIFT_PRICE = 1.5;

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

function giftFeeFor(value) {
  return normalizeGiftOptions(value).tier === "premium"
    ? PREMIUM_GIFT_PRICE
    : 0;
}

function calculateShipping(subtotal, delivery) {
  if (subtotal >= 50) return 0;
  if (delivery === "boxnow") return 2.0;
  return 3.5;
}

function buildOrderNumber() {
  return `SK-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}

function variantKey(variant) {
  return [variant?.sku || "", variant?.size || "", variant?.color || ""].join(
    "|"
  );
}

function findVariant(product, selectedVariant) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (!variants.length) return { variant: null, index: -1 };

  const selectedKey = variantKey(selectedVariant);
  const index = variants.findIndex(
    (variant) => variantKey(variant) === selectedKey
  );
  if (index < 0)
    throw new ApiError(
      400,
      `Selected variant does not exist for ${product.title}`
    );
  return { variant: variants[index], index };
}

function assertAndDecrementStock(product, variant, variantIndex, quantity) {
  const qty = toNumber(quantity, 0);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
    throw new ApiError(400, "Invalid item quantity");
  }

  if (variant) {
    const currentStock = toNumber(variant.stock, 0);
    if (currentStock < qty)
      throw new ApiError(400, `Not enough stock for ${product.title}`);

    const variants = [...(product.variants || [])];
    variants[variantIndex] = { ...variant, stock: currentStock - qty };
    return { variants };
  }

  const currentStock = toNumber(product.stock, 0);
  if (currentStock < qty)
    throw new ApiError(400, `Not enough stock for ${product.title}`);
  return { stock: currentStock - qty };
}

export async function checkoutCartForOwner({
  locale = "en",
  ownerId,
  ownerType,
  customer,
  phoneCountryCode,
  shippingAddress,
  delivery,
  locker,
  notes,
  giftOptions = {
    tier: "none",
    giftBox: false,
    personalNote: "",
  },
  documentType = "receipt",
  invoiceDetails = null,
}) {
  if (!ownerId) throw new ApiError(401, "Missing checkout owner");

  if (
    delivery === "boxnow" &&
    !String(locker || "").trim()
  ) {
    throw new ApiError(
      400,
      "Choose a BOX NOW locker before payment"
    );
  }

  const db = getDB();
  const orderId = createId("order");
  const orderNumber = buildOrderNumber();
  const createdAt = nowIso();

  const result = await db.runTransaction(async (tx) => {
    const cartRef = db.collection(COLLECTIONS.CARTS).doc(ownerId);
    const cartSnap = await tx.get(cartRef);

    const cart = cartSnap.exists ? cartSnap.data() : { items: [] };
    const cartItems = Array.isArray(cart.items) ? cart.items : [];
    if (!cartItems.length) throw new ApiError(400, "Cart is empty");

    /*
     * Checkout idempotency:
     * if a previous click already created a pending order for this cart,
     * reuse it instead of decrementing stock and creating another order.
     */
    if (cart.checkoutOrderId) {
      const existingRef = db
        .collection(COLLECTIONS.ORDERS)
        .doc(String(cart.checkoutOrderId));

      const existingSnap = await tx.get(existingRef);

      if (existingSnap.exists) {
        const existingOrder = {
          id: existingSnap.id,
          ...existingSnap.data(),
        };

        if (
          existingOrder.ownerId === ownerId &&
          existingOrder.ownerType === ownerType &&
          existingOrder.paymentStatus === "pending" &&
          existingOrder.stockReservationState === "held" &&
          isReservationActive(
            existingOrder.stockReservationExpiresAt
          )
        ) {
          const requestedLocker =
            String(locker || "").trim();

          const existingLocker =
            String(
              existingOrder.shipping?.boxnow?.destinationId ||
              existingOrder.locker ||
              ""
            ).trim();

          const requestedGiftFee =
            giftFeeFor(giftOptions);

          const existingGiftFee =
            Number(existingOrder.giftFee || 0);

          if (
            (
              delivery !== "boxnow" ||
              (
                requestedLocker &&
                existingLocker === requestedLocker
              )
            ) &&
            existingGiftFee === requestedGiftFee
          ) {
            const refreshedAt = nowIso();

            const checkoutRefresh = {
              locale:
                locale === "el"
                  ? "el"
                  : "en",

              customer: {
                ...existingOrder.customer,
                firstName: customer.firstName,
                lastName: customer.lastName,
                email: customer.email,
                phone: customer.phone || "",
                phoneCountryCode:
                  phoneCountryCode || "GR",
              },

              billing: {
                documentType:
                  documentType === "invoice"
                    ? "invoice"
                    : "receipt",

                invoiceDetails:
                  documentType === "invoice"
                    ? invoiceDetails
                    : null,
              },

              notes:
                notes || "",

              giftOptions: {
                ...normalizeGiftOptions(giftOptions),
                price: giftFeeFor(giftOptions),
              },

              giftFee: giftFeeFor(giftOptions),
              total:
                Number(existingOrder.subtotal || 0) +
                Number(existingOrder.shippingCost || 0) +
                (giftFeeFor(giftOptions)),

              updatedAt:
                refreshedAt,
            };

            tx.set(
              existingRef,
              checkoutRefresh,
              {
                merge:
                  true,
              }
            );

            return {
              orderId: existingOrder.id,
              orderNumber: existingOrder.orderNumber,
              qrCodesRequired:
                Number(existingOrder.qrCodesRequired || 0),
              order: {
                ...existingOrder,
                ...checkoutRefresh,
              },
              reused: true,
            };
          }
        }
      }
    }

    const productRefs = cartItems.map((item) =>
      db.collection(COLLECTIONS.PRODUCTS).doc(String(item.productId))
    );
    const productSnaps = await Promise.all(
      productRefs.map((ref) => tx.get(ref))
    );

    const orderItems = [];
    const stockUpdates = [];
    let subtotal = 0;

    for (let i = 0; i < cartItems.length; i += 1) {
      const item = cartItems[i];
      const productSnap = productSnaps[i];
      if (!productSnap.exists)
        throw new ApiError(400, "Product is unavailable");

      const product = { id: productSnap.id, ...productSnap.data() };
      const localizedProduct =
        localizeProduct(
          product,
          locale
        );

      if (product.active === false)
        throw new ApiError(400, `Product "${product.title}" is unavailable`);

      const quantity = toNumber(item.quantity, 0);

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
      ) {
        throw new ApiError(
          400,
          "Invalid item quantity"
        );
      }

      const { variant } =
        findVariant(product, item.variant);


const unitPrice = getEffectiveUnitPrice(product, variant);
const lineTotal = unitPrice * quantity;
subtotal += lineTotal;


console.log("PRODUCT QR CONFIG DURING CHECKOUT:", {
  productId: product.id,
  title: product.title,
  customQr: product.customQr,
  qrConfig: product.qrConfig,
});


const orderItemQrConfig = product.customQr
  ? {
      textPrint:
        String(product.qrConfig?.textPrint ?? "").trim(),

      textPosition:
        product.qrConfig?.textPosition === "top"
          ? "top"
          : "bottom",

      qrColor:
        product.qrConfig?.qrColor || product.qrConfig?.color || "#000000",

      textColor:
        product.qrConfig?.textColor ||
        product.qrConfig?.qrColor ||
        product.qrConfig?.color ||
        "#000000",

      size:
        product.qrConfig?.size || 3540,
    }
  : null;

  
console.log("ORDER ITEM QR CONFIG:", {
  productId: product.id,
  qrConfig: orderItemQrConfig,
});


orderItems.push({
  id: item.id || createId("orderitem"),

  productId: product.id,
  slug: product.slug || product.id,
  title: localizedProduct.title,

  image: Array.isArray(product.images)
    ? product.images[0] || null
    : product.image || null,

  quantity,
  unitPrice,
  originalUnitPrice: toNumber(variant?.price ?? product.price, 0),
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

  qrDestination: item.qrDestination || null,

  customQr: Boolean(product.customQr),

  qrConfig: orderItemQrConfig,
});

    }

    const shippingCost = calculateShipping(subtotal, delivery);
    const giftFee = giftFeeFor(giftOptions);
    const total = subtotal + shippingCost + giftFee;

    const order = {
  id: orderId,
  orderNumber,
  locale:
    locale === "el"
      ? "el"
      : "en",
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
    country: shippingAddress.country || "Greece",
    city: shippingAddress.city,
    postalCode: shippingAddress.postalCode || "",
    addressLine1: shippingAddress.addressLine1,
    addressLine2: shippingAddress.addressLine2 || "",
  },

  delivery: delivery || "home",
locker: locker || null,
notes: notes || "",

giftOptions: {
  ...normalizeGiftOptions(giftOptions),
  price: giftFee,
},

giftFee,

billing: {
  documentType:
    documentType === "invoice"
      ? "invoice"
      : "receipt",

  invoiceDetails:
    documentType === "invoice"
      ? invoiceDetails
      : null,
},

shipping: {
  provider:
    delivery === "boxnow"
      ? "boxnow"
      : "manual",

  status: "pending",

  ...(delivery === "boxnow"
    ? {
        boxnow: {
          destinationId:
            typeof locker === "string"
              ? locker
              : locker?.id ||
                locker?.boxnowLockerId ||
                null,
        },
      }
    : {}),
},

items: orderItems,



  subtotal,
  shippingCost,
  total,
  currency: "EUR",

  status: "pending",
  paymentStatus: "pending",
  paymentProvider: "manual",

  qrCodesRequired: orderItems
    .filter((item) => item.customQr)
    .reduce(
      (total, item) =>
        total + Number(item.quantity || 0),
      0
    ),

  createdAt,
  updatedAt: createdAt,
};

    tx.set(
      db.collection(COLLECTIONS.ORDERS).doc(orderId),
      order
    );

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
  orderNumber,
  qrCodesRequired: order.qrCodesRequired,
  order,
};
  });

  if (result.reused) {
    return result;
  }

  const promoted = [];

  try {
    for (const item of result.order.items || []) {
      const hold = await reserveInventoryHold({
        holdId:
          `order:${result.orderId}:${item.id}`,
        orderItemId:
          item.id,
        ownerId,
        productId: item.productId,
        selectedVariant: item.variant,
        quantity: Number(item.quantity || 0),
        phase: "checkout",
        orderId: result.orderId,
        ttlMs: getCheckoutReservationMs(),
      });

      promoted.push(hold);
    }
  } catch (error) {
    await Promise.allSettled(
      promoted.map((hold) =>
        releaseInventoryHold({
          holdId: hold.holdId,
          inventoryKey: hold.inventoryKey,
        })
      )
    );

    const failedAt = nowIso();

    await db
      .collection(COLLECTIONS.ORDERS)
      .doc(result.orderId)
      .set(
        {
          stockReservationState: "failed",
          stockReservationError:
            error?.message ||
            "Could not reserve inventory",
          updatedAt: failedAt,
        },
        { merge: true }
      );

    await db
      .collection(COLLECTIONS.CARTS)
      .doc(ownerId)
      .set(
        {
          checkoutOrderId: null,
          checkoutStartedAt: null,
          updatedAt: failedAt,
        },
        { merge: true }
      );

    throw error;
  }

  await Promise.allSettled(
    (result.order.items || []).map((item) =>
      releaseInventoryHold({
        holdId:
          item.id,
        inventoryKey:
          promoted.find(
            (hold) =>
              String(hold.orderItemId) ===
              String(item.id)
          )?.inventoryKey ||
          "",
      })
    )
  );

  const stockReservationExpiresAt =
    promoted
      .map((hold) => hold.expiresAt)
      .sort()
      .at(-1) ||
    new Date(
      Date.now() +
      getCheckoutReservationMs()
    ).toISOString();

  const reservationPatch = {
    stockReservations: promoted,
    stockReservationState: "held",
    stockReservationExpiresAt,
    updatedAt: nowIso(),
  };

  await db
    .collection(COLLECTIONS.ORDERS)
    .doc(result.orderId)
    .set(
      reservationPatch,
      { merge: true }
    );

  result.order = {
    ...result.order,
    ...reservationPatch,
  };

  return result;
}

export async function getOrdersForUser(userId) {
  if (!userId) throw new ApiError(401, "Missing user id");
  const db = getDB();
  const snapshot = await db
    .collection(COLLECTIONS.ORDERS)
    .where("ownerId", "==", userId)
    .where("ownerType", "==", "user")
    .get();

  const orders = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter(
      (order) =>
        String(order.paymentStatus || "")
          .trim()
          .toLowerCase() === "paid"
    );

  orders.sort(
    (a, b) =>
      new Date(b.createdAt || 0).getTime() -
      new Date(a.createdAt || 0).getTime()
  );
  return orders;
}

export async function getOrderByIdForUser(userId, orderId) {
  if (!userId) throw new ApiError(401, "Missing user id");
  if (!orderId) throw new ApiError(400, "Missing order id");

  const db = getDB();
  const docSnap = await db.collection(COLLECTIONS.ORDERS).doc(orderId).get();
  if (!docSnap.exists) throw new ApiError(404, "Order not found");

  const order = { id: docSnap.id, ...docSnap.data() };
  if (order.ownerId !== userId || order.ownerType !== "user") {
    throw new ApiError(403, "You do not have access to this order");
  }
  return order;
}

export async function getOrderByVivaOrderCodeForUser(userId, vivaOrderCode) {
  if (!userId) throw new ApiError(401, "Missing user id");
  if (!vivaOrderCode) throw new ApiError(400, "Missing Viva order code");

  const db = getDB();

  const snapshot = await db
    .collection(COLLECTIONS.ORDERS)
    .where("ownerId", "==", userId)
    .where("ownerType", "==", "user")
    .where("payment.vivaOrderCode", "==", String(vivaOrderCode))
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new ApiError(404, "Order not found");
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}
