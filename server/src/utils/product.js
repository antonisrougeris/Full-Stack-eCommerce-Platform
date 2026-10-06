export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function variantMatches(productVariant, selectedVariant) {
  if (!selectedVariant)
    return (
      !productVariant?.sku && !productVariant?.size && !productVariant?.color
    );

  if (selectedVariant.sku && productVariant.sku === selectedVariant.sku) {
    return true;
  }

  const sizeOk =
    !selectedVariant.size || selectedVariant.size === productVariant.size;
  const colorOk =
    !selectedVariant.color || selectedVariant.color === productVariant.color;

  return sizeOk && colorOk;
}
