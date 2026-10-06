import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { createId, nowIso } from "../utils/ids.js";
import { createBoxNowCustomerReturn, getBoxNowParcelLabel } from "./boxnow.service.js";
import { getOrdersForUser } from "./order.service.js";
import { sendEmail } from "./email.service.js";
import { brandedEmailTemplate } from "./email-template.service.js";
import {
  RETURN_REASON_KEYS,
  RETURN_REASON_LABELS,
  advanceReturnStatus,
  getOrderReturnEligibility,
  getReturnWindowDays,
  mapBoxNowReturnEvent,
} from "./returns-policy.service.js";

const releasedStatuses = new Set(["cancelled", "rejected"]);

function collection(db) {
  return db.collection(COLLECTIONS.RETURNS || "returns");
}

function text(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function pageUrl(returnId) {
  const base = String(
    process.env.PUBLIC_SITE_URL || process.env.SITE_URL || "https://skanare.com"
  ).replace(/\/+$/, "");
  return `${base}/returns?returnId=${encodeURIComponent(String(returnId))}`;
}

function activeReturn(request) {
  return !releasedStatuses.has(String(request?.status || "").toLowerCase());
}

function reservedQuantityByItem(returnRequests) {
  const result = new Map();

  for (const request of returnRequests) {
    if (!activeReturn(request)) continue;

    for (const item of request.items || []) {
      const key = String(item.orderItemId || "");
      if (!key) continue;
      result.set(key, (result.get(key) || 0) + Number(item.quantity || 0));
    }
  }

  return result;
}

async function getOrder(orderId) {
  const db = getDB();
  const snap = await db.collection(COLLECTIONS.ORDERS).doc(String(orderId)).get();

  if (!snap.exists) throw new ApiError(404, "Order not found");

  return { id: snap.id, ...snap.data() };
}

async function orderReturns(orderId, tx = null) {
  const db = getDB();
  const query = collection(db).where("orderId", "==", String(orderId));
  const snap = tx ? await tx.get(query) : await query.get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function normalizeItems(order, requested, reserved) {
  if (!Array.isArray(requested) || !requested.length) {
    throw new ApiError(400, "Select at least one item to return");
  }

  const normalized = [];
  const seen = new Set();

  for (const raw of requested) {
    const orderItemId = text(raw?.orderItemId, 200);

    if (!orderItemId || seen.has(orderItemId)) {
      throw new ApiError(400, "Invalid return item selection");
    }

    seen.add(orderItemId);

    const item = (order.items || []).find(
      (candidate) => String(candidate?.id || "") === orderItemId
    );

    if (!item) throw new ApiError(400, "Return item does not belong to this order");

    const quantity = Number(raw?.quantity);

    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new ApiError(400, "Return quantity must be a positive whole number");
    }

    const available =
      Number(item.quantity || 0) - Number(reserved.get(orderItemId) || 0);

    if (quantity > available) {
      throw new ApiError(409, `Only ${Math.max(0, available)} item(s) remain returnable`);
    }

    const reason = text(raw?.reason, 80).toLowerCase();

    if (!RETURN_REASON_KEYS.includes(reason)) {
      throw new ApiError(400, "Select a valid return reason");
    }

    const unitPrice = Number(item.unitPrice || 0);

    normalized.push({
      orderItemId,
      productId: item.productId || null,
      title: item.title || "Skanare product",
      sku: item.sku || item.variant?.sku || "",
      variant: item.variant || null,
      customQr: Boolean(item.customQr),
      quantity,
      unitPrice,
      lineRefundEstimate: Math.round(unitPrice * quantity * 100) / 100,
      reason,
      reasonLabel: RETURN_REASON_LABELS[reason] || reason,
      note: text(raw?.note, 1000),
    });
  }

  return normalized;
}

async function sendReturnEmail({ to, subject, title, intro, body, attachments = [] }) {
  if (!to) return;

  await sendEmail({
    from: process.env.EMAIL_ORDER || process.env.EMAIL_FROM,
    to,
    subject,
    html: brandedEmailTemplate({ title, intro, body }),
    attachments,
  });
}

async function notifyBestEffort(work, context) {
  try {
    await work();
  } catch (error) {
    console.error("Return notification email failed", {
      ...context,
      message: error?.message || String(error),
    });
  }
}

export async function getReturnEligibilityForUser(userId) {
  const db = getDB();
  const [orders, returnSnap] = await Promise.all([
    getOrdersForUser(userId),
    collection(db).where("userId", "==", userId).get(),
  ]);

  const returns = returnSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return orders.map((order) => {
    const reserved = reservedQuantityByItem(
      returns.filter((request) => request.orderId === order.id)
    );
    const eligibility = getOrderReturnEligibility(order);

    const items = (order.items || []).map((item) => ({
      ...item,
      returnableQuantity: Math.max(
        0,
        Number(item.quantity || 0) - Number(reserved.get(String(item.id)) || 0)
      ),
    }));

    return {
      ...order,
      items,
      returnEligibility:
        eligibility.eligible && !items.some((item) => item.returnableQuantity > 0)
          ? {
              ...eligibility,
              eligible: false,
              reasonCode: "already_returned",
              message: "All items are already included in a return.",
            }
          : eligibility,
    };
  });
}

export async function createReturnRequest({
  userId,
  orderId,
  items,
  customerNote,
  conditionConfirmed,
}) {
  if (!conditionConfirmed) {
    throw new ApiError(400, "Confirm the return condition statement");
  }

  const db = getDB();
  const orderRef = db.collection(COLLECTIONS.ORDERS).doc(String(orderId));
  const returnId = createId("return");
  const returnRef = collection(db).doc(returnId);
  const createdAt = nowIso();

  const result = await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);

    if (!orderSnap.exists) throw new ApiError(404, "Order not found");

    const order = { id: orderSnap.id, ...orderSnap.data() };

    if (order.ownerType !== "user" || order.ownerId !== userId) {
      throw new ApiError(403, "You do not have access to this order");
    }

    const eligibility = getOrderReturnEligibility(order);

    if (!eligibility.eligible) {
      throw new ApiError(409, eligibility.message);
    }

    const existing = await orderReturns(order.id, tx);
    const normalizedItems = normalizeItems(
      order,
      items,
      reservedQuantityByItem(existing)
    );

    const refundEstimate =
      Math.round(
        normalizedItems.reduce(
          (sum, item) => sum + Number(item.lineRefundEstimate || 0),
          0
        ) * 100
      ) / 100;

    const returnNumber =
      `RET-${String(order.orderNumber || order.id)}-${returnId.slice(-6).toUpperCase()}`;

    const request = {
      id: returnId,
      returnNumber,
      orderId: order.id,
      orderNumber: order.orderNumber || order.id,
      userId,
      customer: {
        firstName: order.customer?.firstName || "",
        lastName: order.customer?.lastName || "",
        email: order.customer?.email || "",
        phone: order.customer?.phone || "",
      },
      items: normalizedItems,
      customerNote: text(customerNote, 2000),
      conditionConfirmed: true,
      status: "requested",
      provider: "boxnow",
      refundEstimate,
      currency: order.currency || "EUR",
      eligibility: {
        deliveredAt: eligibility.deliveredAt,
        deadline: eligibility.deadline,
        returnWindowDays: getReturnWindowDays(),
      },
      history: [{ status: "requested", at: createdAt, actor: "customer" }],
      createdAt,
      updatedAt: createdAt,
    };

    tx.set(returnRef, request);
    tx.set(
      orderRef,
      {
        returns: {
          latestReturnId: returnId,
          latestReturnStatus: "requested",
          updatedAt: createdAt,
        },
        updatedAt: createdAt,
      },
      { merge: true }
    );

    return { order, request };
  });

  await notifyBestEffort(
    () =>
      sendReturnEmail({
        to: result.order.customer?.email,
        subject: `Return request ${result.request.returnNumber} received`,
        title: "We received your return request",
        intro: `Your return request for order ${result.request.orderNumber} is waiting for review.`,
        body: `
          <p style="color:#555;line-height:1.7;">
            Estimated item refund: <strong>€${Number(result.request.refundEstimate).toFixed(2)}</strong>.
            We will email you when the return is approved and the BOX NOW voucher is ready.
          </p>
          <p><a href="${pageUrl(result.request.id)}">View return status →</a></p>
        `,
      }),
    { returnId }
  );

  await notifyBestEffort(
    () =>
      sendReturnEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `New return request ${result.request.returnNumber}`,
        title: "New return request",
        intro: `A customer requested a return for order ${result.request.orderNumber}.`,
        body: `
          <p style="color:#555;line-height:1.7;">
            Customer: <strong>${text(result.order.customer?.email, 320)}</strong><br/>
            Estimated item refund: <strong>€${Number(result.request.refundEstimate).toFixed(2)}</strong>.
          </p>
          <p>Review the request in Skanare Admin → Returns.</p>
        `,
      }),
    { returnId, recipient: "admin" }
  );

  return result.request;
}

