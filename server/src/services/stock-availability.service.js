// Generic stock helpers for the reusable eCommerce platform.
export function inventoryKey(productId, sku = "") {
  return `${String(productId)}::${String(sku || "__base__")}`;
}

export function saleableStock(value) {
  const stock = Number(value);
  if (!Number.isSafeInteger(stock) || stock < 0) {
    throw new Error("Corrupt inventory stock");
  }
  return stock;
}

export function availabilityForProduct(product) {
  const variants = Array.isArray(product?.variants)
    ? product.variants.map((variant) => ({
        ...variant,
        stock: saleableStock(Number(variant.stock || 0)),
      }))
    : [];

  if (!variants.length) {
    return {
      ...product,
      stock: saleableStock(Number(product?.stock || 0)),
    };
  }

  return {
    ...product,
    variants,
    stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
  };
}
