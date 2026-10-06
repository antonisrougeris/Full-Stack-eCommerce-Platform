export const RETURN_REASON_KEYS = [
  "changed_mind",
  "wrong_size",
  "wrong_item",
  "damaged",
  "defective",
  "not_as_described",
  "other",
];

export const RETURN_REASON_LABELS = {
  changed_mind: "Changed my mind",
  wrong_size: "Wrong size",
  wrong_item: "Wrong item received",
  damaged: "Arrived damaged",
  defective: "Defective product",
  not_as_described: "Not as described",
  other: "Other",
};

const TERMINAL = new Set(["rejected", "cancelled", "refunded"]);

const RANK = {
  requested: 0,
  provider_failed: 0,
  approving: 1,
  approved: 2,
  label_ready: 2,
  dropped_off: 3,
  in_transit: 4,
  provider_issue: 4,
  refund_pending: 5,
  refunded: 6,
};

export function getReturnWindowDays() {
  return 14;
}

export function getOrderDeliveredAt(order) {
  const values = [
    order?.shipping?.deliveredAt,
    order?.completedAt,
    order?.shipping?.status === "delivered"
      ? order?.shipping?.updatedAt
      : null,
  ].filter(Boolean);

  for (const value of values) {
    const ms = Date.parse(String(value));
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }

  return null;
}

export function getOrderReturnEligibility(
  order,
  { now = Date.now(), windowDays = getReturnWindowDays() } = {}
) {
  const payment = String(order?.paymentStatus || order?.status || "")
    .trim()
    .toLowerCase();

  if (payment !== "paid") {
    return {
      eligible: false,
      reasonCode: "payment_not_paid",
      message: "Only paid orders can be returned.",
      deliveredAt: null,
      deadline: null,
      daysRemaining: 0,
    };
  }

  const deliveredAt = getOrderDeliveredAt(order);
  const fulfillment = String(order?.fulfillmentStatus || "")
    .trim()
    .toLowerCase();
  const shipping = String(order?.shipping?.status || "")
    .trim()
    .toLowerCase();

  if (!deliveredAt && fulfillment !== "completed" && shipping !== "delivered") {
    return {
      eligible: false,
      reasonCode: "not_delivered",
      message: "Returns become available after delivery.",
      deliveredAt: null,
      deadline: null,
      daysRemaining: 0,
    };
  }

  if (!deliveredAt) {
    return {
      eligible: false,
      reasonCode: "delivery_date_missing",
      message: "Delivery date is unavailable. Please contact support.",
      deliveredAt: null,
      deadline: null,
      daysRemaining: 0,
    };
  }

  const deliveredMs = Date.parse(deliveredAt);
  const deadlineMs = deliveredMs + windowDays * 86400000;
  const deadline = new Date(deadlineMs).toISOString();

  if (Number(now) > deadlineMs) {
    return {
      eligible: false,
      reasonCode: "window_expired",
      message: `The ${windowDays}-day return window has closed.`,
      deliveredAt,
      deadline,
      daysRemaining: 0,
    };
  }

  return {
    eligible: true,
    reasonCode: "eligible",
    message: `Eligible for return within ${windowDays} days of delivery.`,
    deliveredAt,
    deadline,
    daysRemaining: Math.max(
      0,
      Math.ceil((deadlineMs - Number(now)) / 86400000)
    ),
  };
}

export function mapBoxNowReturnEvent(event) {
  const value = String(event || "").trim().toLowerCase();

  if (value === "accepted-for-return") return "dropped_off";
  if (["in-transit", "in-depot", "wait-for-load", "in-final-destination"].includes(value)) {
    return "in_transit";
  }
  if (["returned", "delivered"].includes(value)) return "refund_pending";
  if (["cancelled", "canceled"].includes(value)) return "cancelled";
  if (["missing", "lost"].includes(value)) return "provider_issue";

  return null;
}

export function advanceReturnStatus(currentStatus, candidateStatus) {
  const current = String(currentStatus || "requested").toLowerCase();
  const candidate = String(candidateStatus || "").toLowerCase();

  if (!candidate || TERMINAL.has(current)) return current;

  return (RANK[candidate] ?? RANK[current] ?? 0) >= (RANK[current] ?? 0)
    ? candidate
    : current;
}
