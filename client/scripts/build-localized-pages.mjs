import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = path.resolve(root, "dist");
const catalogPath = path.resolve(root, "src/i18n/catalog.json");
const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));

const pages = [
  { route: "/", source: "index.html", target: "el/index.html" },
  { route: "/products", source: "src/pages/products/products.html", target: "el/products/index.html" },
  { route: "/product", source: "src/pages/product-details/product-details.html", target: "el/_templates/product-details.html" },
  { route: "/cart", source: "src/pages/cart/cart.html", target: "el/cart/index.html" },
  { route: "/checkout", source: "src/pages/checkout/checkout.html", target: "el/checkout/index.html" },
  { route: "/contact", source: "src/pages/contact/contact.html", target: "el/contact/index.html" },
  { route: "/about", source: "src/pages/about/about.html", target: "el/about/index.html" },
  { route: "/login", source: "src/pages/login/login.html", target: "el/login/index.html" },
  { route: "/register", source: "src/pages/register/register.html", target: "el/register/index.html" },
  { route: "/forgot-password", source: "src/pages/forgot-password/forgot-password.html", target: "el/forgot-password/index.html" },
  { route: "/verify-email", source: "src/pages/verify-email/verify-email.html", target: "el/verify-email/index.html" },
  { route: "/my-qr", source: "src/pages/my-qr/my-qr.html", target: "el/my-qr/index.html" },
  { route: "/returns", source: "src/pages/returns/returns.html", target: "el/returns/index.html" },
  { route: "/payment/success", source: "src/pages/payment/payment_success.html", target: "el/payment/success/index.html" },
  { route: "/payment/failure", source: "src/pages/payment/payment_failure.html", target: "el/payment/failure/index.html" },
  { route: "/payment-security", source: "src/pages/payment-security/payment-security.html", target: "el/payment-security/index.html" },
  { route: "/shipping-policy", source: "src/pages/shipping-policy/shipping-policy.html", target: "el/shipping-policy/index.html" },
  { route: "/refund-policy", source: "src/pages/refund-policy/refund-policy.html", target: "el/refund-policy/index.html" },
  { route: "/privacy-policy", source: "src/pages/privacy-policy/privacy-policy.html", target: "el/privacy-policy/index.html" },
  { route: "/terms", source: "src/pages/terms/terms.html", target: "el/terms/index.html" },
  { route: "/cookie-policy", source: "src/pages/cookie-policy/cookie-policy.html", target: "el/cookie-policy/index.html" },
];

const BASE = "https://skanare.com";
const phrases = catalog.phrases || {};

