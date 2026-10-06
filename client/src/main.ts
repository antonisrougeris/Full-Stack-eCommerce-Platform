import "./i18n/auto";
/* 3220089_3220172 */

import { initNav } from "./components/initNav";
import { initMobileMenu } from "./components/menu";
import { renderProducts } from "./components/renderProducts";
import { getProducts } from "./services/products";
import { updateCartBadge } from "./utils/cart-badge";
import { firebaseAuth } from "./services/firebase";

import { initCookieConsent } from "./components/cookieConsent";


function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;

  for (const part of document.cookie.split(";")) {
    const cookie = part.trim();

    if (cookie.startsWith(prefix)) {
      return decodeURIComponent(cookie.slice(prefix.length));
    }
  }

  return null;
}

async function initGuestSession(): Promise<void> {
  try {
    // Prime the CSRF cookie through a safe request before creating a guest session.
    await fetch(`${import.meta.env.VITE_API_BASE_URL}/health/live`, {
      method: "GET",
      credentials: "include",
    });

    const csrfToken = readCookie("csrf_token");

    await fetch(`${import.meta.env.VITE_API_BASE_URL}/session/guest`, {
      method: "POST",
      credentials: "include",
      headers: csrfToken
        ? { "X-CSRF-Token": csrfToken }
        : {},
    });
  } catch (error) {
    console.error("Failed to initialize guest session:", error);
  }
}

function initCountdown(): void {
  const bar = document.getElementById("comingSoonBar");
  const targetDate = new Date("2026-10-15T00:00:00").getTime(); // 12 μέρες από σήμερα

  function pad(n: number): string {
    return n.toString().padStart(2, "0");
  }

  function tick(): void {
    const now = Date.now();
    const diff = targetDate - now;

    if (diff <= 0) {
      bar?.remove(); 
      clearInterval(interval);
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    const daysEl = document.getElementById("cs-days");
    const hoursEl = document.getElementById("cs-hours");
    const minutesEl = document.getElementById("cs-minutes");
    const secondsEl = document.getElementById("cs-seconds");

    if (daysEl) daysEl.textContent = pad(days);
    if (hoursEl) hoursEl.textContent = pad(hours);
    if (minutesEl) minutesEl.textContent = pad(minutes);
    if (secondsEl) secondsEl.textContent = pad(seconds);
  }

  tick();
  const interval = setInterval(tick, 1000);
}

function initPromoPopup(): void {
  const overlay = document.getElementById("promoOverlay");
  const closeBtn = document.getElementById("promoClose");
  const copyBtn = document.getElementById("promoCopyBtn") as HTMLButtonElement | null;
  const codeEl = document.getElementById("promoCode");

  if (!overlay || !closeBtn || !copyBtn || !codeEl) return;

  const STORAGE_KEY = "commerce_promo_dismissed";

  function closePromo(): void {
    overlay?.classList.add("hidden");
    document.body.classList.remove("cart-open");
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore storage errors (private browsing etc.)
    }
  }

  let alreadyDismissed = false;
  try {
    alreadyDismissed = sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    alreadyDismissed = false;
  }

  if (!alreadyDismissed) {
    setTimeout(() => {
      overlay.classList.remove("hidden");
    }, 1500);
  }

  closeBtn.addEventListener("click", closePromo);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closePromo();
  });

  copyBtn.addEventListener("click", async () => {
    const code = codeEl.textContent?.trim() || "";

    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    const originalText = copyBtn.textContent || "Copy code";
    copyBtn.textContent = "Copied!";
    copyBtn.classList.add("copied");

    setTimeout(() => {
      copyBtn.textContent = originalText;
      copyBtn.classList.remove("copied");
    }, 1500);
  });
}

initPromoPopup();

initCountdown();

initCookieConsent();

initNav();
initMobileMenu();
void initGuestSession().then(() => updateCartBadge());
/* =========================================================
   CUSTOMER ORDERS
   ========================================================= */