export async function getReturnsForUser(userId) {
  const snap = await collection(getDB()).where("userId", "==", userId).get();
  const returns = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  returns.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  return returns;
}

export async function getReturnForUser(userId, returnId) {
  const snap = await collection(getDB()).doc(String(returnId)).get();

  if (!snap.exists) throw new ApiError(404, "Return request not found");

  const request = { id: snap.id, ...snap.data() };

  if (request.userId !== userId) {
    throw new ApiError(403, "You do not have access to this return");
  }

  return request;
}

export async function cancelReturnForUser(userId, returnId) {
  const db = getDB();
  const ref = collection(db).doc(String(returnId));
  const at = nowIso();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError(404, "Return request not found");

    const request = { id: snap.id, ...snap.data() };

    if (request.userId !== userId) throw new ApiError(403, "Access denied");
    if (!["requested", "provider_failed"].includes(request.status)) {
      throw new ApiError(409, "This return can no longer be cancelled");
    }

    const patch = {
      status: "cancelled",
      cancelledAt: at,
      updatedAt: at,
      history: [
        ...(request.history || []),
        { status: "cancelled", at, actor: "customer" },
      ],
    };

    tx.update(ref, patch);
    return { ...request, ...patch };
  });
}

export async function listReturnsForAdmin() {
  const snap = await collection(getDB()).limit(500).get();
  const returns = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  returns.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  return returns;
}

