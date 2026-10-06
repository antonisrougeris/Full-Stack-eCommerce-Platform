import "./i18n/auto";

import { initLayout } from "./components/initLayout";
import { renderProducts } from "./components/renderProducts";
import { getProducts } from "./services/products";
import { updateCartBadge } from "./utils/cart-badge";

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;

  for (const part of document.cookie.split(";")) {
    const cookie = part.trim();

    if (cookie.startsWith(prefix)) {
      return decodeURIComponent(
        cookie.slice(prefix.length)
      );
    }
  }

  return null;
}

async function initGuestSession(): Promise<void> {
  const apiBase =
    (
      import.meta.env.VITE_API_BASE_URL ||
      "/api"
    ).replace(/\/$/, "");

  try {
    await fetch(
      `${apiBase}/health/live`,
      {
        method: "GET",
        credentials: "include",
      }
    );

    const csrfToken =
      readCookie("csrf_token");

    await fetch(
      `${apiBase}/session/guest`,
      {
        method: "POST",
        credentials: "include",
        headers: csrfToken
          ? {
              "X-CSRF-Token":
                csrfToken,
            }
          : {},
      }
    );
  } catch (error) {
    console.warn(
      "Guest session could not be initialized:",
      error
    );
  }
}

function setVisible(
  id: string,
  visible: boolean
): void {
  const element =
    document.getElementById(id);

  if (element) {
    element.hidden = !visible;
  }
}

async function loadFeaturedProducts(): Promise<void> {
  const grid =
    document.getElementById(
      "featuredProductsGrid"
    );

  if (!grid) return;

  setVisible(
    "featuredProductsLoading",
    true
  );
  setVisible(
    "featuredProductsEmpty",
    false
  );
  setVisible(
    "featuredProductsError",
    false
  );

  try {
    let products =
      await getProducts({
        featured: true,
        active: true,
        limit: 4,
      });

    /*
     * A fresh installation may not have products explicitly marked as
     * featured yet. Show the first active products instead of leaving
     * the marketplace demo homepage empty.
     */
    if (!products.length) {
      products =
        await getProducts({
          active: true,
          limit: 4,
        });
    }

    renderProducts(
      grid,
      products,
      {
        eagerFirstImages: 2,
      }
    );

    setVisible(
      "featuredProductsEmpty",
      products.length === 0
    );
  } catch (error) {
    console.error(
      "Failed to load featured products:",
      error
    );

    setVisible(
      "featuredProductsError",
      true
    );
  } finally {
    setVisible(
      "featuredProductsLoading",
      false
    );
  }
}

async function initHomepage(): Promise<void> {
  initLayout();

  await initGuestSession();

  await Promise.allSettled([
    updateCartBadge(),
    loadFeaturedProducts(),
  ]);
}

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      void initHomepage();
    },
    { once: true }
  );
} else {
  void initHomepage();
}
