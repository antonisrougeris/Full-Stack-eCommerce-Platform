import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { firebaseAuth } from "../../services/firebase";
import { initPasswordVisibility } from "../../utils/password-visibility";

/* =========================================================
   DOM
   ========================================================= */

const loginSection = document.getElementById("adminLogin");
const app = document.getElementById("adminApp");
const loginForm = document.getElementById("adminLoginForm") as HTMLFormElement | null;
const loginStatus = document.getElementById("adminLoginStatus");
const logoutButton = document.getElementById("adminLogout");
const userEmail = document.getElementById("adminUserEmail");
const refreshButton = document.getElementById("adminRefresh");

const productModal = document.getElementById("productModal");
const productForm = document.getElementById("productForm") as HTMLFormElement | null;

initPasswordVisibility();

/* =========================================================
   STATE
   ========================================================= */

let currentOrders: any[] = [];
let currentFulfillmentOrders: any[] = [];
let currentReturns: any[] = [];
let currentContactMessages: any[] = [];
let currentProducts: any[] = [];

let existingProductImages: string[] = [];
let pendingProductImageFiles: File[] = [];
interface ColorDraft { uid: number; name: string; hex: string; images: string[]; pending: File[]; existing: boolean; }
let colorDrafts: ColorDraft[] = [];
let nextColorUid = 0;
let defaultProductColor = "";
// Switch on only AFTER backend supports colorOptions/defaultColor and the SKU migration is complete.
const ENABLE_MULTI_COLOR_SAVE = true;
const colorPreviewUrls: string[] = [];
const KNOWN_COLOR_HEX: Record<string, string> = {
  white: "#FFFFFF", black: "#111111", natural: "#E7DECB", blue: "#264C87",
  red: "#B52732", green: "#32704B", grey: "#888888", gray: "#888888"
};

/* =========================================================
   API
   ========================================================= */

function readAdminCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;

  for (const part of document.cookie.split(";")) {
    const cookie = part.trim();
    if (cookie.startsWith(prefix)) {
      return decodeURIComponent(cookie.slice(prefix.length));
    }
  }

  return null;
}

async function adminApi(
  path: string,
  options: RequestInit = {}
) {
  const user = firebaseAuth.currentUser;

  if (!user) {
    throw new Error("Administrator not signed in");
  }

  const token = await user.getIdToken();
  const headers = new Headers(options.headers || {});

  headers.set("Authorization", `Bearer ${token}`);

  const csrfToken = readAdminCookie("csrf_token");
  if (csrfToken && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const isFormData = options.body instanceof FormData;

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api/admin${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let payload: any = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(
        response.ok
          ? "Admin API returned an invalid response"
          : `Admin request failed (${response.status})`
      );
    }
  }

  if (response.status === 403) {
    throw new Error("This account does not have administrator access.");
  }

  if (!response.ok) {
    throw new Error(
      payload?.message ||
      payload?.error ||
      `Admin request failed (${response.status})`
    );
  }

  return payload;
}

/* =========================================================
   LOGIN / AUTH
   ========================================================= */

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (loginStatus) {
    loginStatus.textContent = "Signing in...";
  }

  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  try {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
  } catch (error) {
    console.error(error);

    if (loginStatus) {
      loginStatus.textContent = "Invalid credentials or access denied.";
    }
  }
});

onAuthStateChanged(firebaseAuth, async (user) => {
  if (!user) {
    loginSection?.classList.remove("hidden");
    app?.classList.add("hidden");
    return;
  }

  try {
    await adminApi("/me");

    if (userEmail) {
      userEmail.textContent = user.email || "Admin";
    }

    loginSection?.classList.add("hidden");
    app?.classList.remove("hidden");

    await loadDashboard();
  } catch (error: any) {
    console.error(error);
    await signOut(firebaseAuth);

    if (loginStatus) {
      loginStatus.textContent = error?.message || "Administrator access denied.";
    }
  }
});

logoutButton?.addEventListener("click", async () => {
  await signOut(firebaseAuth);
});

/* =========================================================
   NAVIGATION
   ========================================================= */

const navButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".admin-nav__item")
);

function openView(view: string) {
  document.querySelectorAll(".admin-view").forEach((element) => {
    element.classList.add("hidden");
  });

  document.getElementById(`view-${view}`)?.classList.remove("hidden");

  navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });

  const titles: Record<string, string> = {
    dashboard: "Dashboard",
    fulfillment: "Fulfillment",
    orders: "Orders",
    returns: "Returns",
    messages: "Messages",
    products: "Products",
    customers: "Customers",
    qr: "QR Codes",
    payments: "Payments",
  };

  setText("adminPageTitle", titles[view] || view);
  void loadView(view);
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    if (view) openView(view);
  });
});

document.querySelectorAll<HTMLElement>("[data-open-view]").forEach((element) => {
  element.addEventListener("click", () => {
    const view = element.dataset.openView;
    if (view) openView(view);
  });
});

async function loadView(view: string) {
  switch (view) {
    case "dashboard":
      await loadDashboard();
      break;
    case "fulfillment":
      await loadFulfillment();
      break;
    case "orders":
      await loadOrders();
      break;
    case "returns":
      await loadReturns();
      break;
    case "messages":
      await loadContactMessages();
      break;
    case "products":
      await loadProducts();
      break;
    case "customers":
      await loadCustomers();
      break;
    case "payments":
      await loadPayments();
      break;
  }
}

/* =========================================================
   DASHBOARD
   ========================================================= */

async function loadDashboard() {
  const [data] = await Promise.all([
    adminApi("/dashboard"),
    loadContactMessages().catch((error) => {
      console.warn("Could not load contact inbox badge", error);
    }),
  ]);

  setText("statRevenue", formatMoney(data.revenue || 0));
  setText("statOrders", String(data.orders || 0));
  setText("statCustomers", String(data.customers || 0));
  setText("statQr", String(data.qrCodes || 0));

  renderOrders(data.recentOrders || [], "recentOrdersBody");
}

/* =========================================================
   ORDERS
   ========================================================= */

async function loadOrders() {
  const data = await adminApi("/orders");
  currentOrders = data.orders || [];
  applyOrderFilters();
}

