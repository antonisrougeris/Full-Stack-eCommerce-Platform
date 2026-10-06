import { Router } from "express";
import { getProductByIdOrSlug } from "../services/product.service.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const productDetailsHtmlPath = path.resolve(
  __dirname,
  "../../../client/dist/src/pages/product-details/product-details.html"
);

const greekProductDetailsHtmlPath = path.resolve(
  __dirname,
  "../../../client/dist/el/_templates/product-details.html"
);

const router = Router();

/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function storeName() {
  return String(process.env.STORE_NAME || "NovaStore").trim() || "NovaStore";
}

function cleanBaseUrl() {
  return String(
    process.env.PUBLIC_BASE_URL || "http://localhost:5173"
  ).replace(/\/+$/, "");
}

function productPath(identifier, locale = "en") {
  const base =
    `/product/${encodeURIComponent(identifier)}`;

  return locale === "el"
    ? `${base}?lang=el`
    : base;
}

function productUrl(product, locale = "en") {
  const slug = product.slug || product.id;

  return (
    cleanBaseUrl() +
    productPath(slug, locale)
  );
}

function productImage(product) {
  const image =
    (Array.isArray(product.images) && product.images[0]) ||
    product.image ||
    "/assets/img/placeholder-product.svg";

  if (/^https?:\/\//i.test(image)) {
    return image;
  }

  return `${cleanBaseUrl()}${
    image.startsWith("/") ? image : `/${image}`
  }`;
}

function productDescription(product, locale = "en") {
  return (
    product.shortDescription ||
    product.description ||
    (
      locale === "el"
        ? "Ποιοτικά προϊόντα από το ηλεκτρονικό μας κατάστημα."
        : "Quality products from our online store."
    )
  );
}

function isInStock(product) {
  if (
    Array.isArray(product.variants) &&
    product.variants.length > 0
  ) {
    return product.variants.some(
      (variant) => Number(variant.stock || 0) > 0
    );
  }

  if (typeof product.stock === "number") {
    return product.stock > 0;
  }

  return true;
}

/* =========================================================
   PRODUCT STRUCTURED DATA
========================================================= */

function productJsonLd(product, locale = "en") {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",

    name: product.title,

    description: productDescription(product, locale),

    image: productImage(product),

    brand: {
      "@type": "Brand",
      name: storeName(),
    },

    offers: {
      "@type": "Offer",

      url: productUrl(product, locale),

      price: String(
        product.price ?? product.priceEUR ?? 0
      ),

      priceCurrency: "EUR",

      availability: isInStock(product)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",

      seller: {
        "@type": "Organization",
        name: storeName(),
      },
    },
  }).replace(/</g, "\\u003c");
}

/* =========================================================
   GENERATE DYNAMIC SEO HTML
========================================================= */

