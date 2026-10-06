import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { createId, nowIso } from "../utils/ids.js";
import { getOrdersForUser } from "./order.service.js";
import { sendEmail } from "./email.service.js";
import { brandedEmailTemplate } from "./email-template.service.js";
import {
  RETURN_REASON_KEYS,
  RETURN_REASON_LABELS,
  getOrderReturnEligibility,
  getReturnWindowDays,
} from "./returns-policy.service.js";

const releasedStatuses = new Set(["cancelled", "rejected"]);

function collection(db) {
  return db.collection(COLLECTIONS.RETURNS);
}

function text(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function pageUrl(returnId) {
  const base = String(
    process.env.PUBLIC_SITE_URL ||
    process.env.PUBLIC_BASE_URL ||
    process.env.SITE_URL ||
    "http://localhost:5173"
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
  const snap = await getDB()
    .collection(COLLECTIONS.ORDERS)
    .doc(String(orderId))
    .get();

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

    if (!item) {
      throw new ApiError(400, "Return item does not belong to this order");
    }

    const quantity = Number(raw?.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new ApiError(400, "Return quantity must be a positive whole number");
    }

    const available =
      Number(item.quantity || 0) - Number(reserved.get(orderItemId) || 0);

    if (quantity > available) {
      throw new ApiError(
        409,
        `Only ${Math.max(0, available)} item(s) remain returnable`
      );
    }

    const reason = text(raw?.reason, 80).toLowerCase();
    if (!RETURN_REASON_KEYS.includes(reason)) {
      throw new ApiError(400, "Select a valid return reason");
    }

    const unitPrice = Number(item.unitPrice || 0);

    normalized.push({
      orderItemId,
      productId: item.productId || null,
      title: item.title || "Product",
      sku: item.sku || item.variant?.sku || "",
      variant: item.variant || null,
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

async function notify({ to, subject, title, intro, body }) {
  if (!to) return;

  try {
    await sendEmail({
      from: process.env.EMAIL_ORDER || process.env.EMAIL_FROM,
      to,
      subject,
      html: brandedEmailTemplate({ title, intro, body }),
    });
  } catch (error) {
    console.error("Return notification email failed", {
      to,
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

  const returns = returnSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return orders.map((order) => {
    const reserved = reservedQuantityByItem(
      returns.filter((request) => request.orderId === order.id)
    );
    const eligibility = getOrderReturnEligibility(order);

    const items = (order.items || []).map((item) => ({
      ...item,
      returnableQuantity: Math.max(
        0,
        Number(item.quantity || 0) -
          Number(reserved.get(String(item.id)) || 0)
      ),
    }));

    return {
      ...order,
      items,
      returnEligibility:
        eligibility.eligible &&
        !items.some((item) => item.returnableQuantity > 0)
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
      `RET-${String(order.orderNumber || order.id)}-${returnId
        .slice(-6)
        .toUpperCase()}`;

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
      provider: "manual",
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

  await notify({
    to: result.order.customer?.email,
    subject: `Return request ${result.request.returnNumber} received`,
    title: "We received your return request",
    intro: `Your return request for order ${result.request.orderNumber} is waiting for review.`,
    body: `
      <p style="color:#555;line-height:1.7">
        Estimated item refund:
        <strong>€${Number(result.request.refundEstimate).toFixed(2)}</strong>.
        We will contact you with return shipping instructions after review.
      </p>
      <p><a href="${pageUrl(result.request.id)}">View return status →</a></p>
    `,
  });

  await notify({
    to: process.env.STORE_ADMIN_EMAIL || process.env.ADMIN_EMAIL,
    subject: `New return request ${result.request.returnNumber}`,
    title: "New return request",
    intro: `A customer requested a return for order ${result.request.orderNumber}.`,
    body: `
      <p style="color:#555;line-height:1.7">
        Customer: <strong>${text(result.order.customer?.email, 320)}</strong><br/>
        Estimated refund:
        <strong>€${Number(result.request.refundEstimate).toFixed(2)}</strong>.
      </p>
    `,
  });

  return result.request;
}

export async function getReturnsForUser(userId) {
  const snap = await collection(getDB()).where("userId", "==", userId).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
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
    if (request.status !== "requested") {
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
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
}

export async function getReturnForAdmin(returnId) {
  const snap = await collection(getDB()).doc(String(returnId)).get();
  if (!snap.exists) throw new ApiError(404, "Return request not found");
  return { id: snap.id, ...snap.data() };
}

export async function approveReturnForAdmin(returnId, adminUser) {
  const request = await getReturnForAdmin(returnId);

  if (request.status === "approved") return request;
  if (request.status !== "requested") {
    throw new ApiError(409, "Return is not ready for approval");
  }

  const at = nowIso();
  const patch = {
    status: "approved",
    approvedAt: at,
    review: {
      ...(request.review || {}),
      approvedAt: at,
      approvedBy: adminUser?.uid || null,
      approvedByEmail: adminUser?.email || null,
    },
    history: [
      ...(request.history || []),
      {
        status: "approved",
        at,
        actor: "admin",
        adminUid: adminUser?.uid || null,
      },
    ],
    updatedAt: at,
  };

  await collection(getDB()).doc(String(returnId)).set(patch, { merge: true });
  const updated = { ...request, ...patch };
  const order = await getOrder(request.orderId);

  await notify({
    to: order.customer?.email,
    subject: `Return ${updated.returnNumber} approved`,
    title: "Your return is approved",
    intro: "Your return request has been approved.",
    body: `
      <p style="color:#555;line-height:1.7">
        Please follow the return shipping instructions provided by the store.
        Keep your return number <strong>${updated.returnNumber}</strong> with the parcel.
      </p>
      <p><a href="${pageUrl(updated.id)}">Open return page →</a></p>
    `,
  });

  return updated;
}

export async function rejectReturnForAdmin(returnId, adminUser, note) {
  const request = await getReturnForAdmin(returnId);

  if (request.status !== "requested") {
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

  await collection(getDB()).doc(String(returnId)).set(patch, { merge: true });
  return { ...request, ...patch };
}

export async function markReturnReceivedForAdmin(returnId, adminUser) {
  const request = await getReturnForAdmin(returnId);

  if (!["approved", "in_transit"].includes(request.status)) {
    throw new ApiError(409, "Return cannot be marked received");
  }

  const at = nowIso();
  const patch = {
    status: "refund_pending",
    receivedAt: request.receivedAt || at,
    history: [
      ...(request.history || []),
      {
        status: "refund_pending",
        at,
        actor: "admin",
        adminUid: adminUser?.uid || null,
      },
    ],
    updatedAt: at,
  };

  await collection(getDB()).doc(String(returnId)).set(patch, { merge: true });
  return { ...request, ...patch };
}

export async function markReturnRefundedForAdmin(
  returnId,
  adminUser,
  { amount, reference } = {}
) {
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

  await collection(getDB()).doc(String(returnId)).set(patch, { merge: true });

  const updated = { ...request, ...patch };
  const order = await getOrder(request.orderId);

  await notify({
    to: order.customer?.email,
    subject: `Refund processed for ${updated.returnNumber}`,
    title: "Your refund has been processed",
    intro: `The approved refund for order ${updated.orderNumber} has been recorded.`,
    body: `
      <p style="color:#555;line-height:1.7">
        Refund amount:
        <strong>€${Number(updated.refund.amount).toFixed(2)}</strong>.
      </p>
    `,
  });

  return updated;
}

async function noConfiguredLabel() {
  throw new ApiError(
    409,
    "Return shipping labels are not configured. Add your preferred shipping provider integration."
  );
}

export async function getReturnLabelForUser(userId, returnId) {
  await getReturnForUser(userId, returnId);
  return noConfiguredLabel();
}

export async function getReturnLabelForAdmin(returnId) {
  await getReturnForAdmin(returnId);
  return noConfiguredLabel();
}