async function getOrders(): Promise<any[]> {
  const user = firebaseAuth.currentUser;

  if (!user) {
    return [];
  }

  const token = await user.getIdToken();

  const API_BASE_URL =
    (
      import.meta.env.VITE_API_BASE_URL ||
      "/api"
    ).replace(/\/$/, "");

  const response = await fetch(
    `${API_BASE_URL}/orders`,
    {
      method: "GET",

      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },

      credentials: "include",
    }
  );

  const payload =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.message ||
      payload?.error ||
      `Failed to load orders (${response.status})`
    );
  }

  /*
   * Support the common response formats:
   *
   * { orders: [...] }
   * { data: { orders: [...] } }
   * { data: [...] }
   * [...]
   */

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.orders)) {
    return payload.orders;
  }

  if (Array.isArray(payload?.data?.orders)) {
    return payload.data.orders;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
}


/* =========================================================
   CUSTOMER ORDER UI
   ========================================================= */

function accountEscapeHtml(
  value: unknown
): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


const CUSTOMER_ORDER_STEPS = [
  "to_prepare",
  "preparing",
  "ready",
  "shipped",
  "completed",
];


const CUSTOMER_ORDER_LABELS:
  Record<string, string> = {

    to_prepare:
      "To prepare",

    preparing:
      "Preparing",

    ready:
      "Ready",

    shipped:
      "Shipped",

    completed:
      "Completed",

    cancelled:
      "Cancelled",

    pending:
      "Pending",
  };


function getCustomerOrderStatus(
  order: any
): string {

  const fulfillment =
    String(
      order?.fulfillmentStatus || ""
    )
      .trim()
      .toLowerCase();


  if (fulfillment) {
    return fulfillment;
  }


  const payment =
    String(
      order?.paymentStatus ||
      order?.status ||
      ""
    )
      .trim()
      .toLowerCase();


  /*
   * Paid but fulfillment has not
   * been initialized yet.
   */
  if (payment === "paid") {
    return "to_prepare";
  }


  if (
    payment === "cancelled" ||
    payment === "canceled"
  ) {
    return "cancelled";
  }


  return payment || "pending";
}


function customerOrderDate(
  value: any
): string {

  if (!value) {
    return "";
  }

  let date: Date;


  /*
   * Firestore Timestamp
   */
  if (
    typeof value === "object" &&
    typeof value?.toDate === "function"
  ) {
    date = value.toDate();
  }

  /*
   * Firestore serialized timestamp
   */
  else if (
    typeof value === "object" &&
    value?.seconds
  ) {
    date =
      new Date(
        Number(value.seconds) * 1000
      );
  }

  /*
   * ISO string / normal date
   */
  else {
    date =
      new Date(value);
  }


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }


  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  ).format(date);
}


function customerReturnWindowOpen(order: any): boolean {
  const deliveredAt =
    order?.shipping?.deliveredAt ||
    order?.completedAt ||
    (
      order?.shipping?.status === "delivered"
        ? order?.shipping?.updatedAt
        : null
    );

  if (!deliveredAt) return false;

  const deliveredMs =
    Date.parse(String(deliveredAt));

  if (!Number.isFinite(deliveredMs)) {
    return false;
  }

  const fourteenDaysMs =
    14 * 24 * 60 * 60 * 1000;

  const age =
    Date.now() - deliveredMs;

  return age >= 0 && age <= fourteenDaysMs;
}