export async function getReturnForAdmin(returnId) {
  const snap = await collection(getDB()).doc(String(returnId)).get();
  if (!snap.exists) throw new ApiError(404, "Return request not found");
  return { id: snap.id, ...snap.data() };
}

export async function approveReturnForAdmin(returnId, adminUser) {
  const db = getDB();
  const ref = collection(db).doc(String(returnId));
  const attemptId = createId("returnapproval");
  const startedAt = nowIso();

  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    if (!snap.exists) {
      throw new ApiError(404, "Return request not found");
    }

    const request = { id: snap.id, ...snap.data() };

    if (
      ["approved", "label_ready", "dropped_off", "in_transit", "refund_pending", "refunded"].includes(
        request.status
      )
    ) {
      return {
        claimed: false,
        alreadyApproved: true,
        request,
      };
    }

    if (request.status === "approving") {
      throw new ApiError(
        409,
        "This return is already being approved. Refresh in a moment."
      );
    }

    if (!["requested", "provider_failed"].includes(request.status)) {
      throw new ApiError(409, "Return is not ready for approval");
    }

    tx.update(ref, {
      status: "approving",
      review: {
        ...(request.review || {}),
        approvalStartedAt: startedAt,
        approvedBy: adminUser?.uid || null,
        approvedByEmail: adminUser?.email || null,
      },
      boxnow: {
        ...(request.boxnow || {}),
        approvalAttemptId: attemptId,
      },
      history: [
        ...(request.history || []),
        {
          status: "approving",
          at: startedAt,
          actor: "admin",
          adminUid: adminUser?.uid || null,
        },
      ],
      updatedAt: startedAt,
    });

    return {
      claimed: true,
      alreadyApproved: false,
      request: {
        ...request,
        status: "approving",
        boxnow: {
          ...(request.boxnow || {}),
          approvalAttemptId: attemptId,
        },
      },
    };
  });

  if (claim.alreadyApproved) {
    return claim.request;
  }

  const request = claim.request;
  const order = await getOrder(request.orderId);

  try {
    const result = await createBoxNowCustomerReturn(request, order);
    const parcel = Array.isArray(result?.parcels) ? result.parcels[0] : null;
    const parcelId = text(parcel?.id, 200) || null;
    const approvedAt = nowIso();
    const nextStatus =
      parcelId && !result?.mock
        ? "label_ready"
        : "approved";

    const updated = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);

      if (!snap.exists) {
        throw new ApiError(404, "Return request not found");
      }

      const current = { id: snap.id, ...snap.data() };

      if (current.boxnow?.approvalAttemptId !== attemptId) {
        throw new ApiError(
          409,
          "Return approval changed while BOX NOW was processing"
        );
      }

      const patch = {
        status: nextStatus,
        approvedAt,
        review: {
          ...(current.review || {}),
          approvedAt,
        },
        boxnow: {
          ...(current.boxnow || {}),
          environment:
            result?.mock
              ? "mock"
              : String(process.env.BOXNOW_MODE || "mock"),
          deliveryRequestId: result?.id || null,
          orderNumber: text(result?.orderNumber || result?.id, 200) || null,
          parcelId,
          rawCreateResponse: result,
          lastEvent: "new",
          lastEventAt: approvedAt,
        },
        history: [
          ...(current.history || []),
          {
            status: nextStatus,
            at: approvedAt,
            actor: "admin",
            adminUid: adminUser?.uid || null,
          },
        ],
        updatedAt: approvedAt,
      };

      tx.set(ref, patch, { merge: true });

      return {
        ...current,
        ...patch,
      };
    });

    let labelBuffer = null;

    if (parcelId && !result?.mock) {
      try {
        labelBuffer = await getBoxNowParcelLabel(parcelId);
      } catch (error) {
        console.error("BOX NOW return label attachment failed", {
          returnId,
          parcelId,
          message: error?.message || String(error),
        });
      }
    }

    await notifyBestEffort(
      () =>
        sendReturnEmail({
          to: order.customer?.email,
          subject: `Return ${updated.returnNumber} approved`,
          title: "Your return is approved",
          intro: "Your BOX NOW return voucher is ready.",
          body: `
            <p style="color:#555;line-height:1.7;">
              Pack the approved items securely and use the BOX NOW return voucher.
            </p>
            <p><a href="${pageUrl(updated.id)}">Open return page →</a></p>
          `,
          attachments: labelBuffer
            ? [
                {
                  filename: `SKANARE-return-${updated.returnNumber}.pdf`,
                  content: labelBuffer,
                },
              ]
            : [],
        }),
      { returnId }
    );

    return updated;
  } catch (error) {
    const failedAt = nowIso();

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);

      if (!snap.exists) return;

      const current = { id: snap.id, ...snap.data() };

      if (current.boxnow?.approvalAttemptId !== attemptId) {
        return;
      }

      tx.set(
        ref,
        {
          status: "provider_failed",
          providerError: {
            message: error?.message || String(error),
            at: failedAt,
          },
          history: [
            ...(current.history || []),
            {
              status: "provider_failed",
              at: failedAt,
              actor: "system",
            },
          ],
          updatedAt: failedAt,
        },
        { merge: true }
      );
    });

    throw error;
  }
}

