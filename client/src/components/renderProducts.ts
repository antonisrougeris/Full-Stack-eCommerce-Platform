import type { Product } from "../services/products";
import { productPath, t } from "../i18n/locale";

function formatPrice(value: number): string {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getProductImages(product: Product): string[] {
  const images = Array.isArray(product.images)
    ? product.images.filter(
        (image): image is string =>
          typeof image === "string" &&
          image.trim().length > 0
      )
    : [];

  if (
    images.length === 0 &&
    typeof product.image === "string" &&
    product.image.trim()
  ) {
    images.push(product.image);
  }

  return images;
}

export interface RenderProductsOptions {
  eagerFirstImages?: number;
}

export function renderProducts(
  container: HTMLElement,
  products: Product[],
  options: RenderProductsOptions = {}
): void {
  container.innerHTML = "";

  const eagerFirstImages =
    Math.max(
      0,
      Number(
        options.eagerFirstImages ||
        0
      )
    );

  products.forEach(
    (product, productIndex) => {
    const productId = product.id || product._id;

    if (!productId) return;

    const identifier =
      product.slug ||
      product.id ||
      product._id;

    if (!identifier) return;

    const href = productPath(identifier);

    const images = getProductImages(product);

    const badgeText = product.badge || "";

    const discountPercent = Math.max(
      0,
      Number(product.discountPercent || 0)
    );

    const originalPrice = Number(
      product.originalPrice ?? product.price
    );

    const onSale =
      Boolean(product.onSale) &&
      discountPercent > 0 &&
      originalPrice > product.price;

    const inStock =
      typeof product.stock === "number"
        ? product.stock > 0
        : true;

    const article =
      document.createElement("article");

    article.className = "product-card";

    const imagesHtml = images
      .map(
        (image, index) => {
          const isPrimary =
            index === 0;

          const isPriority =
            isPrimary &&
            productIndex <
              eagerFirstImages;

          return `
          <img
            class="product-image ${
              isPrimary
                ? "is-active"
                : ""
            }"
            src="${escapeHtml(image)}"
            alt="${
              isPrimary
                ? escapeHtml(
                    product.title
                  )
                : ""
            }"
            loading="${
              isPriority
                ? "eager"
                : "lazy"
            }"
            fetchpriority="${
              isPriority
                ? "high"
                : "low"
            }"
            decoding="async"
            data-image-index="${index}"
            ${
              !isPrimary
                ? 'aria-hidden="true"'
                : ""
            }
          />
        `;
        }
      )
      .join("");

    article.innerHTML = `
      <a
        href="${escapeHtml(href)}"
        class="product-card-anchor"
        aria-label="View ${escapeHtml(product.title)}"
      >

        <div
          class="
            product-media
            ${product.category === "accessory" ? "grey" : ""}
          "
        >

          ${
            badgeText || onSale
              ? `
                <div class="product-badge-stack">
                  ${badgeText ? `<span class="badge">${escapeHtml(badgeText)}</span>` : ""}
                  ${onSale ? `<span class="badge badge--sale">-${discountPercent}%</span>` : ""}
                </div>
              `
              : ""
          }

          ${
            images.length > 0
              ? imagesHtml
              : `
                <div
                  class="mini-shirt product-image-fallback"
                  aria-hidden="true"
                ></div>
              `
          }

        </div>

        <div class="product-body">

          <div class="product-row">

            <h3 class="product-title">
              ${escapeHtml(product.title)}
            </h3>

            <div class="product-card-price">
              ${onSale ? `<span class="price price--old">${formatPrice(originalPrice)}</span>` : ""}
              <span class="price ${onSale ? "price--sale" : ""}">
                ${formatPrice(product.price)}
              </span>
            </div>

          </div>

          <p
            class="
              product-stock
              ${inStock ? "is-in-stock" : "is-out-of-stock"}
            "
          >
            ${inStock ? t("product.inStock", "In stock") : t("product.outOfStock", "Out of stock")}
          </p>

        </div>

      </a>
    `;

    /*
     * Desktop hover image cycling:
     *
     * 1st hover  -> image 2
     * 2nd hover  -> image 3
     * 3rd hover  -> image 1
     */
    if (images.length > 1) {
      const media =
        article.querySelector<HTMLElement>(
          ".product-media"
        );

      const productImages =
        Array.from(
          article.querySelectorAll<HTMLElement>(
            ".product-image"
          )
        );

      let currentImageIndex = 0;

      media?.addEventListener(
        "mouseenter",
        () => {
          /*
           * Only execute on actual hover devices.
           */
          if (
            !window.matchMedia(
              "(hover: hover) and (pointer: fine)"
            ).matches
          ) {
            return;
          }

          currentImageIndex =
            (currentImageIndex + 1) %
            productImages.length;

          productImages.forEach(
            (image, index) => {
              image.classList.toggle(
                "is-active",
                index === currentImageIndex
              );
            }
          );
        }
      );
    }

    container.appendChild(article);
  });
}