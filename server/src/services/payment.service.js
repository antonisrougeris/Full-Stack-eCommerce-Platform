import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { createId, nowIso } from "../utils/ids.js";

import { sendPaidOrderEmails } from "./order-email.service.js";

import {
  reserveUniqueQrShortId,
  writeQrShortIdReservation,
} from "./qr-id.service.js";

import {
  issueOrderReceipt,
} from "./oxygen.service.js";

import {
  createBoxNowDelivery,
} from "./boxnow.service.js";

import {
  pruneExpiredHolds,
  reservationDocId,
} from "./inventory-reservation.service.js";


function getEventData(payload) {
  return payload?.EventData || payload?.eventData || payload?.data || payload;
}


function getVivaField(data, names) {
  for (const name of names) {
    if (data?.[name] !== undefined && data?.[name] !== null) {
      return data[name];
    }
  }

  return null;
}


function toCents(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return 0;

  // Viva webhook Amount έρχεται σε ευρώ, π.χ. 33.4
  return Math.round(n * 100);
}


function normalizeStatusId(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}


function isSuccessfulVivaPayment(data) {
  const status = normalizeStatusId(
    getVivaField(data, ["StatusId", "statusId", "StatusID", "statusID"])
  );

  const responseCode = String(
    getVivaField(data, ["ResponseCode", "responseCode"]) || ""
  ).trim();

  return status === "F" || status === "5" || responseCode === "00";
}


async function findOrderByVivaOrderCode(tx, db, vivaOrderCode) {
  const snap = await tx.get(
    db
      .collection(COLLECTIONS.ORDERS)
      .where("payment.vivaOrderCode", "==", String(vivaOrderCode))
      .limit(1)
  );

  if (snap.empty) {
    console.warn("Viva webhook ignored: order not found", {
      vivaOrderCode: String(vivaOrderCode),
    });

    return null;
  }

  const doc = snap.docs[0];

  return {
    ref: doc.ref,
    order: {
      id: doc.id,
      ...doc.data(),
    },
  };
}


export async function attachVivaPaymentToOrder({
  orderId,
  vivaOrderCode,
  checkoutUrl,
  raw,
}) {
  if (!orderId) {
    throw new ApiError(400, "Missing order id");
  }

  if (!vivaOrderCode) {
    throw new ApiError(400, "Missing Viva order code");
  }

  const db = getDB();
  const updatedAt = nowIso();

  await db
    .collection(COLLECTIONS.ORDERS)
    .doc(orderId)
    .set(
      {
        paymentProvider: "viva",
        paymentStatus: "pending",

        payment: {
          provider: "viva",
          vivaOrderCode: String(vivaOrderCode),
          checkoutUrl,
          rawCreateOrder: raw || null,
          createdAt: updatedAt,
          updatedAt,
        },

        updatedAt,
      },
      { merge: true }
    );
}


function sanitizeQrColor(input, fallback = "#000000") {
  const isValidHex = (value) =>
    /^#[0-9a-fA-F]{6}$/.test(String(value || ""));

  if (typeof input === "string") {
    return isValidHex(input) ? input : fallback;
  }

  if (Array.isArray(input)) {
    const validColors = input.filter(isValidHex);

    return validColors.length >= 2
      ? validColors
      : fallback;
  }

  if (
    input &&
    typeof input === "object" &&
    Array.isArray(input.colors)
  ) {
    const validColors = input.colors.filter(isValidHex);

    if (validColors.length >= 2) {
      return {
        type:
          input.type === "radial"
            ? "radial"
            : "linear",

        colors: validColors,

        angle: Number.isFinite(Number(input.angle))
          ? Number(input.angle)
          : 0,
      };
    }
  }

  return fallback;
}


function buildQrConfig(item) {
  return {
    textPrint:
      String(item.qrConfig?.textPrint ?? "").trim(),

    textPosition:
      item.qrConfig?.textPosition === "top"
        ? "top"
        : "bottom",

    qrColor: sanitizeQrColor(
      item.qrConfig?.qrColor ??
        item.qrConfig?.color
    ),

    textColor: sanitizeQrColor(
      item.qrConfig?.textColor ??
        item.qrConfig?.qrColor ??
        item.qrConfig?.color
    ),

    size:
      Number(item.qrConfig?.size) > 0
        ? Number(item.qrConfig.size)
        : 3540,
  };
}


