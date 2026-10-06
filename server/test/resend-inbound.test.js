import test from "node:test";
import assert from "node:assert/strict";

import {
  isAllowedInboundRecipient,
} from "../src/services/resend-inbound.service.js";

test("accepts configured inbound recipients", () => {
  const previous =
    process.env.INBOUND_EMAIL_RECIPIENTS;

  process.env.INBOUND_EMAIL_RECIPIENTS =
    "info@example.com, hello@example.com";

  try {
    assert.equal(
      isAllowedInboundRecipient(
        "info@example.com"
      ),
      true
    );

    assert.equal(
      isAllowedInboundRecipient(
        "Store <hello@example.com>"
      ),
      true
    );

    assert.equal(
      isAllowedInboundRecipient(
        "sales@example.com"
      ),
      false
    );
  } finally {
    if (previous === undefined) {
      delete process.env
        .INBOUND_EMAIL_RECIPIENTS;
    } else {
      process.env
        .INBOUND_EMAIL_RECIPIENTS =
        previous;
    }
  }
});

test("disables inbound forwarding when recipients are not configured", () => {
  const previous =
    process.env.INBOUND_EMAIL_RECIPIENTS;

  delete process.env
    .INBOUND_EMAIL_RECIPIENTS;

  try {
    assert.equal(
      isAllowedInboundRecipient(
        "info@example.com"
      ),
      false
    );
  } finally {
    if (previous !== undefined) {
      process.env
        .INBOUND_EMAIL_RECIPIENTS =
        previous;
    }
  }
});
