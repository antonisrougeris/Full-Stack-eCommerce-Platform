// Skanare product-color schema — pure validation, no database access.
// Caller translates validation errors to ApiError(400, ...).
const text = (value) => String(value ?? "").trim();
const validImage = (value) => /^\/assets\/[\w./%-]+$/.test(value) || /^https:\/\/[^\s]+$/i.test(value);

export function parseProductColors(rawColors, rawDefault = "") {
  if (rawColors === undefined || rawColors === null) {
    return { colorOptions: [], defaultColor: "" };
  }
  if (!Array.isArray(rawColors) || rawColors.length > 20) {
    throw new Error("colorOptions must be an array with at most 20 colors");
  }
  const names = new Set();
  const colorOptions = rawColors.map((raw) => {
    const name = text(raw?.name);
    const hex = text(raw?.hex || "#CCCCCC");
    if (!name || name.length > 60) throw new Error("Each color needs a name (max 60 characters)");
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid hex color: ${name}`);
    if (names.has(name.toLowerCase())) throw new Error(`Duplicate color: ${name}`);
    names.add(name.toLowerCase());
    if (!Array.isArray(raw.images) || raw.images.length > 20 ||
      raw.images.some((image) => typeof image !== "string" || image.length > 1500 || !validImage(image))) {
      throw new Error(`Invalid images for color ${name}`);
    }
    // Explicit per-color overrides are kept only when present; otherwise the
    // print service can select contrasting colors by shirt color.
    const option = { name, hex: hex.toUpperCase(), images: [...raw.images] };
    if (raw.qrConfig && typeof raw.qrConfig === "object" && !Array.isArray(raw.qrConfig)) {
      option.qrConfig = { ...raw.qrConfig };
    }
    return option;
  });
  const chosen = text(rawDefault) || colorOptions[0]?.name || "";
  const selected = colorOptions.find((item) => item.name.toLowerCase() === chosen.toLowerCase());
  if (colorOptions.length && !selected) throw new Error("defaultColor must be one of colorOptions");
  if (!colorOptions.length && chosen) throw new Error("defaultColor requires colorOptions");
  return { colorOptions, defaultColor: selected?.name || "" };
}

export function parseProductVariants(rawVariants, colorOptions = []) {
  if (!Array.isArray(rawVariants) || rawVariants.length > 100) {
    throw new Error("variants must be an array with at most 100 entries");
  }
  const bySku = new Set();
  const bySelection = new Set();
  return rawVariants.map((raw) => {
    const sku = text(raw?.sku);
    const size = text(raw?.size);
    const rawColor = text(raw?.color);
    const color = colorOptions.length
      ? colorOptions.find((option) => option.name.toLowerCase() === rawColor.toLowerCase())?.name
      : rawColor;
    const stock = Number(raw?.stock);
    if (!sku || sku.length > 120 || !/^[a-z0-9_-]+$/i.test(sku)) throw new Error("Every variant needs a valid SKU");
    if (size.length > 60 || rawColor.length > 60) throw new Error(`Size or color too long for ${sku}`);
    if (colorOptions.length && !color) throw new Error(`Variant ${sku} uses unavailable color ${rawColor}`);
    if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) {
      throw new Error(`Variant ${sku} needs a non-negative integer made-to-order stock`);
    }
    const skuKey = sku.toLowerCase();
    const comboKey = `${(color || "").toLowerCase()}\u0000${size.toLowerCase()}`;
    if (bySku.has(skuKey)) throw new Error(`Duplicate SKU: ${sku}`);
    if (bySelection.has(comboKey)) throw new Error(`Duplicate color/size: ${color || "Default"}/${size || "One size"}`);
    bySku.add(skuKey);
    bySelection.add(comboKey);
    return { sku, size, color: color || "", stock };
  });
}

export function ensureLegacySkusUnchanged(previous = [], next = []) {
  const nextBySku = new Map(next.map((v) => [String(v.sku).toLowerCase(), v]));
  for (const old of previous) {
    const found = nextBySku.get(String(old.sku || "").toLowerCase());
    if (!found) throw new Error(`Cannot remove existing SKU ${old.sku} while orders/QRs may reference it`);
    if (text(found.size).toLowerCase() !== text(old.size).toLowerCase() ||
        text(found.color).toLowerCase() !== text(old.color).toLowerCase()) {
      throw new Error(`Cannot change size/color of existing SKU ${old.sku}`);
    }
  }
}

export function chooseProductImages(product, color = "") {
  const option = (product.colorOptions || []).find((item) =>
    text(item.name).toLowerCase() === text(color || product.defaultColor).toLowerCase());
  const specific = option?.images?.filter(Boolean) || [];
  return specific.length ? specific : (product.images || []).filter(Boolean);
}

export function resolveQrConfigForColor(product, color) {
  const base = product.qrConfig || {};
  const option = (product.colorOptions || []).find((item) =>
    text(item.name).toLowerCase() === text(color).toLowerCase());
  if (option?.qrConfig) return { ...base, ...option.qrConfig };
  // Apply contrast only for products that opt into multi-color galleries.
  // Single-color legacy products keep their historic artwork config unchanged.
  const multiColor = (product.colorOptions || []).length > 1;
  const tone = text(color).toLowerCase();
  if (multiColor && (tone === "black" || tone === "white")) {
    const ink = tone === "black" ? "#FFFFFF" : "#000000";
    return { ...base, qrColor: ink, textColor: ink };
  }
  return { ...base };
}

export function findExactVariant(product, { sku, size, color }) {
  const matched = (product.variants || []).find((variant) => String(variant.sku) === String(sku));
  if (!matched) throw new Error("SKU does not belong to the selected product");
  if (text(matched.size).toLowerCase() !== text(size).toLowerCase() ||
      text(matched.color).toLowerCase() !== text(color).toLowerCase()) {
    throw new Error("Selected SKU, size and color do not match");
  }
  return matched;
}
