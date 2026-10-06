import test from "node:test";
import assert from "node:assert/strict";

import {
  getInventoryKey,
  pruneExpiredHolds,
  reservedQuantity,
  reservationDocId,
  isReservationActive,
} from "../src/services/inventory-reservation.service.js";

const now = Date.parse("2026-10-03T12:00:00.000Z");

test("expired inventory holds no longer reduce availability", () => {
  const holds = [
    {
      id: "expired",
      quantity: 2,
      expiresAt: "2026-10-03T11:59:59.000Z",
    },
    {
      id: "active",
      quantity: 3,
      expiresAt: "2026-10-03T12:30:00.000Z",
    },
  ];

  const active = pruneExpiredHolds(holds, now);

  assert.deepEqual(
    active.map((hold) => hold.id),
    ["active"]
  );

  assert.equal(
    reservedQuantity(holds, { nowMs: now }),
    3
  );
});

test("reservation calculation excludes the cart's own existing hold", () => {
  const holds = [
    {
      id: "cartitem-1",
      quantity: 2,
      expiresAt: "2026-10-03T12:30:00.000Z",
    },
    {
      id: "cartitem-2",
      quantity: 1,
      expiresAt: "2026-10-03T12:30:00.000Z",
    },
  ];

  assert.equal(
    reservedQuantity(holds, {
      nowMs: now,
      excludeHoldId: "cartitem-1",
    }),
    1
  );
});

test("inventory keys are stable per product and sku", () => {
  assert.equal(
    getInventoryKey("product-1", { sku: "WHITE-S" }),
    "product-1::WHITE-S"
  );

  assert.equal(
    getInventoryKey("product-1", null),
    "product-1::__base__"
  );

  assert.equal(
    reservationDocId("product-1::WHITE-S"),
    reservationDocId("product-1::WHITE-S")
  );
});

test("reservation expiry helper is time aware", () => {
  assert.equal(
    isReservationActive(
      "2026-10-03T12:30:00.000Z",
      now
    ),
    true
  );

  assert.equal(
    isReservationActive(
      "2026-10-03T11:30:00.000Z",
      now
    ),
    false
  );
});