function decodeEntities(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function encodeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalized(value) {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

function translateText(html) {
  return html.replace(/>([^<>]+)</g, (match, text) => {
    const key = normalized(text);
    const translated = phrases[key];

    if (!translated) return match;

    const leading = text.match(/^\s*/)?.[0] || "";
    const trailing = text.match(/\s*$/)?.[0] || "";

    return `>${leading}${encodeText(translated)}${trailing}<`;
  });
}

function translateAttributes(html) {
  return html.replace(
    /(placeholder|aria-label|title)=(["'])(.*?)\2/gi,
    (match, name, quote, value) => {
      const key = normalized(value);
      const translated = phrases[key];

      if (!translated) return match;

      const escaped = String(translated)
        .replaceAll("&", "&amp;")
        .replaceAll(quote, quote === '"' ? "&quot;" : "&#39;");

      return `${name}=${quote}${escaped}${quote}`;
    }
  );
}

function cleanEnglishRoute(rawPath) {
  const legacy = {
    "/index.html": "/",
    "/src/pages/products/products.html": "/products",
    "/src/pages/cart/cart.html": "/cart",
    "/src/pages/checkout/checkout.html": "/checkout",
    "/src/pages/contact/contact.html": "/contact",
    "/src/pages/about/about.html": "/about",
    "/src/pages/login/login.html": "/login",
    "/src/pages/register/register.html": "/register",
    "/src/pages/forgot-password/forgot-password.html": "/forgot-password",
    "/src/pages/verify-email/verify-email.html": "/verify-email",
    "/src/pages/my-qr/my-qr.html": "/my-qr",
    "/src/pages/returns/returns.html": "/returns",
    "/src/pages/payment/payment_success.html": "/payment/success",
    "/src/pages/payment/payment_failure.html": "/payment/failure",
    "/src/pages/payment-security/payment-security.html": "/payment-security",
    "/src/pages/shipping-policy/shipping-policy.html": "/shipping-policy",
    "/src/pages/refund-policy/refund-policy.html": "/refund-policy",
    "/src/pages/privacy-policy/privacy-policy.html": "/privacy-policy",
    "/src/pages/terms/terms.html": "/terms",
    "/src/pages/cookie-policy/cookie-policy.html": "/cookie-policy",
  };

  return legacy[rawPath] || rawPath;
}

function withGreekProductLocale(pathname, suffix = "") {
  const hashIndex = suffix.indexOf("#");
  const queryPart =
    hashIndex >= 0
      ? suffix.slice(0, hashIndex)
      : suffix;
  const hash =
    hashIndex >= 0
      ? suffix.slice(hashIndex)
      : "";

  const params = new URLSearchParams(
    queryPart.startsWith("?")
      ? queryPart.slice(1)
      : queryPart
  );

  params.set("lang", "el");

  const query = params.toString();

  return (
    pathname +
    (query ? `?${query}` : "") +
    hash
  );
}

function localizeLinks(html) {
  /*
   * Only localize actual navigation anchors.
   * Product detail pages stay on /product/:slug because that is the
   * production route proxied to Express; Greek is carried as ?lang=el.
   */
  return html.replace(
    /(<a\b[^>]*\shref=)(["'])(\/[^"'#?]*)([^"']*)\2/gi,
    (match, prefix, quote, pathname, suffix) => {
      if (
        pathname.startsWith("/api/") ||
        pathname.startsWith("/assets/") ||
        pathname.startsWith("/el/")
      ) {
        return match;
      }

      const englishPath = cleanEnglishRoute(pathname);

      if (
        /^\/product\/[^/]+\/?$/.test(
          englishPath
        )
      ) {
        return (
          `${prefix}${quote}` +
          withGreekProductLocale(
            englishPath,
            suffix
          ) +
          quote
        );
      }

      const greekPath =
        englishPath === "/"
          ? "/el/"
          : `/el${englishPath}`;

      return `${prefix}${quote}${greekPath}${suffix}${quote}`;
    }
  );
}

const SHARED_CSS_VERSION =
  "2.9-i18n-fixes";

function refreshSharedCssVersion(html) {
  return html.replace(
    /\/assets\/css\/components\.css(?:\?[^"'\s>]*)?/gi,
    `/assets/css/components.css?v=${SHARED_CSS_VERSION}`
  );
}

function upsertHead(html, route) {
  const meta = catalog.routeMeta?.[route]?.el || {};
  const english = route === "/" ? `${BASE}/` : `${BASE}${route}`;
  const greek = route === "/" ? `${BASE}/el/` : `${BASE}/el${route}`;

  html = html.replace(
    /<html\b([^>]*)>/i,
    (match, attrs) => {
      const cleaned = attrs.replace(/\slang=(["']).*?\1/i, "");
      return `<html${cleaned} lang="el">`;
    }
  );

  if (meta.title) {
    html = html.replace(
      /<title>[\s\S]*?<\/title>/i,
      `<title>${encodeText(meta.title)}</title>`
    );
  }

  if (meta.description) {
    html = html.replace(
      /<meta\b[^>]*name=(["'])description\1[^>]*>/gi,
      ""
    );
  }

  html = html
    .replace(/<link\b[^>]*rel=(["'])canonical\1[^>]*>/gi, "")
    .replace(/<link\b[^>]*rel=(["'])alternate\1[^>]*>/gi, "");

  const additions = `
    ${meta.description ? `<meta name="description" content="${String(meta.description).replaceAll('"', "&quot;")}">` : ""}
    <link rel="canonical" href="${greek}">
    <link rel="alternate" hreflang="en" href="${english}">
    <link rel="alternate" hreflang="el" href="${greek}">
    <link rel="alternate" hreflang="x-default" href="${english}">
  `;

  return html.replace(/<\/head>/i, `${additions}\n</head>`);
}

for (const page of pages) {
  const source = path.join(distDir, page.source);
  const target = path.join(distDir, page.target);

  let html = await fs.readFile(source, "utf8");

  /*
   * /assets is long-cached in production. Refresh the stylesheet query
   * on every generated page so this release is visible immediately.
   */
  html = refreshSharedCssVersion(html);
  await fs.writeFile(source, html, "utf8");

  html = translateText(html);
  html = translateAttributes(html);
  html = localizeLinks(html);
  html = upsertHead(html, page.route);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, html, "utf8");

  /*
   * Development/preview compatibility.
   * Production uses clean /el/... routes, but these aliases make the
   * old source-style URLs work as well when somebody tests the Vite build.
   */
  if (page.source.startsWith("src/pages/")) {
    const legacyTarget = path.join(
      distDir,
      "el",
      page.source
    );

    await fs.mkdir(
      path.dirname(legacyTarget),
      { recursive: true }
    );

    await fs.writeFile(
      legacyTarget,
      html,
      "utf8"
    );
  }
}

console.log(`Built ${pages.length} curated Greek storefront pages plus legacy preview aliases.`);