function getItemSku(item) {
  return String(
    item.sku ??
    item.variant?.sku ??
    ""
  ).trim();
}


function buildQrInventoryKey(item) {
  const sku = getItemSku(item);

  if (sku) {
    return `${item.productId}::${sku}`;
  }

  const size = String(item.variant?.size || "").trim();
  const color = String(item.variant?.color || "").trim();

  return [
    item.productId,
    size || "-",
    color || "-",
  ].join("::");
}

function findStoredVariantIndex(product, selectedVariant) {
  const variants = Array.isArray(product?.variants)
    ? product.variants
    : [];

  if (!variants.length) {
    return -1;
  }

  const sku = String(selectedVariant?.sku || "").trim();
  const size = String(selectedVariant?.size || "").trim().toLowerCase();
  const color = String(selectedVariant?.color || "").trim().toLowerCase();

  return variants.findIndex(
    (variant) =>
      String(variant?.sku || "").trim() === sku &&
      String(variant?.size || "").trim().toLowerCase() === size &&
      String(variant?.color || "").trim().toLowerCase() === color
  );
}


/* ==================================================
   BOX NOW
================================================== */

function getBoxNowLockerId(order) {
  return String(
    order?.shipping?.boxnow?.destinationId ||
    (
      typeof order?.locker === "string"
        ? order.locker
        : (
            order?.locker?.id ||
            order?.locker?.boxnowLockerId ||
            ""
          )
    )
  ).trim();
}


/*
 * Atomic claim.
 *
 * pending -> creating
 *
 * Αυτό είναι το κομμάτι που μας προστατεύει
 * από duplicate Viva webhooks.
 */
async function claimBoxNowShipping(orderId) {
  const db = getDB();

  const orderRef = db
    .collection(COLLECTIONS.ORDERS)
    .doc(orderId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);

    if (!snap.exists) {
      return null;
    }

    const order = {
      id: snap.id,
      ...snap.data(),
    };

    if (order.paymentStatus !== "paid") {
      return null;
    }

    if (order.delivery !== "boxnow") {
      return null;
    }

    const shippingStatus = String(
      order.shipping?.status || "pending"
    )
      .trim()
      .toLowerCase();

    /*
     * creating:
     * άλλο webhook το έχει ήδη αναλάβει
     *
     * created:
     * έχει ήδη δημιουργηθεί BOX NOW parcel
     *
     * failed:
     * δεν κάνουμε αυτόματο retry
     */
    if (shippingStatus !== "pending") {
      console.log("BOX NOW shipping skipped", {
        orderId,
        shippingStatus,
      });

      return null;
    }

    const lockerId = getBoxNowLockerId(order);

    if (!lockerId) {
      const failedAt = nowIso();

      tx.update(orderRef, {
        "shipping.status": "failed",
        "shipping.error": "BOX NOW destination locker is missing",
        "shipping.failedAt": failedAt,
        "shipping.updatedAt": failedAt,
        updatedAt: failedAt,
      });

      return null;
    }

    const attemptId = createId("boxnowattempt");
    const claimedAt = nowIso();

    tx.update(orderRef, {
      "shipping.status": "creating",
      "shipping.attemptId": attemptId,
      "shipping.claimedAt": claimedAt,
      "shipping.updatedAt": claimedAt,
      updatedAt: claimedAt,
    });

    return {
      order,
      attemptId,
    };
  });
}


/*
 * creating -> created
 */