function applyOrderFilters() {
  const search = (
    document.getElementById("orderSearch") as HTMLInputElement | null
  )?.value.trim().toLowerCase() || "";

  const status = (
    document.getElementById("orderStatusFilter") as HTMLSelectElement | null
  )?.value || "all";

  const filtered = currentOrders.filter((order) => {
    const paymentStatus = String(
      order.paymentStatus || order.status || "pending"
    ).toLowerCase();

    const haystack = [
      order.id,
      order.orderNumber,
      order.customer?.firstName,
      order.customer?.lastName,
      order.customer?.email,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = !search || haystack.includes(search);
    const matchesStatus = status === "all" || paymentStatus === status;

    return matchesSearch && matchesStatus;
  });

  renderOrders(filtered, "ordersBody");
}

document.getElementById("orderSearch")?.addEventListener("input", applyOrderFilters);
document.getElementById("orderStatusFilter")?.addEventListener("change", applyOrderFilters);

function renderOrders(orders: any[], targetId: string) {
  const body = document.getElementById(targetId);
  if (!body) return;

  if (!orders.length) {
    body.innerHTML = `<tr><td colspan="8">No orders found.</td></tr>`;
    return;
  }

  body.innerHTML = orders
    .map((order) => {
      const paymentStatus = order.paymentStatus || order.status || "pending";
      const isFullOrdersTable = targetId === "ordersBody";

      return `
        <tr>
          <td><span class="admin-order-id">${escapeHtml(order.orderNumber || order.id || "")}</span></td>
          <td class="admin-table__customer">
            <strong>${escapeHtml(customerName(order.customer))}</strong>
            <span>${escapeHtml(order.customer?.email || "")}</span>
          </td>
          ${isFullOrdersTable ? `<td>${Number(order.items?.length || 0)}</td>` : ""}
          <td><span class="admin-badge admin-badge--${escapeHtml(paymentStatus)}">${escapeHtml(paymentStatus)}</span></td>
          ${isFullOrdersTable ? `<td>${escapeHtml(order.delivery || "—")}</td>` : ""}
          <td>${formatMoney(Number(order.total || 0))}</td>
          <td>${formatDate(order.createdAt)}</td>
          <td><button class="admin-text-button" data-order-id="${escapeHtml(order.id)}">View</button></td>
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll<HTMLButtonElement>("[data-order-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.orderId;
      if (id) void openOrder(id);
    });
  });
}

/* =========================================================
   FULFILLMENT
   ========================================================= */

async function loadFulfillment() {
  const data = await adminApi("/fulfillment");
  currentFulfillmentOrders = data.orders || [];

  const summary = data.summary || {};

  setText("fulfillmentToPrepare", String(summary.toPrepare ?? countFulfillment("to_prepare")));
  setText("fulfillmentPreparing", String(summary.preparing ?? countFulfillment("preparing")));
  setText("fulfillmentReady", String(summary.ready ?? countFulfillment("ready")));
  setText("fulfillmentShipped", String(summary.shipped ?? countFulfillment("shipped")));
  setText("fulfillmentCompleted", String(summary.completed ?? countFulfillment("completed")));

  const actionCount =
    Number(summary.toPrepare ?? countFulfillment("to_prepare")) +
    Number(summary.preparing ?? countFulfillment("preparing")) +
    Number(summary.ready ?? countFulfillment("ready"));

  const badge = document.getElementById("fulfillmentBadge");
  if (badge) {
    badge.textContent = String(actionCount);
    badge.hidden = actionCount === 0;
  }

  renderFulfillment();
}

function countFulfillment(status: string) {
  return currentFulfillmentOrders.filter(
    (order) => String(order.fulfillmentStatus || "to_prepare") === status
  ).length;
}

function renderFulfillment() {
  const container = document.getElementById("fulfillmentList");
  if (!container) return;

  if (!currentFulfillmentOrders.length) {
    container.innerHTML = `<div class="admin-list-item"><strong>No paid orders waiting for fulfillment.</strong></div>`;
    return;
  }

  container.innerHTML = currentFulfillmentOrders
    .map((order) => {
      const status = String(order.fulfillmentStatus || "to_prepare");
      const items = Array.isArray(order.items) ? order.items : [];

      return `
        <article class="fulfillment-card">
          <div class="fulfillment-card__top">
            <div>
              <span class="admin-eyebrow">Order</span>
              <div class="fulfillment-card__id">${escapeHtml(order.orderNumber || order.id)}</div>
              <div class="fulfillment-card__meta">
                <span>${escapeHtml(customerName(order.customer))}</span>
                <span>${escapeHtml(order.customer?.email || "")}</span>
                <span>${formatDate(order.paidAt || order.createdAt)}</span>
              </div>
            </div>
            <span class="workflow-pill workflow-pill--${escapeHtml(status)}">${escapeHtml(formatStatus(status))}</span>
          </div>

          <div class="fulfillment-card__items">
            ${items.slice(0, 4).map((item: any) => fulfillmentItemHtml(item)).join("")}
            ${items.length > 4 ? `<div class="admin-muted">+ ${items.length - 4} more item(s)</div>` : ""}
          </div>

          <div class="fulfillment-card__footer">
            <div><strong>${formatMoney(Number(order.total || 0))}</strong><div class="admin-muted">${escapeHtml(order.delivery || "Delivery")}</div></div>
            <div class="admin-actions">
              ${status === "to_prepare" ? `<button class="admin-secondary-button" data-quick-status="preparing" data-order-id="${escapeHtml(order.id)}">Start preparing</button>` : ""}
              ${status === "preparing" ? `<button class="admin-secondary-button" data-quick-status="ready" data-order-id="${escapeHtml(order.id)}">Mark ready</button>` : ""}
              <button class="admin-primary-button" data-process-order="${escapeHtml(order.id)}">Process order</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function fulfillmentItemHtml(item: any) {
  const variant = item.variant || {};
  const sku = item.sku || variant.sku || "";
  const size = variant.size || item.size || "";
  const color = variant.color || item.color || "";

  return `
    <div class="fulfillment-card__item">
      ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" />` : ""}
      <div>
        <strong>${escapeHtml(item.title || item.name || "Product")}</strong>
        <span>${[
          sku ? `SKU ${sku}` : "",
          size ? `Size ${size}` : "",
          color ? color : "",
          `Qty ${Number(item.quantity || 1)}`,
        ].filter(Boolean).map(escapeHtml).join(" · ")}</span>
      </div>
    </div>
  `;
}

document.getElementById("refreshFulfillment")?.addEventListener("click", () => {
  void loadFulfillment();
});

document.getElementById("fulfillmentList")?.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;

  const processButton = target.closest<HTMLElement>("[data-process-order]");
  if (processButton?.dataset.processOrder) {
    await openOrder(processButton.dataset.processOrder);
    return;
  }

  const statusButton = target.closest<HTMLButtonElement>("[data-quick-status]");
  if (statusButton) {
    const orderId = statusButton.dataset.orderId;
    const status = statusButton.dataset.quickStatus;
    if (!orderId || !status) return;

    statusButton.disabled = true;
    try {
      await setFulfillmentStatus(orderId, status);
      await loadFulfillment();
      await loadDashboard();
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      statusButton.disabled = false;
    }
  }
});

async function setFulfillmentStatus(orderId: string, status: string) {
  return adminApi(`/orders/${encodeURIComponent(orderId)}/fulfillment`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

/* =========================================================
   ORDER / FULFILLMENT DRAWER
   ========================================================= */

async function openOrder(orderId: string) {
  const data = await adminApi(
    `/orders/${encodeURIComponent(orderId)}`
  );

  const order = data.order;
  const status = String(order.fulfillmentStatus || (order.paymentStatus === "paid" ? "to_prepare" : "not_paid"));
  const checklist = order.warehouse?.checklist || {};
  const receipt = order.receipt || {};
  const shipping = order.shipping || {};

  const receiptReady = Boolean(receipt.uploaded && receipt.storagePath);
  const packedReady = Boolean(checklist.packed);
  const shippingReference =
    String(shipping.trackingNumber || shipping.parcelId || "").trim();
  const shippingReady =
    Boolean(shippingReference) &&
    shippingReference !== "0" &&
    shippingReference !== "—";
  const customerAlreadyNotified = Boolean(order.emails?.shippedOrderSentAt);

  const canShipAndEmail =
    order.paymentStatus === "paid" &&
    receiptReady &&
    packedReady &&
    shippingReady &&
    !customerAlreadyNotified;

  setText("drawerOrderId", order.orderNumber || order.id);

  const content = document.getElementById("adminOrderDrawerContent");
  if (!content) return;

  content.innerHTML = `
    <div class="admin-detail-group">
      <div class="admin-actions" style="justify-content:space-between">
        <div><h3 style="margin:0 0 6px">Workflow</h3><span class="workflow-pill workflow-pill--${escapeHtml(status)}">${escapeHtml(formatStatus(status))}</span></div>
        <strong>${formatMoney(Number(order.total || 0))}</strong>
      </div>
      <div class="drawer-status-actions">
        ${order.paymentStatus === "paid" ? `
          ${status === "to_prepare" ? `<button class="admin-secondary-button" data-drawer-status="preparing">Start preparing</button>` : ""}
          ${status === "preparing" ? `<button class="admin-secondary-button" data-drawer-status="ready">Mark ready</button>` : ""}
          ${status === "ready" ? `<span class="admin-muted">Ready to ship. Use “Ship order & notify customer” below.</span>` : ""}
          ${status === "shipped" ? `<span class="admin-muted">Shipped. Waiting for delivery completion.</span>` : ""}
          ${status === "completed" ? `<span class="admin-muted">Completed.</span>` : ""}
        ` : `<span class="admin-muted">Fulfillment becomes available after payment.</span>`}
      </div>
    </div>

    <div class="admin-detail-group">
      <h3>Customer</h3>
      <p><strong>${escapeHtml(customerName(order.customer))}</strong></p>
      <p>${escapeHtml(order.customer?.email || "")}</p>
      <p>${escapeHtml(order.customer?.phone || "")}</p>
    </div>

    <div class="admin-detail-group">
      <h3>Payment</h3>
      <p>Status: <strong>${escapeHtml(order.paymentStatus || order.status || "")}</strong></p>
      <p>Viva order: ${escapeHtml(order.payment?.vivaOrderCode || "—")}</p>
      <p>Transaction: ${escapeHtml(order.payment?.transactionId || order.payment?.vivaTransactionId || "—")}</p>
    </div>

    <div class="admin-detail-group">
      <h3>Delivery</h3>
      <p><strong>${escapeHtml(order.delivery || "—")}</strong></p>
      <pre>${escapeHtml(JSON.stringify(order.shippingAddress || {}, null, 2))}</pre>
    </div>

    ${order.giftOptions?.tier && order.giftOptions.tier !== "none" ? `
    <div class="admin-detail-group">
      <h3>Gift fulfillment</h3>
      <p><strong>${escapeHtml(
        order.giftOptions.tier === "premium"
          ? "Premium gift"
          : "Gift-ready"
      )}</strong>${Number(order.giftFee || 0) > 0 ? ` · ${formatMoney(Number(order.giftFee || 0))}` : " · Free"}</p>
      <p>Hide prices in parcel: <strong>Yes</strong></p>
      <p>Include gift / returns receipt card: <strong>Yes</strong></p>
      ${order.giftOptions.tier === "premium" ? `<p>Premium gift box: <strong>Yes</strong></p>` : ""}
      ${order.giftOptions.personalNote ? `<p>Personal note:</p><pre>${escapeHtml(order.giftOptions.personalNote)}</pre>` : ""}
    </div>
    ` : ""}

    <div class="admin-detail-group">
      <h3>Items to prepare</h3>
      <div class="drawer-process-summary">
        ${(order.items || []).map((item: any) => drawerItemHtml(item)).join("") || `<span class="admin-muted">No items.</span>`}
      </div>
    </div>

    <div class="admin-detail-group">
      <h3>Warehouse checklist</h3>
      <div class="warehouse-checklist">
        ${checklistInput("checkProductPicked", "Product picked", checklist.productPicked)}
        ${checklistInput("checkSizeVerified", "Size / variant verified", checklist.sizeVerified)}
        ${checklistInput("checkPacked", "Packed", checklist.packed)}
      </div>
      <div class="admin-actions" style="margin-top:12px"><button id="saveChecklistButton" class="admin-secondary-button" type="button">Save checklist</button></div>
      <p id="checklistStatus" class="admin-inline-status"></p>
    </div>

    <div class="admin-detail-group">
      <h3>Receipt / timologio</h3>
      <div class="admin-form-grid">
        <label class="admin-field"><span>Receipt number</span><input id="receiptNumber" type="text" value="${escapeHtml(receipt.number || "")}" /></label>
        <label class="admin-field"><span>myDATA MARK</span><input id="receiptMark" type="text" value="${escapeHtml(receipt.mark || "")}" /></label>
      </div>
      <label class="admin-field"><span>Receipt PDF</span><input id="receiptPdf" type="file" accept="application/pdf,.pdf" /></label>
      <div class="receipt-file-name">${receipt.uploaded ? `Uploaded: ${escapeHtml(receipt.fileName || "receipt.pdf")}` : "No receipt PDF uploaded yet."}</div>
      <div class="admin-actions" style="margin-top:12px">
        <button id="saveReceiptButton" class="admin-secondary-button" type="button">Save receipt details</button>
        <button id="uploadReceiptButton" class="admin-primary-button" type="button">Upload PDF & save</button>
      </div>
      <p id="receiptStatus" class="admin-inline-status"></p>
    </div>

    <div class="admin-detail-group">
      <h3>Shipping</h3>
      <div class="admin-form-grid">
        <label class="admin-field"><span>Carrier</span><input id="shippingCarrier" type="text" value="${escapeHtml(shipping.carrier || "Standard")}" /></label>
        <label class="admin-field"><span>Parcel ID</span><input id="shippingParcelId" type="text" value="${escapeHtml(shipping.parcelId || "")}" /></label>
        <label class="admin-field"><span>Tracking number</span><input id="shippingTrackingNumber" type="text" value="${escapeHtml(shipping.trackingNumber || "")}" /></label>
      </div>
      <label class="admin-field"><span>Tracking URL</span><input id="shippingTrackingUrl" type="url" value="${escapeHtml(shipping.trackingUrl || "")}" /></label>
      <div class="admin-actions"><button id="saveShippingButton" class="admin-secondary-button" type="button">Save shipping</button></div>
      <p id="shippingStatus" class="admin-inline-status"></p>
    </div>

    <div class="admin-detail-group">
      <h3>Dispatch</h3>
      <p class="admin-muted">
        This is the only action that should set the order to Shipped. It sends the customer email and attaches the stored receipt PDF.
      </p>

      <div class="warehouse-checklist" style="margin:12px 0">
        <label><input type="checkbox" disabled ${packedReady ? "checked" : ""} /> <span>Order packed</span></label>
        <label><input type="checkbox" disabled ${receiptReady ? "checked" : ""} /> <span>Receipt PDF uploaded</span></label>
        <label><input type="checkbox" disabled ${shippingReady ? "checked" : ""} /> <span>Parcel / tracking saved</span></label>
      </div>

      ${
        customerAlreadyNotified
          ? `<p class="admin-inline-status is-success">Customer shipping email already sent ${order.emails?.shippedOrderSentAt ? `on ${escapeHtml(formatDate(order.emails.shippedOrderSentAt))}` : ""}.</p>`
          : ""
      }

      <button
        id="shipAndEmailButton"
        class="admin-primary-button"
        type="button"
        ${canShipAndEmail ? "" : "disabled"}
      >
        ${customerAlreadyNotified ? "Customer already notified" : "Mark shipped & send customer email"}
      </button>

      ${
        !customerAlreadyNotified && !canShipAndEmail
          ? `<p class="admin-muted" style="margin-top:8px">Complete the three requirements above before dispatch.</p>`
          : ""
      }

      <p id="shipStatus" class="admin-inline-status"></p>
    </div>
  `;

  bindOrderDrawerActions(order);

  document.getElementById("adminDrawerOverlay")?.classList.remove("hidden");
  document.getElementById("adminOrderDrawer")?.classList.remove("hidden");
}

function drawerItemHtml(item: any) {
  const variant = item.variant || {};
  const sku = item.sku || variant.sku || "";
  const size = variant.size || item.size || "";
  const color = variant.color || item.color || "";

  return `
    <div class="drawer-item">
      ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" />` : `<div></div>`}
      <div>
        <strong>${escapeHtml(item.title || item.name || "Product")}</strong>
        <div class="drawer-item__meta">${[
          sku ? `SKU: ${sku}` : "",
          size ? `Size: ${size}` : "",
          color ? `Color: ${color}` : "",
          `Quantity: ${Number(item.quantity || 1)}`,
        ].filter(Boolean).map(escapeHtml).join(" · ")}</div>
        ${item.qrDestination ? `<div class="drawer-item__meta">Destination: ${escapeHtml(item.qrDestination)}</div>` : ""}
      </div>
    </div>
  `;
}

function checklistInput(id: string, label: string, checked: boolean) {
  return `<label><input id="${id}" type="checkbox" ${checked ? "checked" : ""} /> <span>${escapeHtml(label)}</span></label>`;
}

function bindOrderDrawerActions(order: any) {
  document.querySelectorAll<HTMLButtonElement>("[data-drawer-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const status = button.dataset.drawerStatus;
      if (!status) return;

      button.disabled = true;
      try {
        await setFulfillmentStatus(order.id, status);
        await Promise.all([loadFulfillment(), loadDashboard()]);
        await openOrder(order.id);
      } catch (error) {
        alert(errorMessage(error));
      } finally {
        button.disabled = false;
      }
    });
  });

  document.getElementById("saveChecklistButton")?.addEventListener("click", async () => {
    const statusEl = document.getElementById("checklistStatus");
    setInlineStatus(statusEl, "Saving...");

    try {
      await adminApi(`/orders/${encodeURIComponent(order.id)}/checklist`, {
        method: "PATCH",
        body: JSON.stringify({
          productPicked: checked("checkProductPicked"),
          sizeVerified: checked("checkSizeVerified"),
          qrAttached: checked("checkQrAttached"),
          qrTested: checked("checkQrTested"),
          packed: checked("checkPacked"),
        }),
      });
      setInlineStatus(statusEl, "Checklist saved.", "success");
      await openOrder(order.id);
    } catch (error) {
      setInlineStatus(statusEl, errorMessage(error), "error");
    }
  });

  document.getElementById("saveReceiptButton")?.addEventListener("click", async () => {
    await saveReceiptMetadata(order.id);
  });

  document.getElementById("uploadReceiptButton")?.addEventListener("click", async () => {
    const statusEl = document.getElementById("receiptStatus");
    const fileInput = document.getElementById("receiptPdf") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];

    if (!file) {
      setInlineStatus(statusEl, "Choose a PDF first.", "error");
      return;
    }

    if (file.type && file.type !== "application/pdf") {
      setInlineStatus(statusEl, "Receipt must be a PDF.", "error");
      return;
    }

    setInlineStatus(statusEl, "Uploading receipt PDF...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("number", inputValue("receiptNumber"));
      formData.append("mark", inputValue("receiptMark"));

      await adminApi(`/orders/${encodeURIComponent(order.id)}/receipt-file`, {
        method: "POST",
        body: formData,
      });

      setInlineStatus(statusEl, "Receipt PDF uploaded.", "success");
      await openOrder(order.id);
    } catch (error) {
      setInlineStatus(statusEl, errorMessage(error), "error");
    }
  });

  document.getElementById("saveShippingButton")?.addEventListener("click", async () => {
    const statusEl = document.getElementById("shippingStatus");
    setInlineStatus(statusEl, "Saving shipping details...");

    try {
      await adminApi(`/orders/${encodeURIComponent(order.id)}/shipping`, {
        method: "PATCH",
        body: JSON.stringify({
          carrier: inputValue("shippingCarrier"),
          parcelId: inputValue("shippingParcelId"),
          trackingNumber: inputValue("shippingTrackingNumber"),
          trackingUrl: inputValue("shippingTrackingUrl"),
        }),
      });

      setInlineStatus(statusEl, "Shipping details saved.", "success");
      await openOrder(order.id);
    } catch (error) {
      setInlineStatus(statusEl, errorMessage(error), "error");
    }
  });

  document.getElementById("shipAndEmailButton")?.addEventListener("click", async () => {
    const statusEl = document.getElementById("shipStatus");

    if (!window.confirm("Send the shipping email now? The saved receipt PDF will be attached and the order will be marked as shipped.")) {
      return;
    }

    setInlineStatus(statusEl, "Shipping order and sending email...");

    try {
      await adminApi(`/orders/${encodeURIComponent(order.id)}/ship`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      setInlineStatus(statusEl, "Order shipped and customer notified.", "success");
      await Promise.all([loadFulfillment(), loadDashboard(), loadOrders()]);
      await openOrder(order.id);
    } catch (error) {
      setInlineStatus(statusEl, errorMessage(error), "error");
    }
  });
}

async function saveReceiptMetadata(orderId: string) {
  const statusEl = document.getElementById("receiptStatus");
  setInlineStatus(statusEl, "Saving receipt details...");

  try {
    await adminApi(`/orders/${encodeURIComponent(orderId)}/receipt`, {
      method: "PATCH",
      body: JSON.stringify({
        number: inputValue("receiptNumber"),
        mark: inputValue("receiptMark"),
      }),
    });

    setInlineStatus(statusEl, "Receipt details saved.", "success");
  } catch (error) {
    setInlineStatus(statusEl, errorMessage(error), "error");
  }
}

function closeDrawer() {
  document.getElementById("adminDrawerOverlay")?.classList.add("hidden");
  document.getElementById("adminOrderDrawer")?.classList.add("hidden");
}

document.getElementById("closeAdminDrawer")?.addEventListener("click", closeDrawer);
document.getElementById("adminDrawerOverlay")?.addEventListener("click", closeDrawer);


/* =========================================================
   RETURNS
   ========================================================= */

async function loadReturns() {
  const data = await adminApi("/returns");
  currentReturns = data.returns || [];
  renderReturns();
}

function returnStatusLabel(status: unknown) {
  return String(status || "requested")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderReturns() {
  const target = document.getElementById("adminReturnsList");
  if (!target) return;

  if (!currentReturns.length) {
    target.innerHTML = `<div class="admin-section"><p class="admin-muted">No return requests yet.</p></div>`;
    return;
  }

  target.innerHTML = currentReturns
    .map((request: any) => {
      const status = String(request.status || "requested");
      const canReview = ["requested", "provider_failed"].includes(status);
      const canReceive = ["approved", "label_ready", "dropped_off", "in_transit", "provider_issue"].includes(status);
      const canRefund = status === "refund_pending";

      const items = Array.isArray(request.items)
        ? request.items
            .map(
              (item: any) => `
                <div class="admin-list__item">
                  <strong>${escapeHtml(item.title || "Product")}</strong>
                  <span>
                    Qty ${Number(item.quantity || 0)}
                    ${item.variant?.size ? ` · ${escapeHtml(item.variant.size)}` : ""}
                    · ${escapeHtml(item.reasonLabel || item.reason || "")}
                  </span>
                </div>
              `
            )
            .join("")
        : "";

      return `
        <article class="fulfillment-card">
          <div class="fulfillment-card__top">
            <div>
              <span class="admin-eyebrow">RETURN ${escapeHtml(request.returnNumber || request.id)}</span>
              <h3>Order ${escapeHtml(request.orderNumber || request.orderId || "")}</h3>
              <div class="admin-muted">
                ${escapeHtml(
                  [request.customer?.firstName, request.customer?.lastName]
                    .filter(Boolean)
                    .join(" ")
                )}
                · ${escapeHtml(request.customer?.email || "")}
              </div>
            </div>
            <span class="admin-badge admin-badge--${escapeHtml(status)}">
              ${escapeHtml(returnStatusLabel(status))}
            </span>
          </div>

          <div style="margin:16px 0;">
            ${items}
          </div>

          ${request.customerNote
            ? `<p class="admin-muted"><strong>Customer note:</strong> ${escapeHtml(request.customerNote)}</p>`
            : ""}

          <div class="fulfillment-card__footer">
            <div>
              <strong>${formatMoney(Number(request.refundEstimate || 0))}</strong>
              <div class="admin-muted">Estimated item refund</div>
            </div>
            <div class="admin-actions">
              ${canReview
                ? `<button class="admin-secondary-button" data-return-reject="${escapeHtml(request.id)}">Reject</button>
                   <button class="admin-primary-button" data-return-approve="${escapeHtml(request.id)}">Approve return</button>`
                : ""}
              ${canReceive
                ? `<button class="admin-secondary-button" data-return-received="${escapeHtml(request.id)}">Mark received</button>`
                : ""}
              ${canRefund
                ? `<button class="admin-primary-button" data-return-refunded="${escapeHtml(request.id)}">Record refund</button>`
                : ""}
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

async function returnAction(
  returnId: string,
  action: "approve" | "reject" | "received" | "refunded"
) {
  let body: Record<string, unknown> | undefined;

  if (action === "reject") {
    const note = window.prompt(
      "Reason shown to the customer:",
      "This return request could not be approved."
    );
    if (note === null) return;
    body = { note };
  }

  if (action === "refunded") {
    const request = currentReturns.find((item) => item.id === returnId);
    const amountInput = window.prompt(
      "Refund amount:",
      String(request?.refundEstimate ?? "")
    );
    if (amountInput === null) return;

    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount < 0) {
      window.alert("Enter a valid refund amount.");
      return;
    }

    const reference = window.prompt(
      "Refund/payment reference (optional):",
      ""
    );

    body = {
      amount,
      reference: reference || "",
    };
  }

  await adminApi(
    `/returns/${encodeURIComponent(returnId)}/${action}`,
    {
      method: "POST",
      ...(body ? { body: JSON.stringify(body) } : {}),
    }
  );

  await loadReturns();
}

document.getElementById("refreshReturns")?.addEventListener("click", () => {
  void loadReturns();
});

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;

  const approve = target.closest<HTMLElement>("[data-return-approve]");
  if (approve?.dataset.returnApprove) {
    void returnAction(approve.dataset.returnApprove, "approve").catch((error) => {
      window.alert(error instanceof Error ? error.message : "Return approval failed.");
    });
    return;
  }

  const reject = target.closest<HTMLElement>("[data-return-reject]");
  if (reject?.dataset.returnReject) {
    void returnAction(reject.dataset.returnReject, "reject").catch((error) => {
      window.alert(error instanceof Error ? error.message : "Return rejection failed.");
    });
    return;
  }

  const received = target.closest<HTMLElement>("[data-return-received]");
  if (received?.dataset.returnReceived) {
    void returnAction(received.dataset.returnReceived, "received").catch((error) => {
      window.alert(error instanceof Error ? error.message : "Could not update return.");
    });
    return;
  }

  const refunded = target.closest<HTMLElement>("[data-return-refunded]");
  if (refunded?.dataset.returnRefunded) {
    void returnAction(refunded.dataset.returnRefunded, "refunded").catch((error) => {
      window.alert(error instanceof Error ? error.message : "Could not record refund.");
    });
    return;
  }
});


/* =========================================================
   CONTACT MESSAGES
   ========================================================= */

async function loadContactMessages() {
  const data = await adminApi("/contact-messages");
  currentContactMessages = data.messages || [];

  const badge = document.getElementById("messagesBadge");
  const unread = Number(data.unread || 0);

  if (badge) {
    badge.textContent = String(unread);
    badge.hidden = unread === 0;
  }

  renderContactMessages();
}

function renderContactMessages() {
  const target = document.getElementById("adminMessagesList");
  if (!target) return;

  if (!currentContactMessages.length) {
    target.innerHTML =
      `<div class="admin-section"><p class="admin-muted">No contact messages yet.</p></div>`;
    return;
  }

  target.innerHTML = currentContactMessages
    .map((message: any) => {
      const status = String(message.status || "new");
      const replies = Array.isArray(message.replies) ? message.replies : [];

      return `
        <article class="admin-message-card ${status === "new" ? "is-unread" : ""}" data-contact-message="${escapeHtml(message.id)}">
          <div class="admin-message-card__top">
            <div>
              <span class="admin-eyebrow">${status === "new" ? "NEW MESSAGE" : "CONTACT"}</span>
              <h3>${escapeHtml(message.name || "Customer")}</h3>
              <a href="mailto:${escapeHtml(message.email || "")}">${escapeHtml(message.email || "")}</a>
            </div>
            <div class="admin-message-card__meta">
              <span class="admin-badge admin-badge--${escapeHtml(status)}">${escapeHtml(status)}</span>
              <span>${formatDate(message.createdAt)}</span>
            </div>
          </div>

          <div class="admin-message-card__body">${escapeHtml(message.message || "")}</div>

          ${replies.length ? `
            <div class="admin-message-thread">
              ${replies.map((reply: any) => `
                <div class="admin-message-reply">
                  <strong>Admin reply · ${formatDate(reply.sentAt)}</strong>
                  <p>${escapeHtml(reply.message || "")}</p>
                </div>
              `).join("")}
            </div>
          ` : ""}

          <div class="admin-message-reply-box">
            <textarea
              rows="4"
              maxlength="5000"
              placeholder="Write a reply..."
              data-contact-reply-text="${escapeHtml(message.id)}"
            ></textarea>
            <div class="admin-actions">
              ${status === "new" ? `<button class="admin-secondary-button" data-contact-read="${escapeHtml(message.id)}">Mark as read</button>` : ""}
              <button class="admin-primary-button" data-contact-reply="${escapeHtml(message.id)}">Send reply</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

document.getElementById("refreshMessages")?.addEventListener("click", () => {
  void loadContactMessages();
});

document.getElementById("adminMessagesList")?.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;

  const readButton =
    target.closest<HTMLButtonElement>("[data-contact-read]");

  if (readButton?.dataset.contactRead) {
    readButton.disabled = true;
    try {
      await adminApi(
        `/contact-messages/${encodeURIComponent(readButton.dataset.contactRead)}/read`,
        { method: "PATCH" }
      );
      await loadContactMessages();
    } catch (error) {
      window.alert(errorMessage(error));
      readButton.disabled = false;
    }
    return;
  }

  const replyButton =
    target.closest<HTMLButtonElement>("[data-contact-reply]");

  if (replyButton?.dataset.contactReply) {
    const id = replyButton.dataset.contactReply;
    const textarea =
      document.querySelector<HTMLTextAreaElement>(
        `[data-contact-reply-text="${CSS.escape(id)}"]`
      );

    const message = textarea?.value.trim() || "";

    if (!message) {
      window.alert("Write a reply first.");
      return;
    }

    replyButton.disabled = true;
    replyButton.textContent = "Sending...";

    try {
      await adminApi(
        `/contact-messages/${encodeURIComponent(id)}/reply`,
        {
          method: "POST",
          body: JSON.stringify({ message }),
        }
      );
      await loadContactMessages();
    } catch (error) {
      window.alert(errorMessage(error));
      replyButton.disabled = false;
      replyButton.textContent = "Send reply";
    }
  }
});


/* =========================================================
   PRODUCTS
   ========================================================= */

async function loadProducts() {
  const productData =
    await adminApi("/products");
  currentProducts =
    productData.products || [];
  renderProducts();
}

function renderAdminProductPrice(product: any): string {
  const regular = Number(product?.price || 0);
  const discount = Math.min(90, Math.max(0, Number(product?.discountPercent || 0)));
  if (!discount) {
    return `<div class="admin-product__pricing"><strong>${formatMoney(regular)}</strong></div>`;
  }
  const sale = Math.round(regular * (1 - discount / 100) * 100) / 100;
  return `<div class="admin-product__pricing"><span class="admin-product__old-price">${formatMoney(regular)}</span><strong>${formatMoney(sale)}</strong><span class="admin-product__sale">-${discount}%</span></div>`;
}

function adminMerchandisingLabel(value: unknown): string {
  const labels: Record<string, string> = {
    new: "New",
    featured: "Featured",
    best_seller: "Best seller",
    limited: "Limited",
  };
  return labels[String(value || "").toLowerCase()] || "";
}

function renderProducts() {
  const grid = document.getElementById("adminProductsGrid");
  if (!grid) return;

  if (!currentProducts.length) {
    grid.innerHTML = `<div class="admin-list-item"><strong>No products yet.</strong></div>`;
    return;
  }

  grid.innerHTML = currentProducts
    .map((product: any) => {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const active = product.active !== false;

      const madeToOrderTotal = variants.reduce(
        (sum: number, variant: any) => sum + Math.max(0, Number(variant.stock || 0)),
        0
      );

      return `
        <article class="admin-product ${active ? "" : "is-inactive"}">
          ${(product.colorOptions?.find((c: any) => c.name === product.defaultColor)?.images?.[0] || product.colorOptions?.[0]?.images?.[0] || product.image || product.images?.[0])
            ? `<img src="${escapeHtml(product.colorOptions?.find((c: any) => c.name === product.defaultColor)?.images?.[0] || product.colorOptions?.[0]?.images?.[0] || product.image || product.images?.[0])}" alt="${escapeHtml(product.title || "")}">`
            : ""}
          <div class="admin-product__body">
            <h3>
              ${escapeHtml(product.title || "")}
              <span class="admin-product__status ${active ? "" : "admin-product__status--inactive"}">
                ${active ? "Active" : "Archived"}
              </span>
            </h3>

            ${renderAdminProductPrice(product)}
            <div class="admin-muted">
              ${escapeHtml(product.id || "")} · ${escapeHtml(product.category || "General")}
              ${product.featured ? " · Homepage" : ""}
              ${adminMerchandisingLabel(product.merchandisingTag) ? ` · ${escapeHtml(adminMerchandisingLabel(product.merchandisingTag))}` : ""}
            </div>

            <div class="admin-product__stock-box">
              <div class="admin-product__stock-row">
                <span>Made-to-order stock</span>
                <strong>${madeToOrderTotal}</strong>
              </div>

              ${variants.length ? `
                <div class="admin-product__variant-list">
                  ${variants.map((variant: any) => {
                    const label = [variant.size || "One size", variant.color || ""].filter(Boolean).join(" · ");

                    return `
                      <div class="admin-product__variant">
                        <span>${escapeHtml(label)}</span>
                        <span>stock ${Number(variant.stock || 0)}</span>
                      </div>
                    `;
                  }).join("")}
                </div>
              ` : `<div class="admin-muted" style="margin-top:8px">No sellable size / option configured.</div>`}
            </div>

            <div class="admin-product__actions">
              <button class="admin-secondary-button" type="button" data-edit-product="${escapeHtml(product.id)}">Edit</button>
              ${
                active
                  ? `<button class="admin-danger-button" type="button" data-archive-product="${escapeHtml(product.id)}">Archive</button>`
                  : `<button class="admin-secondary-button" type="button" disabled>Archived</button>`
              }
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

/* =========================================================
   PRODUCT ADD / EDIT
   ========================================================= */

document.getElementById("addProductButton")?.addEventListener("click", () => {
  openProductModal();
});

document.querySelectorAll<HTMLElement>("[data-close-product-modal]").forEach((element) => {
  element.addEventListener("click", closeProductModal);
});

document.getElementById("addVariantRowButton")?.addEventListener("click", () => {
  addVariantRow();
});

document.getElementById("variantRows")?.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  target.closest<HTMLElement>("[data-remove-variant]")?.closest(".dynamic-row")?.remove();
});

function openProductModal(product: any = null) {
  resetProductForm();

  const editing = Boolean(product);

  setInputValue("productEditingId", product?.id || "");
  setInputValue("productId", product?.id || "");
  setInputValue("productSlug", product?.slug || "");
  setInputValue("productTitle", product?.title || "");
  setInputValue("productShortDescription", product?.shortDescription || "");
  setInputValue("productDescription", product?.description || "");

  setInputValue(
    "productTitleEl",
    product?.translations?.el?.title || ""
  );
  setInputValue(
    "productShortDescriptionEl",
    product?.translations?.el?.shortDescription || ""
  );
  setInputValue(
    "productDescriptionEl",
    product?.translations?.el?.description || ""
  );

  populateProductCategories(product?.category || "");

  setInputValue("productPrice", product?.price ?? "");
  setInputValue("productCurrency", product?.currency || "EUR");
  setInputValue("productDiscountPercent", product?.discountPercent ?? 0);
  setInputValue("productMerchandisingTag", product?.merchandisingTag || "none");
  setChecked("productFeatured", Boolean(product?.featured));
  setChecked("productActive", product?.active !== false);


  existingProductImages = Array.isArray(product?.images) ? [...product.images] : [];
  pendingProductImageFiles = [];
  colorDrafts = [];
  nextColorUid = 0;
  defaultProductColor = String(product?.defaultColor || "");
  const declared = Array.isArray(product?.colorOptions) ? product.colorOptions : [];
  if (declared.length) {
    declared.forEach((color: any) => addColorDraft(String(color.name || ""), String(color.hex || ""), color.images || [], true, false));
  } else {
    // Existing single-color products: preserve their image set and existing SKUs.
    const existingVariants = Array.isArray(product?.variants) ? product.variants : [];
    const names = Array.from(new Set(existingVariants.map((v: any) => String(v.color || "").trim()).filter(Boolean))) as string[];
    const fallback = names.length ? names : product ? [inferLegacyColor(product.title || "")].filter(Boolean) : [];
    fallback.forEach((name, index) => addColorDraft(name, "", index === 0 ? existingProductImages : [], Boolean(product), false));
  }
  if (!product && !colorDrafts.length) addColorDraft(isTshirtCategory(inputValue("productCategory")) ? "White" : "Black", "", [], false, false);
  renderColorEditor();
  renderProductImagePreview();

  const variantRows = document.getElementById("variantRows");
  if (variantRows) variantRows.innerHTML = "";

  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (variants.length) {
    variants.forEach((variant: any) => addVariantRow(variant));
  } else {
    addDefaultVariantRowsForCategory(inputValue("productCategory"));
  }

  const idInput = document.getElementById("productId") as HTMLInputElement | null;
  if (idInput) idInput.disabled = editing;

  setText("productModalTitle", editing ? "Edit product" : "Add product");
  setText("saveProductButton", editing ? "Save changes" : "Create product");
  setInlineStatus(document.getElementById("productFormStatus"), "");

  productModal?.classList.remove("hidden");
  productModal?.setAttribute("aria-hidden", "false");
}

function closeProductModal() {
  productModal?.classList.add("hidden");
  productModal?.setAttribute("aria-hidden", "true");
  pendingProductImageFiles = [];
  clearColorPreviewUrls();
}

function resetProductForm() {
  productForm?.reset();

  setChecked("productFeatured", false);
  setChecked("productActive", true);
  setInputValue("productDiscountPercent", 0);
  setInputValue("productMerchandisingTag", "none");

  setInputValue("productCurrency", "EUR");
  setInputValue("productTitleEl", "");
  setInputValue("productShortDescriptionEl", "");
  setInputValue("productDescriptionEl", "");


  document.getElementById("variantRows")?.replaceChildren();

  existingProductImages = [];
  pendingProductImageFiles = [];
  colorDrafts = [];
  nextColorUid = 0;
  defaultProductColor = "";
  clearColorPreviewUrls();
  renderColorEditor();
  renderProductImagePreview();
}

function populateProductCategories(selectedCategory = "") {
  const select = document.getElementById("productCategory") as HTMLSelectElement | null;
  if (!select) return;

  const categories = Array.from(
    new Set(
      currentProducts
        .map((product) => String(product.category || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  if (selectedCategory && !categories.includes(selectedCategory)) {
    categories.push(selectedCategory);
  }

  if (!categories.length) {
    categories.push("General");
  }

  select.innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(formatCategoryLabel(category))}</option>`)
    .join("");

  const preferredDefault = categories.find((category) =>
    ["tshirt", "t-shirt", "t_shirt"].includes(category.toLowerCase())
  );

  select.value = selectedCategory && categories.includes(selectedCategory)
    ? selectedCategory
    : preferredDefault || categories[0];
}

function formatCategoryLabel(category: string) {
  return String(category || "")
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isTshirtCategory(category: string) {
  const value = String(category || "").trim().toLowerCase();
  return ["tshirt", "t-shirt", "t_shirt", "shirt"].includes(value);
}

function addDefaultVariantRowsForCategory(category: string) {
  const container = document.getElementById("variantRows");
  if (!container) return;
  container.innerHTML = "";
  if (isTshirtCategory(category)) {
    if (!colorDrafts.length) addColorDraft("White", "", [], false, false);
    colorDrafts.forEach(c => addDefaultSizesForColor(c.name));
  } else {
    const name = colorDrafts[0]?.name || "";
    addVariantRow({ size:"", color:name, stock:0 });
  }
}
function addDefaultSizesForColor(color: string) {
  const rows = Array.from(document.querySelectorAll<HTMLElement>("#variantRows .dynamic-row"));
  const tshirt = isTshirtCategory(inputValue("productCategory"));
  const sizes = tshirt ? ["S", "M", "L", "XL", "2XL"] : [""];
  sizes.forEach(size => {
    if (!rows.some(row => childInputValue(row, "[data-variant-color]").toLowerCase() === color.toLowerCase()
      && childInputValue(row, "[data-variant-size]") === size)) addVariantRow({color, size, stock:0});
  });
}

function normalizeSkuPart(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateVariantSku(productId: string, size: string, color: string) {
  const tokens = [
    ...normalizeSkuPart(productId).split("-"),
    ...normalizeSkuPart(color).split("-"),
    ...normalizeSkuPart(size).split("-"),
  ].filter(Boolean);

  const uniqueTokens: string[] = [];
  for (const token of tokens) {
    if (!uniqueTokens.includes(token)) uniqueTokens.push(token);
  }

  return uniqueTokens.join("-");
}

function updateAutoSkuForRow(row: HTMLElement) {
  if (row.dataset.autoSku !== "true") return;

  const skuInput = row.querySelector<HTMLInputElement>("[data-variant-sku]");
  const preview = row.querySelector<HTMLElement>("[data-variant-sku-preview]");
  if (!skuInput) return;

  const sku = generateVariantSku(
    inputValue("productId"),
    childInputValue(row, "[data-variant-size]"),
    childInputValue(row, "[data-variant-color]")
  );

  skuInput.value = sku;
  if (preview) preview.textContent = sku || "Generated after size / color is selected";
}

function updateAllAutoSkus() {
  document
    .querySelectorAll<HTMLElement>("#variantRows .dynamic-row")
    .forEach(updateAutoSkuForRow);
}

function addVariantRow(variant: any = {}) {
  const container = document.getElementById("variantRows");
  if (!container) return;
  const tshirt = isTshirtCategory(inputValue("productCategory"));
  const hasExistingSku = Boolean(String(variant.sku || "").trim());
  const size = String(variant.size || "");
  const color = String(variant.color || colorDrafts[0]?.name || "");
  const knownSizes = ["", "XS", "S", "M", "L", "XL", "2XL"];
  if (size && !knownSizes.includes(size)) knownSizes.push(size);
  const row = document.createElement("div");
  row.className = `dynamic-row dynamic-row--color ${tshirt ? "dynamic-row--tshirt" : ""}`.trim();
  row.dataset.autoSku = hasExistingSku ? "false" : "true";
  row.dataset.legacySku = hasExistingSku ? "true" : "false";
  const colors = [...colorDrafts.map(c => c.name)];
  if (color && !colors.some(c => c.toLowerCase() === color.toLowerCase())) colors.push(color);
  row.innerHTML = `
    <label class="admin-field"><span>Color</span>
      <select data-variant-color ${hasExistingSku ? "disabled" : ""}>
        ${colors.map(c => `<option value="${escapeHtml(c)}" ${c.toLowerCase() === color.toLowerCase() ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
      </select>
    </label>
    <label class="admin-field"><span>Size</span>
      <select data-variant-size ${hasExistingSku ? "disabled" : ""}>
        ${knownSizes.map(value => `<option value="${escapeHtml(value)}" ${value === size ? "selected" : ""}>${escapeHtml(value || "One size")}</option>`).join("")}
      </select>
    </label>
    <label class="admin-field"><span>Made-to-order</span>
      <input data-variant-stock type="number" min="0" step="1" value="${Math.max(0, Number(variant.stock || 0))}" />
    </label>
    <div class="admin-variant-sku"><span>Internal SKU</span><span data-variant-sku-preview class="variant-sku-preview"></span></div>
    <input data-variant-sku type="hidden" value="${escapeHtml(variant.sku || "")}" />
    <button class="admin-danger-button" data-remove-variant type="button" ${hasExistingSku ? "disabled" : ""}>Remove</button>
  `;
  container.appendChild(row);
  row.querySelector("[data-variant-size]")?.addEventListener("change", () => updateAutoSkuForRow(row));
  row.querySelector("[data-variant-color]")?.addEventListener("change", () => updateAutoSkuForRow(row));
  updateAutoSkuForRow(row);
  const preview = row.querySelector<HTMLElement>("[data-variant-sku-preview]");
  if (preview && hasExistingSku) preview.textContent = `${variant.sku} · locked`;
}
function inferLegacyColor(title: string): string {
  return ["Black", "White", "Natural", "Blue", "Red", "Green", "Grey", "Gray"].find(c =>
    new RegExp(`\\b${c}\\b`, "i").test(title)) || "";
}

/* =========================================================
   COLOR GALLERIES — local UI state; uploads reuse /product-images.
   Existing variant SKUs are never regenerated.
   ========================================================= */
function clearColorPreviewUrls() {
  colorPreviewUrls.forEach(url => URL.revokeObjectURL(url));
  colorPreviewUrls.length = 0;
}
function addColorDraft(name: string, hex = "", images: string[] = [], existing = false, render = true): void {
  const clean = name.trim();
  if (!clean || colorDrafts.some(c => c.name.toLowerCase() === clean.toLowerCase())) return;
  if (!defaultProductColor) defaultProductColor = clean;
  colorDrafts.push({ uid: ++nextColorUid, name: clean,
    hex: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : (KNOWN_COLOR_HEX[clean.toLowerCase()] || "#CCCCCC"),
    images: Array.isArray(images) ? [...images] : [], pending: [], existing });
  if (render) renderColorEditor();
}
function renderColorEditor() {
  const editor = document.getElementById("productColorEditor");
  if (!editor) return;
  clearColorPreviewUrls();
  const defaultSelect = document.getElementById("productDefaultColor") as HTMLSelectElement | null;
  if (defaultSelect) {
    if (!colorDrafts.some(c => c.name === defaultProductColor)) defaultProductColor = colorDrafts[0]?.name || "";
    defaultSelect.innerHTML = colorDrafts.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
    defaultSelect.value = defaultProductColor;
  }
  editor.innerHTML = colorDrafts.map(c => `
    <section class="admin-color-card" data-color-uid="${c.uid}">
      <header class="admin-color-card__header">
        <div class="admin-color-card__title"><span class="admin-color-card__dot" style="background:${c.hex}"></span>
          <strong>${escapeHtml(c.name)}</strong>
          <label class="admin-color-card__hex">Swatch <input type="color" data-color-hex="${c.uid}" value="${c.hex}" /></label>
        </div>
        <button type="button" class="admin-danger-button" data-remove-color="${c.uid}" ${c.existing ? "disabled" : ""}>Remove color</button>
      </header>
      <div class="admin-color-card__dropzone" data-color-drop="${c.uid}" role="button" tabindex="0" aria-label="Upload ${escapeHtml(c.name)} photos">
        <input type="file" data-color-files="${c.uid}" accept="image/jpeg,image/png,image/webp" multiple hidden />
        <strong>Drop ${escapeHtml(c.name)} photos here</strong><small>or click to choose images</small>
      </div>
      <div class="product-image-preview admin-color-card__preview">${[
        ...c.images.map((url, i) => `<div class="product-image-preview__item"><img src="${escapeHtml(url)}" alt="${escapeHtml(c.name)} photo"/><button type="button" data-remove-color-image="${c.uid}:${i}" aria-label="Remove photo">×</button></div>`),
        ...c.pending.map((file, i) => {
          const url = URL.createObjectURL(file);
          colorPreviewUrls.push(url);
          return `<div class="product-image-preview__item"><img src="${escapeHtml(url)}" alt="${escapeHtml(file.name)}"/><button type="button" data-remove-color-pending="${c.uid}:${i}" aria-label="Remove pending photo">×</button></div>`;
        })
      ].join("")}</div>
    </section>`).join("") || `<p class="admin-muted">No colors yet. Add at least one color above.</p>`;
}
document.getElementById("productDefaultColor")?.addEventListener("change", () => {
  defaultProductColor = inputValue("productDefaultColor");
});
const colorEditor = document.getElementById("productColorEditor");
function colorByUid(uid: number) {return colorDrafts.find(c => c.uid === uid);}
colorEditor?.addEventListener("click", event => {
  const el = event.target as HTMLElement;
  const remove = el.closest<HTMLButtonElement>("[data-remove-color]");
  if (remove) {
    const draft = colorByUid(Number(remove.dataset.removeColor));
    if (!draft || draft.existing) return;
    colorDrafts = colorDrafts.filter(c => c.uid !== draft.uid);
    if (defaultProductColor === draft.name) defaultProductColor = colorDrafts[0]?.name || "";
    document.querySelectorAll<HTMLElement>("#variantRows .dynamic-row").forEach(row => {
      if (childInputValue(row, "[data-variant-color]").toLowerCase() === draft.name.toLowerCase()
          && row.dataset.legacySku !== "true") row.remove();
    });
    renderColorEditor(); return;
  }
  for (const selector of ["[data-remove-color-image]", "[data-remove-color-pending]"]) {
    const btn = el.closest<HTMLButtonElement>(selector);
    if (!btn) continue;
    const val = selector.includes("pending") ? btn.dataset.removeColorPending : btn.dataset.removeColorImage;
    const [uid,index] = String(val || "").split(":").map(Number);
    const draft = colorByUid(uid);
    if (draft && Number.isInteger(index)) {
      if (selector.includes("pending")) draft.pending.splice(index,1); else draft.images.splice(index,1);
      renderColorEditor();
    }
    return;
  }
  const zone = el.closest<HTMLElement>("[data-color-drop]");
  if (zone && !el.closest("input")) zone.querySelector<HTMLInputElement>("input[type=file]")?.click();
});
colorEditor?.addEventListener("change", event => {
  const input = event.target as HTMLInputElement;
  if (input.matches("[data-color-hex]")) {
    const draft = colorByUid(Number(input.dataset.colorHex));
    if (draft) {draft.hex = input.value;renderColorEditor();}
  }
  if (input.matches("[data-color-files]")) {
    const draft = colorByUid(Number(input.dataset.colorFiles));
    if (draft) addFilesToColor(draft, Array.from(input.files || []));
  }
});
colorEditor?.addEventListener("keydown", event => {
  const el = event.target as HTMLElement;
  if ((event.key === "Enter" || event.key === " ") && el.matches("[data-color-drop]")) {
    event.preventDefault();el.querySelector<HTMLInputElement>("input[type=file]")?.click();
  }
});
colorEditor?.addEventListener("dragover", event => {
  const zone = (event.target as HTMLElement).closest<HTMLElement>("[data-color-drop]");
  if (zone) {event.preventDefault();zone.classList.add("is-dragging");}
});
colorEditor?.addEventListener("dragleave", event => {
  const zone = (event.target as HTMLElement).closest<HTMLElement>("[data-color-drop]");
  zone?.classList.remove("is-dragging");
});
colorEditor?.addEventListener("drop", event => {
  const zone = (event.target as HTMLElement).closest<HTMLElement>("[data-color-drop]");
  if (!zone) return;
  event.preventDefault(); zone.classList.remove("is-dragging");
  const draft = colorByUid(Number(zone.dataset.colorDrop));
  if (draft) addFilesToColor(draft, Array.from(event.dataTransfer?.files || []));
});
function addFilesToColor(draft: ColorDraft, files: File[]) {
  const allowed = files.filter(isAllowedProductImage);
  if (allowed.length !== files.length) setInlineStatus(document.getElementById("colorEditorStatus"),"Only PNG/JPG/WEBP photos are supported.","error");
  draft.pending.push(...allowed);
  renderColorEditor();
}
document.getElementById("addColorOptionButton")?.addEventListener("click", () => {
  let name = inputValue("addColorSelect");
  if (name === "Custom") name = window.prompt("Color name (e.g. Navy)")?.trim() || "";
  if (!name) return;
  if (colorDrafts.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    setInlineStatus(document.getElementById("colorEditorStatus"),"This color already exists.","error"); return;
  }
  addColorDraft(name);
  addDefaultSizesForColor(name);
  setInlineStatus(document.getElementById("colorEditorStatus"),`${name} added. Set stock and upload its photos.`,"success");
});

function isAllowedProductImage(file: File) {
  return ["image/png", "image/jpeg", "image/webp"].includes(file.type);
}

function addProductImageFiles(files: File[]) {
  const valid = files.filter(isAllowedProductImage);

  if (valid.length !== files.length) {
    setInlineStatus(
      document.getElementById("productFormStatus"),
      "Only PNG, JPG and WEBP images are allowed.",
      "error"
    );
  }

  pendingProductImageFiles.push(...valid);
  renderProductImagePreview();
}

function renderProductImagePreview() {
  const preview = document.getElementById("productImagePreview");
  if (!preview) return;

  const existingHtml = existingProductImages.map((url, index) => `
    <div class="product-image-preview__item">
      <img src="${escapeHtml(url)}" alt="Product image" />
      <button type="button" data-remove-existing-image="${index}" aria-label="Remove image">×</button>
    </div>
  `);

  const pendingHtml = pendingProductImageFiles.map((file, index) => {
    const localUrl = URL.createObjectURL(file);

    return `
      <div class="product-image-preview__item">
        <img src="${escapeHtml(localUrl)}" alt="${escapeHtml(file.name)}" />
        <button type="button" data-remove-pending-image="${index}" aria-label="Remove image">×</button>
      </div>
    `;
  });

  preview.innerHTML = [...existingHtml, ...pendingHtml].join("");
}

async function uploadPendingProductImages(files: File[] = pendingProductImageFiles): Promise<string[]> {
  if (!files.length) return [];

  const formData = new FormData();

  files.forEach((file) => {
    formData.append("images", file);
  });

  const response = await adminApi("/product-images", {
    method: "POST",
    body: formData,
  });

  return Array.isArray(response?.urls) ? response.urls : [];
}

const productImageDropzone = document.getElementById("productImageDropzone");
const productImageFiles = document.getElementById("productImageFiles") as HTMLInputElement | null;

productImageDropzone?.addEventListener("click", () => {
  productImageFiles?.click();
});

productImageDropzone?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    productImageFiles?.click();
  }
});

productImageDropzone?.addEventListener("dragover", (event) => {
  event.preventDefault();
  productImageDropzone.classList.add("is-dragging");
});

productImageDropzone?.addEventListener("dragleave", () => {
  productImageDropzone.classList.remove("is-dragging");
});

productImageDropzone?.addEventListener("drop", (event) => {
  event.preventDefault();
  productImageDropzone.classList.remove("is-dragging");

  addProductImageFiles(Array.from(event.dataTransfer?.files || []));
});

productImageFiles?.addEventListener("change", () => {
  addProductImageFiles(Array.from(productImageFiles.files || []));
  productImageFiles.value = "";
});

document.getElementById("productImagePreview")?.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;

  const existingButton = target.closest<HTMLElement>("[data-remove-existing-image]");
  if (existingButton) {
    const index = Number(existingButton.dataset.removeExistingImage);
    if (Number.isInteger(index)) {
      existingProductImages.splice(index, 1);
      renderProductImagePreview();
    }
    return;
  }

  const pendingButton = target.closest<HTMLElement>("[data-remove-pending-image]");
  if (pendingButton) {
    const index = Number(pendingButton.dataset.removePendingImage);
    if (Number.isInteger(index)) {
      pendingProductImageFiles.splice(index, 1);
      renderProductImagePreview();
    }
  }
});

document.getElementById("productId")?.addEventListener("input", updateAllAutoSkus);

document.getElementById("productCategory")?.addEventListener("change", () => {
  const editing = Boolean(inputValue("productEditingId"));
  if (!editing) {
    if (isTshirtCategory(inputValue("productCategory")) && !colorDrafts.length) addColorDraft("White", "", [], false, false);
    renderColorEditor();
    addDefaultVariantRowsForCategory(inputValue("productCategory"));
  }
});

productForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const statusEl = document.getElementById("productFormStatus");
  const editingId = inputValue("productEditingId");

  if (!inputValue("productId") || !inputValue("productSlug") || !inputValue("productTitle")) {
    setInlineStatus(statusEl, "Product ID, slug and title are required.", "error");
    return;
  }

  if (!ENABLE_MULTI_COLOR_SAVE && (colorDrafts.length > 1 || colorDrafts.some(c => c.pending.length))) {
    setInlineStatus(statusEl,
      "Color selection / galleries are ready in the UI, but saving them requires the next backend + inventory migration step. No product changes were sent.",
      "error");
    return;
  }
  const draftPayload = collectProductPayload();
  const keys = draftPayload.variants.map((v: any) => `${v.color.toLowerCase()}::${v.size.toLowerCase()}`);
  if (new Set(keys).size !== keys.length) {
    setInlineStatus(statusEl,"Duplicate color + size combination. Each option must be unique.","error");return;
  }
  if (draftPayload.variants.some((v: any) => v.color && !colorDrafts.some(c => c.name.toLowerCase() === v.color.toLowerCase()))) {
    setInlineStatus(statusEl,"Each variant must belong to an available color.","error");return;
  }
  setInlineStatus(
    statusEl,
    pendingProductImageFiles.length
      ? "Uploading product images..."
      : editingId
      ? "Saving product..."
      : "Creating product..."
  );

  const submitButton = document.getElementById("saveProductButton") as HTMLButtonElement | null;
  if (submitButton) submitButton.disabled = true;

  try {
    const uploadedImages = await uploadPendingProductImages();
    const uploadedByColor = await Promise.all(colorDrafts.map(async c => ({
      uid:c.uid, urls:await uploadPendingProductImages(c.pending)
    })));
    const payload = collectProductPayload();
    payload.colorOptions = colorDrafts.map(c => ({
      name:c.name, hex:c.hex,
      images:[...c.images,...(uploadedByColor.find(item => item.uid === c.uid)?.urls || [])]
    }));
    payload.defaultColor = defaultProductColor || payload.colorOptions[0]?.name || "";
    if (payload.colorOptions.some((c: any) => !c.images.length) && !existingProductImages.length && !uploadedImages.length) {
      throw new Error("Upload product photos for each color or add shared fallback photos.");
    }

    payload.images = [
      ...existingProductImages,
      ...uploadedImages,
    ];

    if (editingId) {
      await adminApi(`/products/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await adminApi("/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }

    setInlineStatus(statusEl, "Product saved.", "success");

    pendingProductImageFiles = [];
    existingProductImages = payload.images;
    colorDrafts.forEach(c => {
      c.images = payload.colorOptions.find((x: any) => x.name === c.name)?.images || [];
      c.pending = [];
    });

    await loadProducts();
    setTimeout(closeProductModal, 350);
  } catch (error) {
    setInlineStatus(statusEl, errorMessage(error), "error");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

function collectProductPayload() {
  const variants = Array.from(
    document.querySelectorAll<HTMLElement>("#variantRows .dynamic-row")
  )
    .map((row) => {
      updateAutoSkuForRow(row);

      return {
        sku: childInputValue(row, "[data-variant-sku]"),
        size: childInputValue(row, "[data-variant-size]"),
        color: childInputValue(row, "[data-variant-color]"),
        stock: Math.max(0, Number(childInputValue(row, "[data-variant-stock]") || 0)),
      };
    })
    .filter((variant) => variant.sku);

  return {
    id: inputValue("productId"),
    slug: inputValue("productSlug"),
    title: inputValue("productTitle"),
    shortDescription: inputValue("productShortDescription"),
    description: inputValue("productDescription"),
    translations: {
      el: {
        title: inputValue("productTitleEl"),
        shortDescription: inputValue("productShortDescriptionEl"),
        description: inputValue("productDescriptionEl"),
      },
    },
    category: inputValue("productCategory") || "General",
    price: Number(inputValue("productPrice") || 0),
    currency: inputValue("productCurrency") || "EUR",
    discountPercent: Math.min(90, Math.max(0, Math.round(Number(inputValue("productDiscountPercent") || 0)))),
    merchandisingTag: inputValue("productMerchandisingTag") || "none",
    featured: checked("productFeatured"),
    active: checked("productActive"),
    images: [...existingProductImages],
    colorOptions: colorDrafts.map(c => ({name:c.name, hex:c.hex, images:[...c.images]})),
    defaultColor: defaultProductColor || colorDrafts[0]?.name || "",
    variants,
    reviews: [],
  };
}

document.getElementById("adminProductsGrid")?.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;

  const edit = target.closest<HTMLElement>("[data-edit-product]");
  if (edit?.dataset.editProduct) {
    const product = currentProducts.find((item) => item.id === edit.dataset.editProduct);
    if (product) openProductModal(product);
    return;
  }

  const archive = target.closest<HTMLButtonElement>("[data-archive-product]");
  if (archive?.dataset.archiveProduct) {
    const productId = archive.dataset.archiveProduct;
    if (!window.confirm(`Archive product ${productId}?`)) return;

    archive.disabled = true;
    try {
      await adminApi(`/products/${encodeURIComponent(productId)}/archive`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadProducts();
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      archive.disabled = false;
    }
  }
});

/* =========================================================
   CUSTOMERS / PAYMENTS
   ========================================================= */

async function loadCustomers() {
  const data = await adminApi("/customers");
  renderSimpleList(
    "customersList",
    data.customers || [],
    (customer: any) => `${customer.email || customer.id}`
  );
}

async function loadPayments() {
  const data = await adminApi("/payments");
  renderSimpleList(
    "paymentsList",
    data.payments || [],
    (payment: any) => `${payment.vivaOrderCode || payment.orderId} — ${payment.status || ""} — ${formatMoney(Number(payment.amount || 0))}`
  );
}

function renderSimpleList(
  targetId: string,
  items: any[],
  label: (item: any) => string
) {
  const target = document.getElementById(targetId);
  if (!target) return;

  if (!items.length) {
    target.innerHTML = `<div class="admin-list-item"><strong>No data.</strong></div>`;
    return;
  }

  target.innerHTML = items
    .map(
      (item) => `<div class="admin-list-item"><strong>${escapeHtml(label(item))}</strong></div>`
    )
    .join("");
}

/* =========================================================
   REFRESH
   ========================================================= */

refreshButton?.addEventListener("click", () => {
  const active = document.querySelector<HTMLElement>(".admin-nav__item.is-active");
  void loadView(active?.dataset.view || "dashboard");
});

/* =========================================================
   HELPERS
   ========================================================= */

function setText(id: string, text: string) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatDate(value: any): string {
  if (!value) return "—";

  const date = value?.seconds
    ? new Date(value.seconds * 1000)
    : new Date(value);

  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("el-GR");
}

function customerName(customer: any): string {
  return [customer?.firstName, customer?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim() || customer?.name || customer?.email || "Customer";
}

function formatStatus(value: string) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function inputValue(id: string): string {
  const element = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  return String(element?.value || "").trim();
}

function setInputValue(id: string, value: any) {
  const element = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (element) element.value = String(value ?? "");
}

function checked(id: string): boolean {
  return Boolean((document.getElementById(id) as HTMLInputElement | null)?.checked);
}

function setChecked(id: string, value: boolean) {
  const element = document.getElementById(id) as HTMLInputElement | null;
  if (element) element.checked = value;
}

function childInputValue(parent: HTMLElement, selector: string): string {
  const input = parent.querySelector<HTMLInputElement>(selector);
  return String(input?.value || "").trim();
}

function setInlineStatus(
  element: HTMLElement | null,
  message: string,
  type: "success" | "error" | "" = ""
) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-success", type === "success");
  element.classList.toggle("is-error", type === "error");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function escapeHtml(value: any): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
