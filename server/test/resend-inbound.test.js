import test from "node:test";
import assert from "node:assert/strict";

import {
  isAllowedInboundRecipient,
} from "../src/services/resend-inbound.service.js";

test("accepts the two public Skanare inboxes", () => {
  assert.equal(
    isAllowedInboundRecipient("info@skanare.com"),
    true
  );

  assert.equal(
    isAllowedInboundRecipient(
      "Skanare <hello@skanare.com>"
    ),
    true
  );
});

test("rejects other inbound recipients", () => {
  assert.equal(
    isAllowedInboundRecipient("sales@skanare.com"),
    false
  );

  assert.equal(
    isAllowedInboundRecipient("adminskanare@gmail.com"),
    false
  );
});
