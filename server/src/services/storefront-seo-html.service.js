import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { listProductsService } from "./product.service.js";

const distDir = fileURLToPath(
  new URL("../../../client/dist/", import.meta.url)
);

const LIVE_MARKER_PREFIX = "COMMERCE_LIVE";

let activeRefresh = null;

function baseUrl() {
  return String(
    process.env.PUBLIC_BASE_URL ||
    process.env.PUBLIC_SITE_URL ||
    "http://localhost:5173"
  ).replace(/\/+$/, "");
}

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
    ? product.images.filter(
        (image) =>
          typeof image === "string" &&
          image.trim()
      )
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

  if (
    Array.isArray(product?.variants) &&
    product.variants.length
  ) {
    return product.variants.some(
      (variant) =>
        Number(variant?.stock || 0) > 0
    );
  }

  return true;
}

function productUrl(product, locale = "en") {
  const identifier =
    product?.slug ||
    product?.id ||
    product?._id;

  const base = identifier
    ? `/product/${encodeURIComponent(identifier)}`
    : "#";

  return locale === "el" && base !== "#"
    ? `${base}?lang=el`
    : base;
}

export function renderProductCard(
  product,
  index = 0,
  eagerFirstImages = 0,
  locale = "en"
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
      <a href="${escapeHtml(productUrl(product, locale))}" class="product-card-anchor" aria-label="${locale === "el" ? "Προβολή" : "View"} ${escapeHtml(product?.title || "")}">
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
            ${isInStock(product) ? (locale === "el" ? "Άμεσα διαθέσιμο" : "In stock") : (locale === "el" ? "Εξαντλημένο" : "Out of stock")}
          </p>
        </div>
      </a>
    </article>`;
}

export function itemListJsonLd(products, name, locale = "en") {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: products.map(
      (product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${baseUrl()}${productUrl(product, locale)}`,
        item: {
          "@type": "Product",
          name: product?.title || "",
          image:
            getImages(product)[0] ||
            undefined,
          offers: {
            "@type": "Offer",
            priceCurrency: "EUR",
            price: String(
              product?.price ??
                product?.priceEUR ??
                0
            ),
            availability: isInStock(product)
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          },
        },
      })
    ),
  }).replace(/</g, "\\u003c");
}

export function replaceLiveBlock(
  html,
  key,
  content
) {
  const start =
    `<!-- ${LIVE_MARKER_PREFIX}:${key}:START -->`;

  const end =
    `<!-- ${LIVE_MARKER_PREFIX}:${key}:END -->`;

  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(
    end,
    startIndex + start.length
  );

  if (
    startIndex < 0 ||
    endIndex < 0
  ) {
    throw new Error(
      `Missing live SEO markers for ${key}`
    );
  }

  return (
    html.slice(
      0,
      startIndex + start.length
    ) +
    "\n" +
    content +
    "\n" +
    html.slice(endIndex)
  );
}

async function atomicWrite(file, content) {
  const tempFile =
    `${file}.${process.pid}.${Date.now()}.tmp`;

  await writeFile(
    tempFile,
    content,
    "utf8"
  );

  await rename(
    tempFile,
    file
  );
}

async function refreshLocale({
  locale = "en",
  homepageFile,
  productsFile,
}) {
  const products =
    await listProductsService({
      locale,
    });

  let featured =
    products
      .filter(
        (product) =>
          Boolean(product?.featured)
      )
      .slice(0, 4);

  if (!featured.length) {
    featured =
      products.slice(0, 4);
  }

  let [
    homepageHtml,
    productsHtml,
  ] = await Promise.all([
    readFile(homepageFile, "utf8"),
    readFile(productsFile, "utf8"),
  ]);

  homepageHtml = replaceLiveBlock(
    homepageHtml,
    "GRID:featuredProductsGrid",
    featured
      .map((product, index) =>
        renderProductCard(
          product,
          index,
          2,
          locale
        )
      )
      .join("\n")
  );

  homepageHtml = replaceLiveBlock(
    homepageHtml,
    "JSONLD:homepage-products",
    `<script type="application/ld+json" data-prerender="homepage-products">
${itemListJsonLd(
  featured,
  locale === "el"
    ? "Προτεινόμενα προϊόντα"
    : "Featured products",
  locale
)}
</script>`
  );

  productsHtml = replaceLiveBlock(
    productsHtml,
    "GRID:productsGrid",
    products
      .map((product) =>
        renderProductCard(
          product,
          0,
          0,
          locale
        )
      )
      .join("\n")
  );

  productsHtml = replaceLiveBlock(
    productsHtml,
    "JSONLD:products-page",
    `<script type="application/ld+json" data-prerender="products-page">
${itemListJsonLd(
  products,
  locale === "el"
    ? "Προϊόντα καταστήματος"
    : "Store products",
  locale
)}
</script>`
  );

  await Promise.all([
    atomicWrite(
      homepageFile,
      homepageHtml
    ),
    atomicWrite(
      productsFile,
      productsHtml
    ),
  ]);

  return {
    products:
      products.length,
    featuredProducts:
      featured.length,
  };
}

async function refreshOnce(reason) {
  const english =
    await refreshLocale({
      locale: "en",
      homepageFile:
        path.join(
          distDir,
          "index.html"
        ),
      productsFile:
        path.join(
          distDir,
          "src/pages/products/products.html"
        ),
    });

  const greek =
    await refreshLocale({
      locale: "el",
      homepageFile:
        path.join(
          distDir,
          "el/index.html"
        ),
      productsFile:
        path.join(
          distDir,
          "el/products/index.html"
        ),
    });

  console.info(
    "storefront_seo_html_refreshed",
    {
      reason,
      english,
      greek,
    }
  );

  return {
    products:
      english.products,
    featuredProducts:
      english.featuredProducts,
    greekProducts:
      greek.products,
  };
}

export function refreshStorefrontProductHtml({
  reason = "manual",
} = {}) {
  if (activeRefresh) {
    return activeRefresh;
  }

  activeRefresh =
    refreshOnce(reason)
      .finally(() => {
        activeRefresh = null;
      });

  return activeRefresh;
}

export async function refreshStorefrontProductHtmlSafe({
  reason = "manual",
} = {}) {
  try {
    return {
      success: true,
      ...(await refreshStorefrontProductHtml({
        reason,
      })),
    };
  } catch (error) {
    console.error(
      "storefront_seo_html_refresh_failed",
      {
        reason,
        message:
          error instanceof Error
            ? error.message
            : String(error),
      }
    );

    return {
      success: false,
    };
  }
}

export function startStorefrontProductHtmlRefreshLoop({
  intervalMs = 60_000,
} = {}) {
  const timer = setInterval(
    () => {
      void refreshStorefrontProductHtmlSafe({
        reason: "periodic",
      });
    },
    intervalMs
  );

  timer.unref();

  return timer;
}