export async function rejectReturnForAdmin(returnId, adminUser, note) {
  const db = getDB();
  const ref = collection(db).doc(String(returnId));
  const request = await getReturnForAdmin(returnId);

  if (!["requested", "provider_failed"].includes(request.status)) {
    throw new ApiError(409, "This return can no longer be rejected");
  }

  const at = nowIso();
  const patch = {
    status: "rejected",
    rejectedAt: at,
    review: {
      ...(request.review || {}),
      note: text(note, 2000) || "Return request was not approved.",
      rejectedBy: adminUser?.uid || null,
      rejectedByEmail: adminUser?.email || null,
    },
    history: [
      ...(request.history || []),
      { status: "rejected", at, actor: "admin", adminUid: adminUser?.uid || null },
    ],
    updatedAt: at,
  };

  await ref.set(patch, { merge: true });
  const updated = { ...request, ...patch };
  const order = await getOrder(request.orderId);

  await notifyBestEffort(
    () =>
      sendReturnEmail({
        to: order.customer?.email,
        subject: `Return ${updated.returnNumber} update`,
        title: "Return request update",
        intro: "Your return request was not approved.",
        body: `<p style="color:#555;line-height:1.7;">${text(updated.review?.note, 2000)}</p>`,
      }),
    { returnId }
  );

  return updated;
}

