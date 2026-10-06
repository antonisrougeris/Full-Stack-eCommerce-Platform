import test from "node:test";
import assert from "node:assert/strict";

import {
  checkoutSchema,
} from "../src/utils/validators.js";

function baseCheckout() {
  return {
    phoneCountryCode: "GR",
    customer: {
      firstName: "Test",
      lastName: "Customer",
      email: "test@example.com",
      phone: "6912345678",
    },
    shippingAddress: {
      firstName: "Test",
      lastName: "Customer",
      email: "test@example.com",
      phone: "6912345678",
      country: "Greece",
      city: "Athens",
      postalCode: "10431",
      addressLine1: "Test Street 1",
      addressLine2: "",
    },
    delivery: "home",
    documentType: "receipt",
    invoiceDetails: null,
    notes: "",
  };
}

test("home delivery requires a complete shipping address", () => {
  const payload = baseCheckout();
  payload.shippingAddress.addressLine1 = "";

  const result =
    checkoutSchema.safeParse(payload);

  assert.equal(
    result.success,
    false
  );
});

test("home delivery validates postal code for the selected country", () => {
  const payload = baseCheckout();
  payload.shippingAddress.postalCode =
    "invalid";

  const result =
    checkoutSchema.safeParse(payload);

  assert.equal(
    result.success,
    false
  );
});

test("receipt checkout does not require invoice details", () => {
  const result =
    checkoutSchema.safeParse(
      baseCheckout()
    );

  assert.equal(
    result.success,
    true
  );
  assert.equal(
    result.data.documentType,
    "receipt"
  );
});

test("invoice checkout requires invoice details", () => {
  const payload = baseCheckout();
  payload.documentType = "invoice";

  const result =
    checkoutSchema.safeParse(payload);

  assert.equal(result.success, false);
});

test("invoice checkout accepts complete business details", () => {
  const payload = baseCheckout();
  payload.documentType = "invoice";
  payload.invoiceDetails = {
    companyName:
      "Example Store IKE",
    vatNumber: "123456789",
    taxOffice: "Athens",
    activity: "Retail",
    address: "Test Street 1",
    city: "Athens",
    postalCode: "10431",
  };

  const result =
    checkoutSchema.safeParse(payload);

  assert.equal(result.success, true);
  assert.equal(
    result.data.invoiceDetails
      .vatNumber,
    "123456789"
  );
});

test("checkout accepts free gift-ready tier and clears premium-only note data", () => {
  const payload = baseCheckout();
  payload.giftOptions = {
    tier: "simple",
    personalNote:
      "This must be removed.",
  };

  const result =
    checkoutSchema.safeParse(payload);

  assert.equal(result.success, true);
  assert.equal(
    result.data.giftOptions.tier,
    "simple"
  );
  assert.equal(
    result.data.giftOptions.giftBox,
    false
  );
  assert.equal(
    result.data.giftOptions
      .personalNote,
    ""
  );
});

test("checkout accepts premium gifting with a personal note", () => {
  const payload = baseCheckout();
  payload.giftOptions = {
    tier: "premium",
    personalNote:
      "Happy birthday! Enjoy your gift.",
  };

  const result =
    checkoutSchema.safeParse(payload);

  assert.equal(result.success, true);
  assert.equal(
    result.data.giftOptions.tier,
    "premium"
  );
  assert.equal(
    result.data.giftOptions.giftBox,
    true
  );
  assert.equal(
    result.data.giftOptions
      .personalNote,
    "Happy birthday! Enjoy your gift."
  );
});

test("no-gift tier clears premium-only note data", () => {
  const payload = baseCheckout();
  payload.giftOptions = {
    tier: "none",
    personalNote:
      "Should not be retained.",
  };

  const result =
    checkoutSchema.safeParse(payload);

  assert.equal(result.success, true);
  assert.equal(
    result.data.giftOptions.tier,
    "none"
  );
  assert.equal(
    result.data.giftOptions
      .personalNote,
    ""
  );
});

test("checkout rejects premium notes longer than 200 characters", () => {
  const payload = baseCheckout();
  payload.giftOptions = {
    tier: "premium",
    personalNote: "x".repeat(201),
  };

  const result =
    checkoutSchema.safeParse(payload);

  assert.equal(result.success, false);
});

test("checkout defaults to English locale", () => {
  const result =
    checkoutSchema.safeParse(
      baseCheckout()
    );

  assert.equal(result.success, true);
  assert.equal(
    result.data.locale,
    "en"
  );
});

test("checkout accepts Greek locale", () => {
  const payload = baseCheckout();
  payload.locale = "el";

  const result =
    checkoutSchema.safeParse(payload);

  assert.equal(result.success, true);
  assert.equal(
    result.data.locale,
    "el"
  );
});

test("checkout rejects unsupported locale", () => {
  const payload = baseCheckout();
  payload.locale = "fr";

  const result =
    checkoutSchema.safeParse(payload);

  assert.equal(result.success, false);
});
