import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { nowIso } from "../utils/ids.js";
import {
  pruneExpiredHolds,
  reservationDocId,
} from "./inventory-reservation.service.js";
import { sendPaidOrderEmails } from "./order-email.service.js";

function webhookData(payload) {
  return payload?.EventData || payload?.eventData || payload?.data || payload || {};
}

function variantIndex(product, selectedVariant) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return -1;

  return variants.findIndex(
    (variant) =>
      String(variant?.sku || "") === String(selectedVariant?.sku || "") &&
      String(variant?.size || "").toLowerCase() ===
        String(selectedVariant?.size || "").toLowerCase() &&
      String(variant?.color || "").toLowerCase() ===
        String(selectedVariant?.color || "").toLowerCase()
  );
}

export async function attachVivaPaymentToOrder({
  orderId,
  vivaOrderCode,
  checkoutUrl,
  raw,
}) {
  if (!orderId) throw new ApiError(400, "Missing order id");

  const updatedAt = nowIso();
  await getDB().collection(COLLECTIONS.ORDERS).doc(orderId).set(
    {
      paymentProvider: "viva",
      payment: {
        provider: "viva",
        vivaOrderCode: String(vivaOrderCode),
        checkoutUrl: String(checkoutUrl),
        rawCreateOrder: raw || null,
        status: "pending",
        updatedAt,
      },
      updatedAt,
    },
    { merge: true }
  );
}

export async function markOrderPaidFromVivaWebhook(payload) {
  const data = webhookData(payload);
  const vivaOrderCode = String(
    data?.OrderCode || data?.orderCode || data?.OrderId || data?.orderId || ""
  ).trim();
  const transactionId = String(
    data?.TransactionId ||
      data?.transactionId ||
      data?.TransactionID ||
      data?.transactionID ||
      ""
  ).trim();
  const amountCents = Math.round(Number(data?.Amount ?? data?.amount ?? 0) * 100);

  if (!vivaOrderCode) throw new ApiError(400, "Missing Viva order code");
  if (!transactionId) throw new ApiError(400, "Missing Viva transaction id");

  const db = getDB();
  const snapshot = await db
    .collection(COLLECTIONS.ORDERS)
    .where("payment.vivaOrderCode", "==", vivaOrderCode)
    .limit(1)
    .get();

  if (snapshot.empty) throw new ApiError(404, "Order not found");

  const ref = snapshot.docs[0].ref;
  let paidOrder = null;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError(404, "Order not found");

    const order = { id: snap.id, ...snap.data() };
    if (order.paymentStatus === "paid") {
      paidOrder = order;
      return;
    }

    const expectedCents = Math.round(Number(order.total || 0) * 100);
    if (!amountCents || amountCents !== expectedCents) {
      throw new ApiError(400, "Viva amount does not match order total");
    }

    if (
      order.stockReservationState !== "held" ||
      Date.parse(String(order.stockReservationExpiresAt || "")) <= Date.now()
    ) {
      throw new ApiError(409, "Checkout inventory reservation expired");
    }

    const productIds = [
      ...new Set((order.items || []).map((item) => String(item.productId))),
    ];

    const productEntries = await Promise.all(
      productIds.map(async (productId) => {
        const productRef = db.collection(COLLECTIONS.PRODUCTS).doc(productId);
        return { productId, productRef, snap: await tx.get(productRef) };
      })
    );

    const products = new Map(
      productEntries.map((entry) => [entry.productId, entry])
    );

    for (const item of order.items || []) {
      const entry = products.get(String(item.productId));
      if (!entry?.snap?.exists) {
        throw new ApiError(409, "Product disappeared before payment");
      }

      const product = { id: entry.snap.id, ...entry.snap.data() };
      const qty = Number(item.quantity || 0);
      const index = variantIndex(product, item.variant);

      if (index >= 0) {
        const variants = [...product.variants];
        const currentStock = Number(variants[index]?.stock || 0);
        if (currentStock < qty) {
          throw new ApiError(409, "Reserved stock is no longer available");
        }
        variants[index] = {
          ...variants[index],
          stock: currentStock - qty,
        };
        tx.update(entry.productRef, { variants, updatedAt: nowIso() });
      } else {
        const currentStock = Number(product.stock || 0);
        if (currentStock < qty) {
          throw new ApiError(409, "Reserved stock is no longer available");
        }
        tx.update(entry.productRef, {
          stock: currentStock - qty,
          updatedAt: nowIso(),
        });
      }
    }

    const reservations = Array.isArray(order.stockReservations)
      ? order.stockReservations
      : [];

    for (const reservation of reservations) {
      const holdRef = db
        .collection(COLLECTIONS.INVENTORY_HOLDS)
        .doc(reservationDocId(reservation.inventoryKey));
      const holdSnap = await tx.get(holdRef);
      if (!holdSnap.exists) continue;

      const active = pruneExpiredHolds(holdSnap.data()?.holds, Date.now());
      tx.set(
        holdRef,
        {
          holds: active.filter(
            (hold) => String(hold.id) !== String(reservation.holdId)
          ),
          updatedAt: nowIso(),
        },
        { merge: true }
      );
    }

    const paidAt = nowIso();
    const patch = {
      status: "paid",
      paymentStatus: "paid",
      fulfillmentStatus: "to_prepare",
      stockReservationState: "consumed",
      stockReservationConsumedAt: paidAt,
      payment: {
        ...(order.payment || {}),
        status: "paid",
        transactionId,
        amount: amountCents,
        rawWebhook: payload,
        paidAt,
        updatedAt: paidAt,
      },
      "warehouse.checklist.productPicked": false,
      "warehouse.checklist.sizeVerified": false,
      "warehouse.checklist.packed": false,
      updatedAt: paidAt,
    };

    tx.update(ref, patch);
    tx.set(
      db.collection(COLLECTIONS.CARTS).doc(order.ownerId),
      {
        userId: order.ownerId,
        items: [],
        checkoutOrderId: null,
        checkoutStartedAt: null,
        updatedAt: paidAt,
      },
      { merge: true }
    );

    paidOrder = { ...order, ...patch };
  });

  if (paidOrder) {
    try {
      await sendPaidOrderEmails(paidOrder);
    } catch (error) {
      console.error("Paid order email failed", {
        orderId: paidOrder.id,
        message: error?.message,
      });
    }
  }

  return paidOrder;
}