function renderCustomerOrders(
  orders: any[]
): void {

  const container =
    document.getElementById(
      "userOrdersList"
    );

  if (!container) {
    return;
  }


  if (!orders.length) {

    container.innerHTML = `
      <div class="account-orders__empty">
        You don't have any orders yet.
      </div>
    `;

    return;
  }


  const sortedOrders =
    [...orders].sort(
      (a, b) => {

        const aTime =
          new Date(
            a?.createdAt || 0
          ).getTime() || 0;

        const bTime =
          new Date(
            b?.createdAt || 0
          ).getTime() || 0;

        return bTime - aTime;
      }
    );


  container.innerHTML =
    sortedOrders
      .map((order) => {

        const status =
          getCustomerOrderStatus(
            order
          );


        const statusLabel =
          CUSTOMER_ORDER_LABELS[
            status
          ] ||
          status
            .replaceAll("_", " ")
            .replace(
              /\b\w/g,
              (letter) =>
                letter.toUpperCase()
            );


        const currentStep =
          CUSTOMER_ORDER_STEPS
            .indexOf(status);


        /*
         * ORDER PROGRESS
         */

        const progress =
          status === "cancelled" ||
          status === "pending"
            ? ""
            : `
              <div
                class="account-order__progress"
                aria-label="Order progress"
              >

                ${
                  CUSTOMER_ORDER_STEPS
                    .map(
                      (
                        step,
                        index
                      ) => {

                        let stateClass = "";

                        if (
                          currentStep >= 0 &&
                          index < currentStep
                        ) {
                          stateClass =
                            "is-complete";
                        }

                        if (
                          index === currentStep
                        ) {
                          stateClass =
                            "is-current";
                        }


                        return `
                          <div
                            class="
                              account-order__step
                              ${stateClass}
                            "
                          >
                            ${
                              CUSTOMER_ORDER_LABELS[
                                step
                              ]
                            }
                          </div>
                        `;
                      }
                    )
                    .join("")
                }

              </div>
            `;


        /*
         * PRODUCTS
         */

        const items =
          Array.isArray(
            order?.items
          )
            ? order.items
            : [];


        const products =
  items
    .map(
      (item: any) => {

        const title =
          item?.title ||
          item?.productTitle ||
          "Product";

        const size =
          item?.variant?.size ||
          item?.size ||
          "";

        return `
          <div class="account-order__product">

            <strong>
              ${accountEscapeHtml(
                title
              )}
            </strong>

            ${
              size
                ? `
                  <span
                    class="account-order__product-size"
                  >
                    · Size ${accountEscapeHtml(
                      size
                    )}
                  </span>
                `
                : ""
            }

          </div>
        `;
      }
    )
    .join("");


        /*
         * BOX NOW / TRACKING
         */

        const trackingNumber =
          order?.shipping
            ?.trackingNumber ||
          order?.shipping
            ?.parcelId ||
          order?.shipping
            ?.boxnow
            ?.parcelIds?.[0] ||
          "";


        const trackingUrl =
          order?.shipping
            ?.trackingUrl ||
          "";


        const carrier =
          order?.shipping?.carrier ||
          "BOX NOW";


        const canShowTracking =
          (
            status === "shipped" ||
            status === "completed"
          ) &&
          Boolean(
            trackingNumber ||
            trackingUrl
          );


        const tracking =
          canShowTracking
            ? `
              <div
                class="account-order__tracking"
              >

                <div
                  class="account-order__tracking-info"
                >

                  <span>
                    ${accountEscapeHtml(
                      carrier
                    )}
                    tracking
                  </span>

                  <strong>
                    ${accountEscapeHtml(
                      trackingNumber ||
                      "Shipment available"
                    )}
                  </strong>

                </div>


                ${
                  trackingUrl
                    ? `
                      <a
                        href="${accountEscapeHtml(
                          trackingUrl
                        )}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="account-order__tracking-link"
                      >
                        Track order ↗
                      </a>
                    `
                    : ""
                }

              </div>
            `
            : "";


        return `
          <article class="account-order">

            <div class="account-order__top">

              <div
                class="account-order__meta"
              >

                <span
                  class="account-order__label"
                >
                  Order
                </span>

                <h3
                  class="account-order__number"
                >
                  ${accountEscapeHtml(
                    order?.orderNumber ||
                    order?.id ||
                    ""
                  )}
                </h3>

                <span
                  class="account-order__date"
                >
                  ${accountEscapeHtml(
                    customerOrderDate(
                      order?.createdAt
                    )
                  )}
                </span>

              </div>


              <span
                class="
                  account-order__status
                  account-order__status--${accountEscapeHtml(
                    status
                  )}
                "
              >
                ${accountEscapeHtml(
                  statusLabel
                )}
              </span>

            </div>


            ${
              products
                ? `
                  <div
                    class="account-order__products"
                  >
                    ${products}
                  </div>
                `
                : ""
            }


            ${progress}

            ${tracking}

            ${customerReturnWindowOpen(order)
              ? `
                <div class="account-order__tracking account-order__return">
                  <div class="account-order__tracking-info">
                    <span>Need to send something back?</span>
                    <strong>Start a self-service return</strong>
                  </div>
                  <a
                    href="/returns?orderId=${encodeURIComponent(order?.id || "")}"
                    class="account-order__tracking-link account-order__return-link"
                  >
                    Return items →
                  </a>
                </div>
              `
              : ""}

          </article>
        `;
      })
      .join("");
}
async function loadUserAccountDashboard(): Promise<void> {
  const dashboard = document.getElementById("userDashboardHero");
  const defaultHero = document.getElementById("defaultHero");

  try {
    const rawOrders = await getOrders();
    const orders: any[] = Array.isArray(rawOrders)
      ? rawOrders
      : Array.isArray((rawOrders as any)?.orders)
        ? (rawOrders as any).orders
        : [];

    if (!orders.length) {
      dashboard?.classList.add("hidden");
      defaultHero?.classList.remove("hidden");
      return;
    }

    dashboard?.classList.remove("hidden");
    defaultHero?.classList.add("hidden");
    renderCustomerOrders(orders);
  } catch (error) {
    console.error("Failed to load customer dashboard:", error);
    dashboard?.classList.add("hidden");
    defaultHero?.classList.remove("hidden");
  }
}

