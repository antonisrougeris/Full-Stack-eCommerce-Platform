import test from "node:test";
import assert from "node:assert/strict";

import {
  localizeProduct,
  normalizeLocale,
} from "../src/services/localization.service.js";

test("normalizeLocale supports English and Greek", () => {
  assert.equal(normalizeLocale("en-GB"), "en");
  assert.equal(normalizeLocale("el-GR"), "el");
  assert.equal(normalizeLocale("fr"), "en");
});

test("Greek product content uses curated translation", () => {
  const product = localizeProduct(
    {
      id: "qr-keychain",
      title: "QR Keychain",
      shortDescription: "Carry your link.",
      description: "English description",
      merchandisingTag: "best_seller",
      translations: {
        el: {
          title: "Μπρελόκ QR",
          shortDescription: "Ο σύνδεσμός σου παντού.",
          description: "Ελληνική περιγραφή",
        },
      },
    },
    "el"
  );

  assert.equal(product.title, "Μπρελόκ QR");
  assert.equal(product.shortDescription, "Ο σύνδεσμός σου παντού.");
  assert.equal(product.description, "Ελληνική περιγραφή");
  assert.equal(product.badge, "Δημοφιλές");
});

test("Greek product content falls back to English when translation is empty", () => {
  const product = localizeProduct(
    {
      title: "QR Tote Bag",
      shortDescription: "English short",
      description: "English long",
      translations: {
        el: {
          title: "",
          shortDescription: "",
          description: "",
        },
      },
    },
    "el"
  );

  assert.equal(product.title, "QR Tote Bag");
  assert.equal(product.shortDescription, "English short");
  assert.equal(product.description, "English long");
});

test("English product content is not overwritten", () => {
  const original = {
    title: "QR Card",
    badge: "Custom badge",
    translations: {
      el: {
        title: "Κάρτα QR",
      },
    },
  };

  const product = localizeProduct(original, "en");

  assert.equal(product.title, "QR Card");
  assert.equal(product.badge, "Custom badge");
});