async function markBoxNowShippingCreated({
  order,
  attemptId,
  result,
}) {
  const db = getDB();

  const orderRef = db
    .collection(COLLECTIONS.ORDERS)
    .doc(order.id);

  const parcelIds = Array.isArray(result?.parcels)
    ? result.parcels
        .map((parcel) => String(parcel?.id || "").trim())
        .filter(Boolean)
    : [];

  if (!result?.id || !parcelIds.length) {
    throw new ApiError(
      502,
      "BOX NOW response did not contain delivery or parcel id"
    );
  }

  const completedAt = nowIso();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);

    if (!snap.exists) {
      return;
    }

    const current = snap.data();

    /*
     * Βεβαιωνόμαστε ότι αποθηκεύουμε result
     * μόνο για το ίδιο attempt.
     */
    if (current.shipping?.attemptId !== attemptId) {
      console.warn(
        "BOX NOW result ignored because attempt id changed",
        {
          orderId: order.id,
          attemptId,
          currentAttemptId:
            current.shipping?.attemptId || null,
        }
      );

      return;
    }

    tx.update(orderRef, {
      "shipping.status": "created",
      "shipping.error": null,

      "shipping.boxnow.environment":
        String(process.env.BOXNOW_MODE || "mock")
          .trim()
          .toLowerCase(),

      "shipping.boxnow.originId":
        String(process.env.BOXNOW_ORIGIN_ID || "").trim() || null,

      "shipping.boxnow.destinationId":
        getBoxNowLockerId(order),

      "shipping.boxnow.deliveryRequestId":
        String(result.id),

      "shipping.boxnow.parcelIds":
        parcelIds,

      "shipping.boxnow.createdAt":
        completedAt,

      "shipping.boxnow.updatedAt":
        completedAt,

      "shipping.completedAt":
        completedAt,

      "shipping.updatedAt":
        completedAt,

      updatedAt:
        completedAt,
    });
  });

  console.log("BOX NOW shipping created", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    deliveryRequestId: String(result.id),
    parcelIds,
  });
}


/*
 * creating -> failed
 *
 * Η πληρωμή ΔΕΝ αλλάζει.
 * Το order παραμένει paid.
 */
async function markBoxNowShippingFailed({
  orderId,
  attemptId,
  error,
}) {
  const db = getDB();

  const orderRef = db
    .collection(COLLECTIONS.ORDERS)
    .doc(orderId);

  const failedAt = nowIso();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);

    if (!snap.exists) {
      return;
    }

    const current = snap.data();

    if (current.shipping?.attemptId !== attemptId) {
      return;
    }

    tx.update(orderRef, {
      "shipping.status": "failed",

      "shipping.error":
        error?.message ||
        "BOX NOW delivery creation failed",

      "shipping.failedAt":
        failedAt,

      "shipping.updatedAt":
        failedAt,

      updatedAt:
        failedAt,
    });
  });

  console.error("BOX NOW shipping failed", {
    orderId,
    attemptId,
    message: error?.message,
  });
}


/*
 * Εκτελείται μόνο αφού η Viva πληρωμή
 * έχει ήδη αποθηκευτεί ως paid.
 */
async function processPaidBoxNowShipping(orderId) {
  const claimed = await claimBoxNowShipping(orderId);

  if (!claimed) {
    return;
  }

  const {
    order,
    attemptId,
  } = claimed;

  try {
    console.log(
      "Creating BOX NOW delivery after successful payment",
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        destinationId: getBoxNowLockerId(order),
        attemptId,
      }
    );

    /*
     * External BOX NOW API call.
     *
     * Πολύ σημαντικό:
     * βρίσκεται ΕΚΤΟΣ Firestore transaction.
     */
    const result = await createBoxNowDelivery(order);

    await markBoxNowShippingCreated({
      order,
      attemptId,
      result,
    });
  } catch (error) {
    await markBoxNowShippingFailed({
      orderId: order.id,
      attemptId,
      error,
    });

    /*
     * Δεν κάνουμε throw.
     *
     * Η Viva πληρωμή έχει ήδη ολοκληρωθεί.
     * Δεν θέλουμε BOX NOW failure να κάνει
     * το Viva webhook HTTP 500.
     */
  }
}


/* ==================================================
   VIVA PAYMENT WEBHOOK
================================================== */