function resetLoggedOutHomepageState(): void {
  const dashboardHero = document.getElementById("userDashboardHero");
  const defaultHero = document.getElementById("defaultHero");
  dashboardHero?.classList.add("hidden");
  defaultHero?.classList.remove("hidden");

  const orders =
  document.getElementById(
    "userOrdersList"
  );

if (orders) {
  orders.innerHTML = "";
}
}

/* =========================
   HOMEPAGE PRODUCTS
========================= */

let homepageProductsPromise:
  Promise<
    Awaited<
      ReturnType<
        typeof getProducts
      >
    >
  > | null = null;

function getHomepageProductsOnce() {
  if (
    !homepageProductsPromise
  ) {
    homepageProductsPromise =
      getProducts({
        featured: true,
        active: true,
      });
  }

  return homepageProductsPromise;
}

async function loadHomepageProducts(
  gridId: string,
  loadingId: string,
  emptyId: string,
  errorId: string,
  category: "tshirt" | "accessory"
): Promise<void> {
  const grid = document.getElementById(gridId) as HTMLElement | null;
  const loadingEl = document.getElementById(loadingId);
  const emptyEl = document.getElementById(emptyId);
  const errorEl = document.getElementById(errorId);

  if (!grid) return;

  try {
    loadingEl?.removeAttribute("hidden");
    emptyEl?.setAttribute("hidden", "");
    errorEl?.setAttribute("hidden", "");

    const products =
      await getHomepageProductsOnce();

    const safeProducts =
      (
        Array.isArray(products)
          ? products
          : []
      )
        .filter(
          product =>
            product.category
              ?.toLowerCase() ===
            category
        )
        .slice(0, 4);

    /*
     * The clothing row is the first product row users see.
     * Discover its cover images immediately instead of waiting
     * for browser lazy-load heuristics. Other images stay lazy.
     */
    renderProducts(
      grid,
      safeProducts,
      {
        eagerFirstImages:
          category === "tshirt"
            ? 4
            : (
                window.location.hash ===
                  "#accessories"
                  ? 4
                  : 0
              ),
      }
    );

    loadingEl?.setAttribute("hidden", "");

    if (safeProducts.length === 0) {
      emptyEl?.removeAttribute("hidden");
    }
  } catch (error) {
    console.error(`Failed to load ${category} homepage products:`, error);

    loadingEl?.setAttribute("hidden", "");
    errorEl?.removeAttribute("hidden");
  }
}

/* =========================
   BOOTSTRAP
========================= */

document.addEventListener("DOMContentLoaded", () => {
  void loadHomepageProducts(
    "featuredTshirtsGrid",
    "featuredTshirtsLoading",
    "featuredTshirtsEmpty",
    "featuredTshirtsError",
    "tshirt"
  );

  void loadHomepageProducts(
    "featuredAccessoriesGrid",
    "featuredAccessoriesLoading",
    "featuredAccessoriesEmpty",
    "featuredAccessoriesError",
    "accessory"
  );

 firebaseAuth.onAuthStateChanged(
  (user) => {

    if (user) {

      void loadUserAccountDashboard();

      return;
    }

    resetLoggedOutHomepageState();
  }
);
});
