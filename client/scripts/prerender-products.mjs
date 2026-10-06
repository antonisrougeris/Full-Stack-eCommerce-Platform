import fs from "node:fs/promises";
import path from "node:path";

const API_BASE = String(
  process.env.VITE_API_BASE_URL || "http://localhost:4000/api"
).replace(/\/$/, "");

const STORE_BASE = String(
  process.env.VITE_STORE_URL || "http://localhost:5173"
).replace(/\/$/, "");

const distDir = path.resolve("dist");

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(value) {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
}

function getImages(product) {
  const images = Array.isArray(product?.images)
    ? product.images.filter((image) => typeof image === "string" && image.trim())
    : [];

  if (!images.length && product?.image) {
    images.push(product.image);
  }

  return images;
}

function isInStock(product) {
  if (typeof product?.stock === "number") {
    return product.stock > 0;
  }

  if (Array.isArray(product?.variants) && product.variants.length) {
    return product.variants.some(
      (variant) => Number(variant?.stock || 0) > 0
    );
  }

  return true;
}

function productUrl(product) {
  const identifier = product?.slug || product?.id || product?._id;
  return identifier
    ? `/product/${encodeURIComponent(identifier)}`
    : "#";
}

function renderProductCard(
  product,
  index = 0,
  eagerFirstImages = 0
) {
  const images = getImages(product);
  const badge = product?.badge || "";
  const discountPercent = Math.max(0, Number(product?.discountPercent || 0));
  const currentPrice = Number(product?.price ?? product?.priceEUR ?? 0);
  const originalPrice = Number(product?.originalPrice ?? currentPrice);
  const onSale = Boolean(product?.onSale) && discountPercent > 0 && originalPrice > currentPrice;

  const imageHtml = images.length
    ? images.map((image, imageIndex) => {
        const primary = imageIndex === 0;
        const priority = primary && index < eagerFirstImages;
        return `
          <img
            class="product-image ${primary ? "is-active" : ""}"
            src="${escapeHtml(image)}"
            alt="${primary ? escapeHtml(product?.title || "") : ""}"
            loading="${priority ? "eager" : "lazy"}"
            fetchpriority="${priority ? "high" : "low"}"
            decoding="async"
            data-image-index="${imageIndex}"
            ${primary ? "" : 'aria-hidden="true"'}
          />`;
      }).join("")
    : `<div class="mini-shirt product-image-fallback" aria-hidden="true"></div>`;

  const badgeHtml = badge || onSale
    ? `<div class="product-badge-stack">${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : ""}${onSale ? `<span class="badge badge--sale">-${discountPercent}%</span>` : ""}</div>`
    : "";

  const priceHtml = onSale
    ? `<div class="product-card-price"><span class="price price--old">${formatPrice(originalPrice)}</span><span class="price price--sale">${formatPrice(currentPrice)}</span></div>`
    : `<div class="product-card-price"><span class="price">${formatPrice(currentPrice)}</span></div>`;

  return `
    <article class="product-card" data-prerendered-product="true">
      <a href="${escapeHtml(productUrl(product))}" class="product-card-anchor" aria-label="View ${escapeHtml(product?.title || "")}">
        <div class="product-media ${product?.category === "accessory" ? "grey" : ""}">
          ${badgeHtml}
          ${imageHtml}
        </div>
        <div class="product-body">
          <div class="product-row">
            <h3 class="product-title">${escapeHtml(product?.title || "")}</h3>
            ${priceHtml}
          </div>
          <p class="product-stock ${isInStock(product) ? "is-in-stock" : "is-out-of-stock"}">
            ${isInStock(product) ? "In stock" : "Out of stock"}
          </p>
        </div>
      </a>
    </article>`;
}

