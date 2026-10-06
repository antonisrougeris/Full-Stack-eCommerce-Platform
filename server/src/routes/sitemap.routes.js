import { Router } from "express";
import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";

const router = Router();

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cleanBaseUrl() {
  return String(
    process.env.PUBLIC_BASE_URL || "https://skanare.com"
  ).replace(/\/+$/, "");
}

function urlEntry({ loc, lastmod }) {
  return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    ${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ""}
  </url>`;
}

function formatLastmod(value) {
  if (!value) return null;

  try {
    const date =
      typeof value.toDate === "function"
        ? value.toDate()
        : new Date(value);

    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString();
  } catch {
    return null;
  }
}

router.get("/sitemap.xml", async (_req, res) => {
  try {
    const db = getDB();
    const baseUrl = cleanBaseUrl();

    // Public static pages
    const staticPages = [
      "/",
      "/products",
      "/contact",
      "/about",
      "/shipping-policy",
      "/refund-policy",
      "/privacy-policy",
      "/terms",
      "/cookie-policy",
      "/payment-security"
    ];

    const staticUrls = staticPages
      .flatMap((pagePath) => {
        const english =
          pagePath === "/"
            ? `${baseUrl}/`
            : `${baseUrl}${pagePath}`;

        const greek =
          pagePath === "/"
            ? `${baseUrl}/el/`
            : `${baseUrl}/el${pagePath}`;

        return [
          urlEntry({
            loc: english,
          }),
          urlEntry({
            loc: greek,
          }),
        ];
      })
      .join("");

    // Products from Firestore
    const productsSnap = await db
      .collection(COLLECTIONS.PRODUCTS)
      .get();

    const productUrls = productsSnap.docs
      .map((doc) => {
        const product = doc.data() || {};

        // Exclude inactive products
        if (product.active === false) {
          return null;
        }

        const identifier =
          product.slug || product.id || doc.id;

        if (!identifier) return null;

        const lastmod = formatLastmod(
          product.updatedAt || product.createdAt
        );

        const slug =
          encodeURIComponent(
            identifier
          );

        return [
          urlEntry({
            loc:
              `${baseUrl}/product/${slug}`,
            lastmod,
          }),
          urlEntry({
            loc:
              `${baseUrl}/product/${slug}?lang=el`,
            lastmod,
          }),
        ].join("");
      })
      .filter(Boolean)
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${productUrls}
</urlset>`;

    res.status(200);
    res.setHeader(
      "Content-Type",
      "application/xml; charset=utf-8"
    );

    // Avoid serving an outdated sitemap
    res.setHeader(
      "Cache-Control",
      "no-cache, must-revalidate"
    );

    res.send(xml);

  } catch (error) {
    console.error("Sitemap error:", error);

    res.status(500)
      .type("text/plain")
      .send("Sitemap error");
  }
});

export default router;