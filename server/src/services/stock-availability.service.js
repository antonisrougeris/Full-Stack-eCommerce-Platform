// Pure stock helpers shared by catalog, checkout and Viva payment processing.
// A "ready" QR has a successfully uploaded print file; failed artwork is NOT stock.
export function isReadyQr(qr) {
  return qr?.status === 'available' &&
    ['uploaded', 'email_sent'].includes(qr?.printStatus) &&
    typeof qr?.printFileUrl === 'string' && Boolean(qr.printFileUrl.trim());
}

export function inventoryKey(productId, sku) {
  return `${String(productId)}::${String(sku)}`;
}

export function saleableStock(fallback, ready) {
  const a = Number(fallback);
  const b = Number(ready);
  if (!Number.isSafeInteger(a) || a < 0 || !Number.isSafeInteger(b) || b < 0) {
    throw new Error('Corrupt inventory stock');
  }
  return a + b;
}

export function availabilityForProduct(product, readyCountByKey = new Map()) {
  if (!Array.isArray(product.variants) || !product.variants.length) return product;
  const variants = product.variants.map(variant => {
    const fallbackStock = Number(variant.stock || 0);
    const readyQrStock = product.customQr
      ? (readyCountByKey.get(inventoryKey(product.id, variant.sku)) || 0)
      : 0;
    return {
      ...variant,
      madeToOrderStock: fallbackStock,
      readyQrStock,
      stock: saleableStock(fallbackStock, readyQrStock),
    };
  });
  return {
    ...product,
    variants,
    madeToOrderStock: Number(product.stock || 0),
    readyQrStock: variants.reduce((sum, v) => sum + v.readyQrStock, 0),
    stock: variants.reduce((sum, v) => sum + v.stock, 0),
  };
}

/** Pure allocation plan: ready stock first, then fallback for the deficit. */
export function planStockAllocation(readyDocs, selectedPaths, quantity, fallbackStock) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new Error('Invalid quantity');
  }
  if (!Number.isSafeInteger(fallbackStock) || fallbackStock < 0) {
    throw new Error('Invalid fallback stock');
  }
  const chosen = readyDocs.filter(doc => !selectedPaths.has(doc.ref.path)).slice(0, quantity);
  const shortage = quantity - chosen.length;
  if (shortage > fallbackStock) throw new Error('Insufficient stock');
  return {readyDocs: chosen, fallbackQuantity: shortage};
}