export async function markReturnReceivedForAdmin(returnId, adminUser) {
  const db = getDB();
  const ref = collection(db).doc(String(returnId));
  const request = await getReturnForAdmin(returnId);

  if (["cancelled", "rejected", "refunded"].includes(request.status)) {
    throw new ApiError(409, "Return cannot be marked received");
  }

  const at = nowIso();
  const patch = {
    status: "refund_pending",
    receivedAt: request.receivedAt || at,
    history: [
      ...(request.history || []),
      { status: "refund_pending", at, actor: "admin", adminUid: adminUser?.uid || null },
    ],
    updatedAt: at,
  };

  await ref.set(patch, { merge: true });

  const updated = { ...request, ...patch };
  const order = await getOrder(request.orderId);

  await notifyBestEffort(
    () =>
      sendReturnEmail({
        to: order.customer?.email,
        subject: `Return ${updated.returnNumber} received`,
        title: "We received your return",
        intro: "Your returned parcel is now awaiting refund processing.",
        body: `
          <p style="color:#555;line-height:1.7;">
            We will inspect the returned items and record the approved refund.
            Estimated item refund: <strong>€${Number(updated.refundEstimate || 0).toFixed(2)}</strong>.
          </p>
        `,
      }),
    { returnId }
  );

  return updated;
}

async function deactivateReturnedQrCodes(returnRequest, order) {
  const db = getDB();
  const snap = await db
    .collection(COLLECTIONS.QR_CODES)
    .where("orderId", "==", order.id)
    .get();

  const remaining = new Map(
    (returnRequest.items || [])
      .filter((item) => item.customQr)
      .map((item) => [
        String(item.orderItemId),
        {
          quantity: Number(item.quantity || 0),
          productId: String(item.productId || ""),
          sku: String(item.sku || ""),
        },
      ])
  );

  if (!remaining.size || snap.empty) return;

  const batch = db.batch();
  const returnedAt = nowIso();
  let changed = 0;

  for (const doc of snap.docs) {
    const qr = doc.data();
    if (String(qr.status || "") === "returned") continue;

    for (const [itemId, target] of remaining) {
      if (target.quantity <= 0) continue;

      const matches =
        (qr.orderItemId && String(qr.orderItemId) === itemId) ||
        (!qr.orderItemId &&
          String(qr.productId || "") === target.productId &&
          String(qr.sku || "") === target.sku);

      if (!matches) continue;

      batch.update(doc.ref, {
        status: "returned",
        userId: null,
        guestId: null,
        targetUrl: "https://skanare.com",
        returnedAt,
        returnId: returnRequest.id,
        updatedAt: returnedAt,
      });

      target.quantity -= 1;
      changed += 1;
      break;
    }
  }

  if (changed) await batch.commit();
}

