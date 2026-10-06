const MERCHANDISING_LABELS = Object.freeze({
  none: "",
  new: "New",
  featured: "Featured",
  best_seller: "Best seller",
  limited: "Limited",
});

export function normalizeDiscountPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(
    90,
    Math.max(
      0,
      Math.round(number)
    )
  );
}

export function normalizeMerchandisingTag(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  return Object.hasOwn(
    MERCHANDISING_LABELS,
    normalized
  )
    ? normalized
    : "none";
}

export function merchandisingLabel(value) {
  return (
    MERCHANDISING_LABELS[
      normalizeMerchandisingTag(value)
    ] || ""
  );
}

export function calculateDiscountedPrice(
  basePrice,
  discountPercent
) {
  const price = Number(basePrice);

  if (!Number.isFinite(price) || price < 0) {
    return 0;
  }

  const discount =
    normalizeDiscountPercent(
      discountPercent
    );

  if (!discount) {
    return Math.round(price * 100) / 100;
  }

  return (
    Math.round(
      price *
        (1 - discount / 100) *
        100
    ) / 100
  );
}

export function getEffectiveUnitPrice(
  product,
  variant = null
) {
  const basePrice = Number(
    variant?.price ??
      product?.price ??
      product?.priceEUR ??
      0
  );

  return calculateDiscountedPrice(
    basePrice,
    product?.discountPercent
  );
}

export function decorateProductPricing(product) {
  const originalPrice = Number(
    product?.price ??
      product?.priceEUR ??
      0
  );

  const safeOriginalPrice =
    Number.isFinite(originalPrice) &&
    originalPrice >= 0
      ? Math.round(originalPrice * 100) /
        100
      : 0;

  const discountPercent =
    normalizeDiscountPercent(
      product?.discountPercent
    );

  const price =
    calculateDiscountedPrice(
      safeOriginalPrice,
      discountPercent
    );

  const merchandisingTag =
    normalizeMerchandisingTag(
      product?.merchandisingTag
    );

  return {
    ...product,

    // Public/storefront price is always the actual amount charged.
    price,
    priceEUR: price,

    // Preserve the regular price so UIs can show a crossed-out comparison.
    originalPrice:
      discountPercent > 0
        ? safeOriginalPrice
        : price,

    discountPercent,
    onSale:
      discountPercent > 0 &&
      price < safeOriginalPrice,

    merchandisingTag,

    // Legacy custom badges still work, but "featured" no longer
    // automatically produces a badge. Featured is homepage placement.
    badge:
      String(product?.badge || "").trim() ||
      merchandisingLabel(
        merchandisingTag
      ),
  };
}