function itemListJsonLd(products, name) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${STORE_BASE}${productUrl(product)}`,
      item: {
        "@type": "Product",
        name: product?.title || "",
        image: getImages(product)[0] || undefined,
        offers: {
          "@type": "Offer",
          priceCurrency: "EUR",
          price: String(product?.price ?? product?.priceEUR ?? 0),
          availability: isInStock(product)
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        },
      },
    })),
  }).replace(/</g, "\\u003c");
}

async function fetchProducts(query = "") {
  const url = `${API_BASE}/products${query ? `?${query}` : ""}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Commerce-Build-Prerender/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Product prerender fetch failed (${response.status}) for ${url}`
    );
  }

  const payload = await response.json();

  const products = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.products)
      ? payload.products
      : [];

  return products.filter((product) => product?.active !== false);
}

function replaceGrid(html, gridId, renderedCards) {
  const pattern = new RegExp(
    `(<div\\s+[^>]*id=["']${gridId}["'][^>]*>)[\\s\\S]*?(<\\/div>)`,
    "i"
  );

  if (!pattern.test(html)) {
    throw new Error(`Could not find grid #${gridId}`);
  }

  return html.replace(
    pattern,
    `$1
<!-- COMMERCE_LIVE:GRID:${gridId}:START -->
${renderedCards}
<!-- COMMERCE_LIVE:GRID:${gridId}:END -->
$2`
  );
}

function hideLoadingMessage(html, loadingId) {
  const pattern = new RegExp(
    `(<p\\s+[^>]*id=["']${loadingId}["'][^>]*)(>)`,
    "i"
  );

  return html.replace(pattern, (match, start, end) => {
    if (/\shidden(?:\s|=|>)/i.test(start)) return match;
    return `${start} hidden${end}`;
  });
}

function injectJsonLd(html, jsonLd, marker) {
  const block = `
<!-- COMMERCE_LIVE:JSONLD:${marker}:START -->
<script type="application/ld+json" data-prerender="${marker}">
${jsonLd}
</script>
<!-- COMMERCE_LIVE:JSONLD:${marker}:END -->
`;

  if (!/<\/head>/i.test(html)) {
    throw new Error("HTML is missing </head>");
  }

  return html.replace(/<\/head>/i, `${block}</head>`);
}

async function prerenderHomepage() {
  const file = path.join(distDir, "index.html");
  let html = await fs.readFile(file, "utf8");

  const featured = await fetchProducts("featured=true");

  const tshirts = featured
    .filter((product) => String(product?.category || "").toLowerCase() === "tshirt")
    .slice(0, 4);

  const accessories = featured
    .filter((product) => String(product?.category || "").toLowerCase() === "accessory")
    .slice(0, 4);

  html = replaceGrid(
    html,
    "featuredTshirtsGrid",
    tshirts.map((product, index) => renderProductCard(product, index, 4)).join("\n")
  );

  html = replaceGrid(
    html,
    "featuredAccessoriesGrid",
    accessories.map((product, index) => renderProductCard(product, index, 0)).join("\n")
  );

  html = hideLoadingMessage(html, "featuredTshirtsLoading");
  html = hideLoadingMessage(html, "featuredAccessoriesLoading");

  html = injectJsonLd(
    html,
    itemListJsonLd([...tshirts, ...accessories], "Featured products"),
    "homepage-products"
  );

  await fs.writeFile(file, html, "utf8");
}

async function prerenderProductsPage() {
  const file = path.join(
    distDir,
    "src/pages/products/products.html"
  );

  let html = await fs.readFile(file, "utf8");
  const products = await fetchProducts();

  html = replaceGrid(
    html,
    "productsGrid",
    products.map((product) => renderProductCard(product)).join("\n")
  );

  html = hideLoadingMessage(html, "productsLoading");

  html = injectJsonLd(
    html,
    itemListJsonLd(products, "Skanare products"),
    "products-page"
  );

  await fs.writeFile(file, html, "utf8");
}

await Promise.all([
  prerenderHomepage(),
  prerenderProductsPage(),
]);

console.log(
  "Prerendered product HTML into homepage and products page."
);
