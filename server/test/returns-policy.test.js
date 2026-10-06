import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceReturnStatus,
  getOrderReturnEligibility,
  getReturnWindowDays,
  mapReturnShippingEvent,
} from "../src/services/returns-policy.service.js";

const order = {
  paymentStatus: "paid",
  fulfillmentStatus: "completed",
  completedAt: "2026-10-01T10:00:00.000Z",
};

test("allows delivered paid order inside return window", () => {
  const result = getOrderReturnEligibility(order, {
    now: Date.parse("2026-10-05T10:00:00.000Z"),
    windowDays: 14,
  });

  assert.equal(result.eligible, true);
  assert.equal(result.daysRemaining, 10);
});

test("rejects expired return window", () => {
  const result = getOrderReturnEligibility(order, {
    now: Date.parse("2026-10-20T10:00:00.000Z"),
    windowDays: 14,
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reasonCode, "window_expired");
});

test("maps shipping-provider return lifecycle", () => {
  assert.equal(mapReturnShippingEvent("accepted-for-return"), "dropped_off");
  assert.equal(mapReturnShippingEvent("in-transit"), "in_transit");
  assert.equal(mapReturnShippingEvent("returned"), "refund_pending");
});

test("does not regress return status", () => {
  assert.equal(
    advanceReturnStatus("refund_pending", "in_transit"),
    "refund_pending"
  );
  assert.equal(
    advanceReturnStatus("refunded", "in_transit"),
    "refunded"
  );
});


test("return window is always 14 days", () => {
  const previous = process.env.RETURN_WINDOW_DAYS;
  process.env.RETURN_WINDOW_DAYS = "30";

  try {
    assert.equal(getReturnWindowDays(), 14);
  } finally {
    if (previous === undefined) {
      delete process.env.RETURN_WINDOW_DAYS;
    } else {
      process.env.RETURN_WINDOW_DAYS = previous;
    }
  }
});