export async function markOrderPaidFromVivaWebhook(payload) {
  let paidOrderForEmail = null;

  const data = getEventData(payload);

  const vivaOrderCode = String(
    getVivaField(
      data,
      [
        "OrderCode",
        "orderCode",
        "OrderId",
        "orderId",
      ]
    ) || ""
  );

  const transactionId = String(
    getVivaField(
      data,
      [
        "TransactionId",
        "transactionId",
        "TransactionID",
        "transactionID",
      ]
    ) || ""
  );

  const rawStatusId = getVivaField(
    data,
    [
      "StatusId",
      "statusId",
      "StatusID",
      "statusID",
    ]
  );

  const amount = toCents(
    getVivaField(
      data,
      [
        "Amount",
        "amount",
      ]
    )
  );

  console.log(
    "========== PAYMENT WEBHOOK PARSED =========="
  );

  console.log({
    vivaOrderCode,
    transactionId,
    rawStatusId,
    amount,
    successful:
      isSuccessfulVivaPayment(data),
  });

  if (!vivaOrderCode || !transactionId) {
    console.warn(
      "Viva webhook ignored: invalid payload",
      {
        vivaOrderCode,
        transactionId,
        payload,
      }
    );

    return;
  }

  if (!isSuccessfulVivaPayment(data)) {
    console.warn(
      "Viva webhook ignored: payment not successful",
      {
        vivaOrderCode,
        transactionId,
        statusId: rawStatusId,
      }
    );

    return;
  }

  const db = getDB();
  const paidAt = nowIso();


  await db.runTransaction(async (tx) => {
    const found =
      await findOrderByVivaOrderCode(
        tx,
        db,
        vivaOrderCode
      );

    if (!found) {
      console.warn(
        "Webhook transaction stopped: order not found"
      );

      return;
    }

    const {
      ref,
      order,
    } = found;

    console.log(
      "Order found for webhook:",
      {
        id: order.id,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        customerEmail:
          order.customer?.email,

        hasEmails:
          Boolean(
            order.emails?.paidOrderSentAt
          ),
      }
    );


    /*
     * Duplicate Viva webhook.
     *
     * Δεν ξανατρέχουμε payment/QR logic.
     *
     * Μετά το transaction όμως το BOX NOW
     * helper θα ελέγξει μόνο του:
     *
     * pending / creating / created / failed
     */
    if (order.paymentStatus === "paid") {
      console.log(
        "Order already paid. Will still check email/shipping if needed.",
        {
          orderId: order.id,
          emailsSent:
            Boolean(
              order.emails?.paidOrderSentAt
            ),
          shippingStatus:
            order.shipping?.status || null,
        }
      );

      paidOrderForEmail = order;

      return;
    }


    /*
     * Pending checkout may have atomically
     * reserved ready QR codes.
     *
     * For older orders without inventoryReservations,
     * retain the legacy path.
     */
    const qrAssignments = [];

    const holds =
      Array.isArray(
        order.inventoryReservations
      )
        ? order.inventoryReservations
        : null;


    if (holds) {
      if (
        order.inventoryReservationState !==
        "held"
      ) {
        throw new ApiError(
          409,
          "Checkout inventory reservation is not held"
        );
      }

      const heldByItem =
        new Map(
          holds.map(
            (h) => [
              String(h.orderItemId),
              h,
            ]
          )
        );

      const allIds =
        holds.flatMap(
          (h) =>
            h.qrIds ||
            []
        );

      if (
        new Set(allIds).size !==
        allIds.length
      ) {
        throw new ApiError(
          409,
          "Duplicate reserved QR detected"
        );
      }

      const heldSnaps =
        await Promise.all(
          allIds.map(
            (id) =>
              tx.get(
                db
                  .collection(
                    COLLECTIONS.QR_CODES
                  )
                  .doc(String(id))
              )
          )
        );

      const heldDocs =
        new Map(
          heldSnaps.map(
            (doc) => [
              doc.id,
              doc,
            ]
          )
        );


      for (
        const item of
        order.items ||
        []
      ) {
        if (!item.customQr) {
          continue;
        }

        const hold =
          heldByItem.get(
            String(item.id)
          );

        const sku =
          getItemSku(item);

        const key =
          buildQrInventoryKey(item);

        const quantity =
          Number(item.quantity);


        if (
          !hold ||
          hold.productId !== item.productId ||
          hold.sku !== sku ||
          hold.inventoryKey !== key ||
          !Number.isSafeInteger(quantity) ||
          quantity < 1 ||
          (hold.qrIds || []).length +
            hold.fallbackQuantity !==
            quantity
        ) {
          throw new ApiError(
            409,
            "Invalid checkout QR reservation"
          );
        }


        for (
          const id of
          hold.qrIds ||
          []
        ) {
          const snap =
            heldDocs.get(
              String(id)
            );

          const qr =
            snap?.data();


          if (
            !snap?.exists ||
            qr.status !== "reserved" ||
            qr.reservationOrderId !== order.id ||
            qr.reservationItemId !== item.id ||
            qr.inventoryKey !== key
          ) {
            throw new ApiError(
              409,
              "Reserved QR changed before payment confirmation"
            );
          }


          qrAssignments.push({
            type: "existing",
            ref: snap.ref,
            item,
            sku,
            inventoryKey: key,
            qrConfig:
              buildQrConfig(item),
          });
        }


        for (
          let i = 0;
          i < hold.fallbackQuantity;
          i += 1
        ) {
          const qrId =
            createId("qr");

          const {
            shortId,
            reservationRef,
          } =
            await reserveUniqueQrShortId(
              tx,
              db
            );


          qrAssignments.push({
            type: "new",
            qrId,
            shortId,
            reservationRef,
            item,
            sku,
            inventoryKey: key,
            qrConfig:
              buildQrConfig(item),
          });
        }
      }
    } else {
      /*
       * Legacy order path.
       */
      const existingQrSnap =
        await tx.get(
          db
            .collection(
              COLLECTIONS.QR_CODES
            )
            .where(
              "orderId",
              "==",
              order.id
            )
        );

      if (existingQrSnap.empty) {
        const selected =
          new Set();

        for (
          const item of
          order.items ||
          []
        ) {
          if (!item.customQr) {
            continue;
          }

          const quantity =
            Number(
              item.quantity
            );

          if (
            !Number.isSafeInteger(
              quantity
            ) ||
            quantity < 1
          ) {
            throw new ApiError(
              409,
              "Invalid legacy order quantity"
            );
          }

          const sku =
            getItemSku(item);

          const key =
            buildQrInventoryKey(item);

          const readySnap =
            await tx.get(
              db
                .collection(
                  COLLECTIONS.QR_CODES
                )
                .where(
                  "status",
                  "==",
                  "available"
                )
                .where(
                  "inventoryKey",
                  "==",
                  key
                )
            );

          const ready =
            readySnap.docs.filter(
              (doc) =>
                !selected.has(
                  doc.ref.path
                ) &&
                [
                  "uploaded",
                  "email_sent",
                ].includes(
                  doc.data()
                    .printStatus
                ) &&
                Boolean(
                  doc.data()
                    .printFileUrl
                )
            );


          for (
            let i = 0;
            i < quantity;
            i += 1
          ) {
            const doc =
              ready[i];

            if (doc) {
              selected.add(
                doc.ref.path
              );

              qrAssignments.push({
                type: "existing",
                ref: doc.ref,
                item,
                sku,
                inventoryKey: key,
                qrConfig:
                  buildQrConfig(item),
              });
            } else {
              const qrId =
                createId("qr");

              const {
                shortId,
                reservationRef,
              } =
                await reserveUniqueQrShortId(
                  tx,
                  db
                );

              qrAssignments.push({
                type: "new",
                qrId,
                shortId,
                reservationRef,
                item,
                sku,
                inventoryKey: key,
                qrConfig:
                  buildQrConfig(item),
              });
            }
          }
        }
      }
    }


    const expectedAmount =
      Math.round(
        Number(
          order.total ||
          0
        ) * 100
      );


    if (
      !amount ||
      !expectedAmount ||
      amount !== expectedAmount
    ) {
      throw new ApiError(
        400,
        "Viva amount does not match order total",
        {
          orderId:
            order.id,

          vivaOrderCode,

          vivaAmount:
            amount,

          expectedAmount,
        }
      );
    }


    /*
     * New checkout flow:
     * stock is only consumed after Viva confirms payment.
     *
     * Cart / pending checkout reservations reduce storefront availability
     * but do NOT mutate product stock.
     */
    const stockReservations =
      Array.isArray(order.stockReservations)
        ? order.stockReservations
        : null;

    if (stockReservations) {
      if (
        order.stockReservationState !== "held" ||
        Date.parse(String(order.stockReservationExpiresAt || "")) <= Date.now()
      ) {
        throw new ApiError(
          409,
          "Checkout inventory reservation expired before payment confirmation"
        );
      }

      const reservationByItem = new Map(
        stockReservations.map((reservation) => [
          String(
            reservation.orderItemId ||
            reservation.holdId ||
            ""
          ),
          reservation,
        ])
      );

      const fallbackByItem = new Map();

      for (const item of order.items || []) {
        const quantity = Number(item.quantity || 0);
        const reservation = reservationByItem.get(String(item.id));

        if (
          !reservation ||
          Number(reservation.quantity || 0) !== quantity
        ) {
          throw new ApiError(
            409,
            "Checkout inventory reservation does not match the order"
          );
        }

        if (!item.customQr) {
          fallbackByItem.set(String(item.id), quantity);
        }
      }

      for (const assignment of qrAssignments) {
        if (assignment.type !== "new") continue;

        const itemId = String(assignment.item?.id || "");

        fallbackByItem.set(
          itemId,
          Number(fallbackByItem.get(itemId) || 0) + 1
        );
      }

      const productIds = [
        ...new Set(
          (order.items || []).map((item) =>
            String(item.productId)
          )
        ),
      ];

      const productEntries = await Promise.all(
        productIds.map(async (productId) => {
          const productRef = db
            .collection(COLLECTIONS.PRODUCTS)
            .doc(productId);

          return {
            productId,
            productRef,
            snap: await tx.get(productRef),
          };
        })
      );

      const products = new Map(
        productEntries.map((entry) => [
          entry.productId,
          entry,
        ])
      );

      const holdKeys = [
        ...new Set(
          stockReservations
            .map((reservation) =>
              String(reservation.inventoryKey || "")
            )
            .filter(Boolean)
        ),
      ];

      const holdEntries = await Promise.all(
        holdKeys.map(async (inventoryKey) => {
          const holdRef = db
            .collection(COLLECTIONS.INVENTORY_HOLDS)
            .doc(reservationDocId(inventoryKey));

          return {
            inventoryKey,
            holdRef,
            snap: await tx.get(holdRef),
          };
        })
      );

      const liveHoldsById = new Map();

      for (const entry of holdEntries) {
        if (!entry.snap.exists) {
          continue;
        }

        for (
          const hold of pruneExpiredHolds(
            entry.snap.data()?.holds,
            Date.now()
          )
        ) {
          liveHoldsById.set(
            String(hold.id),
            hold
          );
        }
      }

      for (const reservation of stockReservations) {
        const liveHold =
          liveHoldsById.get(
            String(reservation.holdId || "")
          );

        if (
          !liveHold ||
          String(liveHold.orderId || "") !==
            String(order.id) ||
          String(liveHold.orderItemId || "") !==
            String(reservation.orderItemId || "") ||
          liveHold.phase !== "checkout" ||
          Number(liveHold.quantity || 0) !==
            Number(reservation.quantity || 0)
        ) {
          throw new ApiError(
            409,
            "Checkout inventory reservation is no longer active"
          );
        }
      }

      for (const item of order.items || []) {
        const requiredFallback =
          Number(
            fallbackByItem.get(String(item.id)) || 0
          );

        if (requiredFallback <= 0) {
          continue;
        }

        const entry =
          products.get(String(item.productId));

        if (!entry?.snap?.exists) {
          throw new ApiError(
            409,
            "Product disappeared before payment confirmation"
          );
        }

        const product = {
          id: entry.snap.id,
          ...entry.snap.data(),
        };

        const variantIndex =
          findStoredVariantIndex(
            product,
            item.variant
          );

        if (variantIndex >= 0) {
          const variants = [
            ...(product.variants || []),
          ];

          const currentStock =
            Number(
              variants[variantIndex]?.stock || 0
            );

          if (currentStock < requiredFallback) {
            throw new ApiError(
              409,
              "Reserved stock is no longer available"
            );
          }

          variants[variantIndex] = {
            ...variants[variantIndex],
            stock:
              currentStock -
              requiredFallback,
          };

          tx.update(
            entry.productRef,
            {
              variants,
              updatedAt:
                paidAt,
            }
          );
        } else {
          const currentStock =
            Number(product.stock || 0);

          if (currentStock < requiredFallback) {
            throw new ApiError(
              409,
              "Reserved stock is no longer available"
            );
          }

          tx.update(
            entry.productRef,
            {
              stock:
                currentStock -
                requiredFallback,
              updatedAt:
                paidAt,
            }
          );
        }
      }

      for (const entry of holdEntries) {
        if (!entry.snap.exists) {
          continue;
        }

        const active =
          pruneExpiredHolds(
            entry.snap.data()?.holds,
            Date.now()
          );

        const orderItemIds =
          new Set(
            (order.items || []).map((item) =>
              String(item.id)
            )
          );

        tx.set(
          entry.holdRef,
          {
            holds:
              active.filter(
                (hold) =>
                  !orderItemIds.has(
                    String(hold.id)
                  )
              ),
            updatedAt:
              paidAt,
          },
          {
            merge:
              true,
          }
        );
      }
    }


    /*
     * Το shipping object έχει ήδη δημιουργηθεί
     * από το order.service.js.
     *
     * Δεν ξαναγράφουμε:
     *
     * shipping.status
     * shipping.provider
     * shipping.boxnow.destinationId
     *
     * εδώ.
     */
    tx.update(
      ref,
      {
        status:
          "paid",

        paymentStatus:
          "paid",

        // ============================
        // FULFILLMENT
        // ============================

        fulfillmentStatus:
          "to_prepare",

        qrCodesCreated:
          qrAssignments.length,

        ...(holds
          ? {
              inventoryReservationState:
                "consumed",
            }
          : {}),

        ...(stockReservations
          ? {
              stockReservationState:
                "consumed",
              stockReservationConsumedAt:
                paidAt,
            }
          : {}),

        "warehouse.checklist.productPicked":
          false,

        "warehouse.checklist.sizeVerified":
          false,

        "warehouse.checklist.qrAttached":
          false,

        "warehouse.checklist.qrTested":
          false,

        "warehouse.checklist.packed":
          false,

        "receipt.uploaded":
          false,

        "receipt.sentToCustomer":
          false,


        // ============================
        // PAYMENT
        // ============================

        "payment.transactionId":
          transactionId,

        "payment.statusId":
          rawStatusId ||
          null,

        "payment.amount":
          amount ||
          expectedAmount,

        "payment.rawWebhook":
          payload,

        "payment.paidAt":
          paidAt,

        "payment.updatedAt":
          paidAt,

        updatedAt:
          paidAt,
      }
    );


    /*
     * QR ASSIGNMENTS
     */
    for (
      const assignment of
      qrAssignments
    ) {
      const item =
        assignment.item;


      const userId =
        order.ownerType ===
        "user"
          ? order.ownerId
          : null;


      const guestId =
        order.ownerType ===
        "guest"
          ? order.ownerId
          : null;


      if (
        assignment.type ===
        "existing"
      ) {
        tx.update(
          assignment.ref,
          {
            status:
              "assigned",

            reservationOrderId:
              null,

            reservationItemId:
              null,

            reservationExpiresAt:
              null,

            userId,
            guestId,

            orderId:
              order.id,

            orderItemId:
              item.id,

            productId:
              item.productId,

            productTitle:
              item.title,

            sku:
              assignment.sku,

            inventoryKey:
              assignment.inventoryKey,

            variant:
              item.variant ||
              null,

            targetUrl:
              item.qrDestination ||
              "https://skanare.com",

            fulfillmentMode:
              "preprinted",

            assignedAt:
              paidAt,

            updatedAt:
              paidAt,
          }
        );

        continue;
      }


      const qrRef =
        db
          .collection(
            COLLECTIONS.QR_CODES
          )
          .doc(
            assignment.qrId
          );


      writeQrShortIdReservation(
        tx,
        assignment.reservationRef,
        {
          qrId:
            assignment.qrId,

          shortId:
            assignment.shortId,

          createdAt:
            paidAt,
        }
      );


      tx.set(
        qrRef,
        {
          id:
            assignment.qrId,

          shortId:
            assignment.shortId,

          status:
            "assigned",

          productId:
            item.productId,

          productTitle:
            item.title,

          sku:
            assignment.sku,

          inventoryKey:
            assignment.inventoryKey,

          variant:
            item.variant ||
            null,

          userId,
          guestId,

          orderId:
            order.id,

          orderItemId:
            item.id,

          targetUrl:
            item.qrDestination ||
            "https://skanare.com",

          qrConfig:
            assignment.qrConfig,

          fulfillmentMode:
            "made_to_order",

          scans:
            0,

          createdAt:
            paidAt,

          assignedAt:
            paidAt,

          updatedAt:
            paidAt,
        }
      );
    }


    paidOrderForEmail = {
      ...order,

      status:
        "paid",

      paymentStatus:
        "paid",

      fulfillmentStatus:
        "to_prepare",

      qrCodesCreated:
        qrAssignments.length,

      payment: {
        ...(
          order.payment ||
          {}
        ),

        transactionId,

        statusId:
          rawStatusId ||
          null,

        amount:
          amount ||
          expectedAmount,

        rawWebhook:
          payload,

        paidAt,

        updatedAt:
          paidAt,
      },

      updatedAt:
        paidAt,
    };


    /*
     * Clear cart after successful payment.
     */
    tx.set(
      db
        .collection(
          COLLECTIONS.CARTS
        )
        .doc(
          order.ownerId
        ),
      {
        userId:
          order.ownerId,

        items:
          [],

        checkoutOrderId:
          null,

        checkoutStartedAt:
          null,

        updatedAt:
          paidAt,
      }
    );
  });


  console.log(
    "After transaction paidOrderForEmail:",
    {
      exists:
        Boolean(
          paidOrderForEmail
        ),

      orderId:
        paidOrderForEmail?.id,

      emailAlreadySent:
        Boolean(
          paidOrderForEmail
            ?.emails
            ?.paidOrderSentAt
        ),

      delivery:
        paidOrderForEmail?.delivery,

      shippingStatus:
        paidOrderForEmail
          ?.shipping
          ?.status,
    }
  );


  /* ==================================================
     BOX NOW
     ONLY AFTER SUCCESSFUL PAYMENT
  ================================================== */

  if (
    paidOrderForEmail?.id &&
    paidOrderForEmail?.delivery === "boxnow"
  ) {
    try {
      await processPaidBoxNowShipping(
        paidOrderForEmail.id
      );
    } catch (error) {
      /*
       * Extra safety.
       *
       * BOX NOW must never turn an already
       * successful Viva payment into an error.
       */
      console.error(
        "Unexpected BOX NOW post-payment error",
        {
          orderId:
            paidOrderForEmail.id,

          message:
            error?.message,
        }
      );
    }
  }


  /* ==================================================
     RECEIPT
  ================================================== */

  if (
    paidOrderForEmail &&
    process.env.PAYMENT_RECEIPT_MODE !== "manual" &&
    ![
      "issued",
      "completed",
    ].includes(
      paidOrderForEmail
        .invoice
        ?.status
    )
  ) {
    try {
      const receipt =
        await issueOrderReceipt(
          paidOrderForEmail
        );

      const issuedAt =
        nowIso();

      await getDB()
        .collection(
          COLLECTIONS.ORDERS
        )
        .doc(
          paidOrderForEmail.id
        )
        .set(
          {
            invoice: {
              provider:
                "oxygen",

              status:
                receipt.status ||
                "issued",

              mock:
                Boolean(
                  receipt.mock
                ),

              externalId:
                receipt.id ||
                null,

              number:
                receipt.number ||
                null,

              type:
                receipt.type ||
                (
                  paidOrderForEmail.billing?.documentType === "invoice"
                    ? "invoice"
                    : "retail_receipt"
                ),

              invoiceDetails:
                paidOrderForEmail.billing?.documentType === "invoice"
                  ? paidOrderForEmail.billing?.invoiceDetails || null
                  : null,

              mark:
                receipt.mark ||
                null,

              pdfUrl:
                receipt.pdfUrl ||
                null,

              issuedAt:
                receipt.issuedAt ||
                issuedAt,

              updatedAt:
                issuedAt,
            },

            updatedAt:
              issuedAt,
          },
          {
            merge: true,
          }
        );

      console.log(
        "Order receipt stored",
        {
          orderId:
            paidOrderForEmail.id,

          mock:
            Boolean(
              receipt.mock
            ),
        }
      );
    } catch (error) {
      console.error(
        "Order receipt issue failed",
        {
          orderId:
            paidOrderForEmail.id,

          message:
            error?.message,
        }
      );

      const failedAt =
        nowIso();

      await getDB()
        .collection(
          COLLECTIONS.ORDERS
        )
        .doc(
          paidOrderForEmail.id
        )
        .set(
          {
            invoice: {
              provider:
                "oxygen",

              status:
                "failed",

              error:
                error?.message ||
                "Receipt issue failed",

              updatedAt:
                failedAt,
            },

            updatedAt:
              failedAt,
          },
          {
            merge: true,
          }
        );
    }
  }


  /* ==================================================
     EMAIL
  ================================================== */

  // Order confirmation is independent of
  // BOX NOW and automated invoicing.
  //
  // order-email.service.js checks
  // emails.paidOrderSentAt before sending.

  if (paidOrderForEmail) {
    try {
      await sendPaidOrderEmails(
        paidOrderForEmail
      );
    } catch (error) {
      console.error(
        "Paid order email failed",
        {
          orderId:
            paidOrderForEmail.id,

          message:
            error?.message,
        }
      );
    }
  }
}