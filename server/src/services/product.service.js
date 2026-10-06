import { getDB, toPlainDoc, toPlainDocs } from '../config/db.js';
import { COLLECTIONS } from '../constants/collections.js';
import { ApiError } from '../utils/apiError.js';
import { normalizeText } from '../utils/product.js';
import { chooseProductImages } from './product-colors.service.js';
import { availabilityForProduct, inventoryKey, isReadyQr } from './stock-availability.service.js';
import {
  getInventoryKey,
  readActiveReservationCounts,
} from './inventory-reservation.service.js';
import {
  decorateProductPricing,
} from './product-pricing.service.js';
import {
  localizeProduct,
  normalizeLocale,
} from './localization.service.js';

function withDefaultGallery(product) {
  const images = chooseProductImages(product, product.defaultColor);
  return decorateProductPricing({
    ...product,
    currency: product.currency || 'EUR',
    images: images.length ? images : product.images || [],
    image: images[0] || product.image || '',
  });
}

function matchVariant(product, selected) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (!variants.length) {
    if (selected && Object.values(selected).some(Boolean)) {
      throw new ApiError(400, 'Product has no selectable variant');
    }
    return null;
  }
  if (!selected?.sku) throw new ApiError(400, 'Choose a valid size and color');
  const found = variants.find(v =>
    String(v.sku) === String(selected.sku) &&
    String(v.size || '').toLowerCase() === String(selected.size || '').toLowerCase() &&
    String(v.color || '').toLowerCase() === String(selected.color || '').toLowerCase()
  );
  if (!found) throw new ApiError(400, 'Selected SKU, size and color do not match');
  return found;
}

export function resolveVariantOrThrow(product, selectedVariant) {
  return matchVariant(product, selectedVariant);
}

export function assertStockForVariant(product, variant, quantity) {
  const qty = Number(quantity);
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > 99) {
    throw new ApiError(400, 'Quantity must be between 1 and 99');
  }
  const available = Number(variant ? variant.stock : product.stock);
  if (!Number.isSafeInteger(available) || available < qty) {
    throw new ApiError(400, 'Not enough stock for selected variant');
  }
}

// IMPORTANT: This reads available QR records to derive a storefront quantity, not to
// reserve them. Checkout performs the authoritative query inside its transaction.
async function readReadyCounts(db) {
  const snap = await db.collection(COLLECTIONS.QR_CODES)
    .where('status', '==', 'available').get();
  const counts = new Map();
  for (const doc of snap.docs) {
    const qr = doc.data();
    if (!isReadyQr(qr)) continue;
    const key = qr.inventoryKey || inventoryKey(qr.productId, qr.sku);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function applyActiveReservations(product, reservedCounts) {
  if (Array.isArray(product.variants) && product.variants.length) {
    const variants = product.variants.map((variant) => {
      const key = getInventoryKey(product.id, variant);
      const reserved = Number(reservedCounts.get(key) || 0);
      const gross = Number(variant.stock || 0);

      return {
        ...variant,
        reservedStock: reserved,
        stock: Math.max(0, gross - reserved),
      };
    });

    return {
      ...product,
      variants,
      reservedStock: variants.reduce(
        (sum, variant) => sum + Number(variant.reservedStock || 0),
        0
      ),
      stock: variants.reduce(
        (sum, variant) => sum + Number(variant.stock || 0),
        0
      ),
    };
  }

  const key = getInventoryKey(product.id, null);
  const reserved = Number(reservedCounts.get(key) || 0);
  const gross = Number(product.stock || 0);

  return {
    ...product,
    reservedStock: reserved,
    stock: Math.max(0, gross - reserved),
  };
}

export async function listProductsService({category, q, featured, limit, locale = "en"} = {}) {
  const db = getDB();
  const snap = await db.collection(COLLECTIONS.PRODUCTS).get();
  let products = toPlainDocs(snap).filter(p => p.active !== false);
  if (category && category !== 'All') products = products.filter(p => p.category === category);
  if (featured !== undefined) {
    const desired = featured === true || featured === 'true';
    products = products.filter(p => Boolean(p.featured) === desired);
  }
  if (q) {
    const needle = normalizeText(q);
    products = products.filter((p) => {
      const localized = localizeProduct(
        p,
        normalizeLocale(locale)
      );

      return [
        localized.title,
        localized.shortDescription,
        localized.description,
        p.title,
        p.shortDescription,
        p.description,
        p.category,
        p.slug,
      ].some((field) =>
        normalizeText(field).includes(needle)
      );
    });
  }
  products.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const n = Number(limit);
  if (Number.isSafeInteger(n) && n > 0) products = products.slice(0, n);
  if (!products.some(p => p.customQr && p.variants?.length)) {
    return products.map((product) =>
      localizeProduct(
        withDefaultGallery(product),
        locale
      )
    );
  }
  const [ready, reserved] = await Promise.all([
    readReadyCounts(db),
    readActiveReservationCounts(db),
  ]);

  return products.map((product) =>
    localizeProduct(
      withDefaultGallery(
        applyActiveReservations(
          availabilityForProduct(product, ready),
          reserved
        )
      ),
      locale
    )
  );
}

export async function getProductByIdOrSlug(idOrSlug, { locale = "en" } = {}) {
  const db = getDB();
  const identifier = String(idOrSlug || '');
  let product;
  const doc = await db.collection(COLLECTIONS.PRODUCTS).doc(identifier).get();
  if (doc.exists) product = toPlainDoc(doc);
  else {
    const query = await db.collection(COLLECTIONS.PRODUCTS)
      .where('slug', '==', identifier).limit(1).get();
    if (query.empty) throw new ApiError(404, 'Product not found');
    product = { id: query.docs[0].id, ...query.docs[0].data() };
  }
  if (product.active === false) throw new ApiError(404, 'Product not found');
  if (!product.customQr || !product.variants?.length) {
    return localizeProduct(
      withDefaultGallery(product),
      locale
    );
  }
  const [ready, reserved] = await Promise.all([
    readReadyCounts(db),
    readActiveReservationCounts(db),
  ]);

  return localizeProduct(
    withDefaultGallery(
      applyActiveReservations(
        availabilityForProduct(product, ready),
        reserved
      )
    ),
    locale
  );
}