export async function markReturnRefundedForAdmin(
  returnId,
  adminUser,
  { amount, reference } = {}
) {
  const db = getDB();
  const ref = collection(db).doc(String(returnId));
  const request = await getReturnForAdmin(returnId);

  if (request.status === "refunded") return request;
  if (request.status !== "refund_pending") {
    throw new ApiError(409, "Receive the return before marking it refunded");
  }

  const refundAmount =
    amount === undefined || amount === null || amount === ""
      ? Number(request.refundEstimate || 0)
      : Number(amount);

  if (!Number.isFinite(refundAmount) || refundAmount < 0) {
    throw new ApiError(400, "Invalid refund amount");
  }

  const at = nowIso();
  const patch = {
    status: "refunded",
    refundedAt: at,
    refund: {
      amount: Math.round(refundAmount * 100) / 100,
      currency: request.currency || "EUR",
      reference: text(reference, 500) || null,
      provider: "manual_confirmation",
      recordedAt: at,
      recordedBy: adminUser?.uid || null,
    },
    history: [
      ...(request.history || []),
      { status: "refunded", at, actor: "admin", adminUid: adminUser?.uid || null },
    ],
    updatedAt: at,
  };

  await ref.set(patch, { merge: true });
  const updated = { ...request, ...patch };
  const order = await getOrder(request.orderId);

  await deactivateReturnedQrCodes(updated, order);

  await notifyBestEffort(
    () =>
      sendReturnEmail({
        to: order.customer?.email,
        subject: `Refund processed for ${updated.returnNumber}`,
        title: "Your refund has been processed",
        intro: `The approved refund for order ${updated.orderNumber} has been recorded as processed.`,
        body: `
          <p style="color:#555;line-height:1.7;">
            Refund amount: <strong>€${Number(updated.refund.amount).toFixed(2)}</strong>.
            Your bank or payment provider may need additional time to display it.
          </p>
        `,
      }),
    { returnId }
  );

  return updated;
}

async function labelFor(request) {
  const parcelId = request.boxnow?.parcelId;
  if (!parcelId) throw new ApiError(409, "Return voucher is not ready yet");

  return {
    request,
    buffer: await getBoxNowParcelLabel(parcelId),
  };
}

export async function getReturnLabelForUser(userId, returnId) {
  return labelFor(await getReturnForUser(userId, returnId));
}

export async function getReturnLabelForAdmin(returnId) {
  return labelFor(await getReturnForAdmin(returnId));
}

async function findReturnByBoxNow({ orderNumber, parcelId }) {
  const db = getDB();

  if (orderNumber) {
    const snap = await collection(db)
      .where("boxnow.orderNumber", "==", String(orderNumber))
      .limit(1)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      return { id: doc.id, ...doc.data() };
    }
  }

  if (parcelId) {
    const snap = await collection(db)
      .where("boxnow.parcelId", "==", String(parcelId))
      .limit(1)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      return { id: doc.id, ...doc.data() };
    }
  }

  return null;
}

export async function processBoxNowReturnWebhookEvent({
  orderNumber,
  parcelId,
  event,
  eventTime,
  messageId,
  data,
  receivedAt = nowIso(),
}) {
  const request = await findReturnByBoxNow({ orderNumber, parcelId });
  if (!request) return null;

  const previous = Date.parse(request.boxnow?.lastEventAt || "");
  const incoming = Date.parse(eventTime);

  if (Number.isFinite(previous) && Number.isFinite(incoming) && incoming <= previous) {
    return {
      processed: false,
      kind: "return",
      reason: "duplicate_or_old_event",
      returnId: request.id,
    };
  }

  const mapped = mapBoxNowReturnEvent(event);
  const status = advanceReturnStatus(request.status, mapped);
  const patch = {
    status,
    boxnow: {
      ...(request.boxnow || {}),
      lastEvent: event,
      lastEventAt: eventTime,
      lastWebhookMessageId: messageId || null,
      lastWebhookReceivedAt: receivedAt,
      lastParcelId: parcelId || null,
      parcelState: data?.parcelState || null,
      eventLocation: data?.eventLocation || null,
      additionalInformation: data?.additionalInformation || null,
    },
    history: [
      ...(request.history || []),
      { status, providerEvent: event, at: eventTime, actor: "boxnow" },
    ],
    updatedAt: receivedAt,
  };

  if (status === "dropped_off") patch.droppedOffAt = request.droppedOffAt || eventTime;
  if (status === "refund_pending") patch.receivedAt = request.receivedAt || eventTime;

  await collection(getDB()).doc(request.id).set(patch, { merge: true });

  return {
    processed: true,
    kind: "return",
    returnId: request.id,
    returnNumber: request.returnNumber,
    event,
    eventTime,
    status,
  };
}