async function renderFullProductPage(
  product,
  nonce,
  locale = "en"
) {
  const templatePath =
    locale === "el"
      ? greekProductDetailsHtmlPath
      : productDetailsHtmlPath;

  let html = await fs.readFile(
    templatePath,
    "utf8"
  );

  const url = productUrl(
    product,
    locale
  );

  const title = `${product.title} | ${storeName()}`;

  const description =
    productDescription(
      product,
      locale
    );

  const image = productImage(product);

  /* -------------------------------------------------------
     REMOVE OLD STATIC METADATA
  ------------------------------------------------------- */

  // Remove old canonical.
  html = html.replace(
    /<link\b[^>]*rel=["']canonical["'][^>]*>/gi,
    ""
  );

  // Remove old description.
  html = html.replace(
    /<meta\b[^>]*name=["']description["'][^>]*>/gi,
    ""
  );

  // Remove old Open Graph metadata.
  html = html.replace(
    /<meta\b[^>]*property=["']og:[^"']+["'][^>]*>/gi,
    ""
  );

  // Remove old Twitter metadata.
  html = html.replace(
    /<meta\b[^>]*name=["']twitter:[^"']+["'][^>]*>/gi,
    ""
  );

  // Remove any existing JSON-LD scripts.
  html = html.replace(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
    ""
  );

  /* -------------------------------------------------------
     UPDATE PAGE TITLE
  ------------------------------------------------------- */

  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(title)}</title>`
  );

  /* -------------------------------------------------------
     PRE-RENDER VISIBLE PRODUCT CONTENT
  ------------------------------------------------------- */

  const priceFormatter = new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
  });

  const currentPriceValue =
    Number(product.price ?? product.priceEUR ?? 0);

  const originalPriceValue =
    Number(product.originalPrice ?? currentPriceValue);

  const discountPercent =
    Math.max(0, Number(product.discountPercent || 0));

  const onSale =
    Boolean(product.onSale) &&
    discountPercent > 0 &&
    originalPriceValue > currentPriceValue;

  const price =
    priceFormatter.format(currentPriceValue);

  const priceHtml =
    onSale
      ? `<span class="product-price__old">${escapeHtml(priceFormatter.format(originalPriceValue))}</span><span class="product-price__current">${escapeHtml(price)}</span>`
      : `<span class="product-price__current">${escapeHtml(price)}</span>`;

  const inStock = isInStock(product);

  html = html.replace(
    /(<h1\b[^>]*id=["']productTitle["'][^>]*>)[\s\S]*?(<\/h1>)/i,
    `$1${escapeHtml(product.title)}$2`
  );

  html = html.replace(
    /(<p\b[^>]*id=["']productPrice["'][^>]*>)[\s\S]*?(<\/p>)/i,
    `$1${priceHtml}$2`
  );

  html = html.replace(
    /(<p\b[^>]*id=["']productDescription["'][^>]*>)[\s\S]*?(<\/p>)/i,
    `$1${escapeHtml(description)}$2`
  );

  html = html.replace(
    /<img\b([^>]*\bid=["']productImage["'][^>]*)>/i,
    (match, attrs) => {
      let nextAttrs = attrs
        .replace(/\s+src=["'][^"']*["']/i, "")
        .replace(/\s+alt=["'][^"']*["']/i, "")
        .replace(/\s+hidden\b/i, "");

      return `<img${nextAttrs} src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}">`;
    }
  );

  html = html.replace(
    /(<div\b[^>]*id=["']productStock["'][^>]*>)[\s\S]*?(<\/div>)/i,
    `$1${inStock ? (locale === "el" ? "Άμεσα διαθέσιμο" : "In stock") : (locale === "el" ? "Εξαντλημένο" : "Out of stock")}$2`
  );

  html = html.replace(
    /(<p\b[^>]*id=["']productBadge["'][^>]*>)[\s\S]*?(<\/p>)/i,
    (match, start, end) => {
      if (!product.badge) {
        return match;
      }

      return `${start.replace(/\shidden\b/i, "")}${escapeHtml(product.badge)}${end}`;
    }
  );

  html = html.replace(
    /(<p\b[^>]*id=["']productSaleBadge["'][^>]*>)[\s\S]*?(<\/p>)/i,
    (match, start, end) => {
      if (!onSale) {
        return match;
      }

      return `${start.replace(/\shidden\b/i, "")}-${discountPercent}%${end}`;
    }
  );

  /* -------------------------------------------------------
     GENERATE PRODUCT METADATA
  ------------------------------------------------------- */

  const metadata = `
    <!-- Dynamic SEO Metadata -->

    <meta
      name="description"
      content="${escapeHtml(description)}"
    />

    <link
      rel="canonical"
      href="${escapeHtml(url)}"
    />

    <link
      rel="alternate"
      hreflang="en"
      href="${escapeHtml(productUrl(product, "en"))}"
    />

    <link
      rel="alternate"
      hreflang="el"
      href="${escapeHtml(productUrl(product, "el"))}"
    />

    <link
      rel="alternate"
      hreflang="x-default"
      href="${escapeHtml(productUrl(product, "en"))}"
    />

    <!-- Open Graph -->

    <meta
      property="og:site_name"
      content="${escapeHtml(storeName())}"
    />

    <meta
      property="og:type"
      content="product"
    />

    <meta
      property="og:title"
      content="${escapeHtml(title)}"
    />

    <meta
      property="og:description"
      content="${escapeHtml(description)}"
    />

    <meta
      property="og:url"
      content="${escapeHtml(url)}"
    />

    <meta
      property="og:image"
      content="${escapeHtml(image)}"
    />

    <!-- Twitter -->

    <meta
      name="twitter:card"
      content="summary_large_image"
    />

    <meta
      name="twitter:title"
      content="${escapeHtml(title)}"
    />

    <meta
      name="twitter:description"
      content="${escapeHtml(description)}"
    />

    <meta
      name="twitter:image"
      content="${escapeHtml(image)}"
    />

    <!-- Product Structured Data -->

    <script type="application/ld+json">${productJsonLd(product, locale)}</script>
  `;

  /* -------------------------------------------------------
     INSERT METADATA INTO HEAD
  ------------------------------------------------------- */

  if (!/<\/head>/i.test(html)) {
    throw new Error(
      "Product HTML template is missing the closing head tag"
    );
  }

  html = html.replace(
    /<\/head>/i,
    `${metadata}\n</head>`
  );

  html = html.replace(
    /<script(?![^>]*\bsrc=)(?![^>]*\bnonce=)([^>]*)>/gi,
    `<script nonce="${escapeHtml(nonce)}"$1>`
  );

  return html;
}

/* =========================================================
   PRODUCT SEO ROUTE
========================================================= */

async function handleProductPage(
  req,
  res,
  next,
  locale = "en"
) {
  try {
    const requestedSlug =
      req.params.slug;

    const product =
      await getProductByIdOrSlug(
        requestedSlug,
        { locale }
      );

    if (
      !product ||
      product.active === false
    ) {
      return res
        .status(404)
        .send(
          locale === "el"
            ? "Το προϊόν δεν βρέθηκε"
            : "Product not found"
        );
    }

    const canonicalSlug =
      String(
        product.slug ||
        product.id
      );

    if (
      requestedSlug !==
      canonicalSlug
    ) {
      return res.redirect(
        301,
        productPath(
          canonicalSlug,
          locale
        )
      );
    }

    const html =
      await renderFullProductPage(
        product,
        res.locals.cspNonce,
        locale
      );

    res.status(200);
    res.setHeader(
      "Content-Type",
      "text/html; charset=utf-8"
    );
    res.setHeader(
      "Content-Language",
      locale
    );
    res.setHeader(
      "Cache-Control",
      "no-cache"
    );

    return res.send(html);
  } catch (error) {
    next(error);
  }
}

router.get(
  "/product/:slug",
  (req, res, next) =>
    handleProductPage(
      req,
      res,
      next,
      String(
        req.query?.lang || ""
      ).toLowerCase() === "el"
        ? "el"
        : "en"
    )
);

router.get(
  "/el/product/:slug",
  (req, res, next) =>
    handleProductPage(
      req,
      res,
      next,
      "el"
    )
);

export default router;