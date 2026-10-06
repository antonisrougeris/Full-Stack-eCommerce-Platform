import "../../i18n/auto";
import { onAuthStateChanged } from "firebase/auth";
import { initLayout } from "../../components/initLayout";
import { apiRequest, API_BASE_URL } from "../../services/api";
import { firebaseAuth } from "../../services/firebase";
import { locale, t } from "../../i18n/locale";

initLayout();

type ReturnEligibility = {
  eligible: boolean;
  reasonCode?: string;
  message?: string;
  deadline?: string | null;
  daysRemaining?: number;
};

type ReturnItem = {
  id: string;
  productId?: string;
  title?: string;
  quantity?: number;
  unitPrice?: number;
  sku?: string;
  variant?: { size?: string; color?: string } | null;
  returnableQuantity?: number;
};

type EligibleOrder = {
  id: string;
  orderNumber?: string;
  currency?: string;
  items?: ReturnItem[];
  returnEligibility?: ReturnEligibility;
};

type ReturnRequest = {
  id: string;
  returnNumber?: string;
  orderId?: string;
  orderNumber?: string;
  status?: string;
  refundEstimate?: number;
  currency?: string;
  items?: Array<{
    title?: string;
    quantity?: number;
    variant?: { size?: string; color?: string } | null;
    reasonLabel?: string;
  }>;
  review?: { note?: string };
  createdAt?: string;
};

const authMessage = document.getElementById("returnsAuth");
const app = document.getElementById("returnsApp");
const eligibleOrdersEl = document.getElementById("eligibleOrders");
const historyEl = document.getElementById("returnHistory");
const formSection = document.getElementById("returnFormSection");
const form = document.getElementById("returnForm") as HTMLFormElement | null;
const formItems = document.getElementById("returnItems");
const formTitle = document.getElementById("returnFormTitle");
const orderIdInput = document.getElementById("returnOrderId") as HTMLInputElement | null;
const formStatus = document.getElementById("returnFormStatus");
const estimateEl = document.getElementById("returnEstimate");

let orders: EligibleOrder[] = [];
let returns: ReturnRequest[] = [];
let selectedOrder: EligibleOrder | null = null;

const reasons = [
  ["changed_mind", t("returns.changed_mind", "Changed my mind")],
  ["wrong_size", t("returns.wrong_size", "Wrong size")],
  ["wrong_item", t("returns.wrong_item", "Wrong item received")],
  ["damaged", t("returns.damaged", "Arrived damaged")],
  ["defective", t("returns.defective", "Defective product")],
  ["not_as_described", t("returns.not_as_described", "Not as described")],
  ["other", t("returns.other", "Other")],
];

const statusSteps = [
  "requested",
  "label_ready",
  "dropped_off",
  "in_transit",
  "refund_pending",
  "refunded",
];

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: unknown, currency = "EUR"): string {
  return new Intl.NumberFormat(
    locale === "el" ? "el-GR" : "en-IE",
    {
    style: "currency",
      currency,
    }
  ).format(Number(value || 0));
}

function date(value: unknown): string {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime())
    ? ""
    : new Intl.DateTimeFormat(
        locale === "el" ? "el-GR" : "en-GB",
        {
        day: "2-digit",
        month: "short",
          year: "numeric",
        }
      ).format(parsed);
}

function statusLabel(value: unknown): string {
  const status =
    String(
      value || "requested"
    );

  return t(
    `status.${status}`,
    status
      .replaceAll("_", " ")
      .replace(
        /\b\w/g,
        (letter) =>
          letter.toUpperCase()
      )
  );
}

async function loadData(): Promise<void> {
  const [eligibilityResponse, returnsResponse] = await Promise.all([
    apiRequest<{ orders?: EligibleOrder[] }>("/returns/eligibility"),
    apiRequest<{ returns?: ReturnRequest[] }>("/returns"),
  ]);

  orders = eligibilityResponse?.orders || [];
  returns = returnsResponse?.returns || [];

  renderEligibleOrders();
  renderReturnHistory();

  const requestedOrderId =
    new URLSearchParams(window.location.search).get("orderId");

  if (requestedOrderId) {
    const order = orders.find((item) => item.id === requestedOrderId);
    if (order?.returnEligibility?.eligible) {
      openReturnForm(order);
    }
  }
}

function renderEligibleOrders(): void {
  if (!eligibleOrdersEl) return;

  if (!orders.length) {
    eligibleOrdersEl.innerHTML =
      '<p class="return-muted">No paid orders were found on this account.</p>';
    return;
  }

  eligibleOrdersEl.innerHTML = orders
    .map((order) => {
      const eligibility = order.returnEligibility;
      const eligible = Boolean(eligibility?.eligible);
      const available = (order.items || []).reduce(
        (sum, item) => sum + Number(item.returnableQuantity || 0),
        0
      );

      return `
        <article class="return-order">
          <div class="return-order__top">
            <div>
              <span class="returns-eyebrow">ORDER</span>
              <h3>${esc(order.orderNumber || order.id)}</h3>
              <div class="return-order__meta">
                ${available} item(s) currently available to return
                ${eligibility?.deadline ? ` · Return by ${esc(date(eligibility.deadline))}` : ""}
              </div>
            </div>
            ${eligible
              ? '<span class="return-status return-status--approved">Eligible</span>'
              : '<span class="return-status">Not eligible</span>'}
          </div>
          <div class="return-order__actions">
            <span class="return-ineligible">
              ${esc(eligibility?.message || "")}
            </span>
            ${eligible
              ? `<button class="returns-primary" type="button" data-start-return="${esc(order.id)}">Return items</button>`
              : ""}
          </div>
        </article>
      `;
    })
    .join("");

  eligibleOrdersEl
    .querySelectorAll<HTMLButtonElement>("[data-start-return]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const order = orders.find(
          (item) => item.id === button.dataset.startReturn
        );
        if (order) openReturnForm(order);
      });
    });
}

function openReturnForm(order: EligibleOrder): void {
  selectedOrder = order;
  if (orderIdInput) orderIdInput.value = order.id;
  if (formTitle) {
    formTitle.textContent = `Return items from ${order.orderNumber || order.id}`;
  }

  if (formItems) {
    formItems.innerHTML = (order.items || [])
      .filter((item) => Number(item.returnableQuantity || 0) > 0)
      .map((item) => {
        const max = Number(item.returnableQuantity || 0);

        return `
          <div class="return-item" data-return-item="${esc(item.id)}" data-price="${Number(item.unitPrice || 0)}">
            <label class="return-item__check">
              <input
                class="return-item__selected"
                type="checkbox"
                aria-label="Select ${esc(item.title)}"
              />
            </label>

            <div class="return-item__body">
              <div class="return-item__summary">
                <div>
                  <div class="return-item__title">${esc(item.title || "Product")}</div>
                  <div class="return-item__details">
                    ${item.variant?.color ? esc(item.variant.color) : ""}
                    ${item.variant?.size ? ` · Size ${esc(item.variant.size)}` : ""}
                    · ${money(item.unitPrice, order.currency)}
                  </div>
                </div>

                <div class="return-item__controls">
                  <label>
                    <span class="return-control-label">Quantity</span>
                    <select class="return-item__quantity" disabled>
                      ${Array.from({ length: max }, (_, i) => i + 1)
                        .map((qty) => `<option value="${qty}">${qty}</option>`)
                        .join("")}
                    </select>
                  </label>
                </div>
              </div>

              <div class="return-reason-row">
                <label>
                  <span class="return-control-label">Reason for return</span>
                  <select class="return-item__reason" disabled>
                    <option value="">Choose a reason</option>
                    ${reasons
                      .map(([value, label]) => `<option value="${value}">${label}</option>`)
                      .join("")}
                  </select>
                </label>

                <label>
                  <span class="return-control-label">Item note <span class="return-muted">(optional)</span></span>
                  <input
                    class="return-item__note"
                    maxlength="1000"
                    placeholder="Add details about this item"
                    disabled
                  />
                </label>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  form?.reset();

  formItems
    ?.querySelectorAll<HTMLElement>("[data-return-item]")
    .forEach(syncReturnItemState);

  if (orderIdInput) orderIdInput.value = order.id;
  if (formStatus) formStatus.textContent = "";
  updateEstimate();
  formSection?.classList.remove("hidden");
  formSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeReturnForm(): void {
  selectedOrder = null;
  formSection?.classList.add("hidden");
  if (formStatus) formStatus.textContent = "";
}

function updateEstimate(): void {
  let total = 0;

  formItems
    ?.querySelectorAll<HTMLElement>("[data-return-item]")
    .forEach((row) => {
      const selected = row.querySelector<HTMLInputElement>(".return-item__selected");
      if (!selected?.checked) return;

      const quantity = Number(
        row.querySelector<HTMLSelectElement>(".return-item__quantity")?.value || 0
      );
      total += Number(row.dataset.price || 0) * quantity;
    });

  if (estimateEl) {
    estimateEl.textContent = money(total, selectedOrder?.currency || "EUR");
  }
}

function syncReturnItemState(row: HTMLElement): void {
  const selected =
    row.querySelector<HTMLInputElement>(".return-item__selected");

  const enabled = Boolean(selected?.checked);

  row.classList.toggle("is-selected", enabled);

  row
    .querySelectorAll<
      HTMLSelectElement | HTMLInputElement
    >(
      ".return-item__quantity, .return-item__reason, .return-item__note"
    )
    .forEach((control) => {
      control.disabled = !enabled;
    });
}

formItems?.addEventListener("change", (event) => {
  const target = event.target as HTMLElement | null;
  const row = target?.closest<HTMLElement>("[data-return-item]");

  if (row) {
    syncReturnItemState(row);
  }

  updateEstimate();

  if (formStatus?.textContent) {
    formStatus.textContent = "";
  }
});

document.getElementById("closeReturnForm")?.addEventListener(
  "click",
  closeReturnForm
);

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedOrder) return;

  const items = Array.from(
    formItems?.querySelectorAll<HTMLElement>("[data-return-item]") || []
  )
    .filter(
      (row) =>
        row.querySelector<HTMLInputElement>(".return-item__selected")?.checked
    )
    .map((row) => ({
      orderItemId: row.dataset.returnItem,
      quantity: Number(
        row.querySelector<HTMLSelectElement>(".return-item__quantity")?.value || 0
      ),
      reason:
        row.querySelector<HTMLSelectElement>(".return-item__reason")?.value || "",
      note:
        row.querySelector<HTMLInputElement>(".return-item__note")?.value.trim() || "",
    }));

  if (!items.length) {
    if (formStatus) formStatus.textContent = "Select at least one item.";
    return;
  }

  if (items.some((item) => !item.reason)) {
    if (formStatus) formStatus.textContent = "Choose a reason for every selected item.";
    return;
  }

  const confirmed = (
    document.getElementById("returnConditionConfirmed") as HTMLInputElement | null
  )?.checked;

  if (!confirmed) {
    if (formStatus) formStatus.textContent = "Confirm the return condition statement.";
    return;
  }

  const submit = document.getElementById("submitReturn") as HTMLButtonElement | null;
  if (submit) {
    submit.disabled = true;
    submit.textContent = "Submitting…";
  }

  try {
    const response = await apiRequest<{ return: ReturnRequest }>("/returns", {
      method: "POST",
      body: JSON.stringify({
        orderId: selectedOrder.id,
        items,
        customerNote:
          (document.getElementById("returnCustomerNote") as HTMLTextAreaElement | null)
            ?.value.trim() || "",
        conditionConfirmed: true,
      }),
    });

    window.history.replaceState(
      {},
      "",
      `/returns?returnId=${encodeURIComponent(response.return.id)}`
    );

    closeReturnForm();
    await loadData();
  } catch (error) {
    if (formStatus) {
      formStatus.textContent =
        error instanceof Error ? error.message : "Could not create return request.";
    }
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = "Submit return request";
    }
  }
});

function renderReturnHistory(): void {
  if (!historyEl) return;

  if (!returns.length) {
    historyEl.innerHTML =
      '<p class="return-muted">You have not started a return yet.</p>';
    return;
  }

  const requestedReturnId =
    new URLSearchParams(window.location.search).get("returnId");

  historyEl.innerHTML = returns
    .map((request) => {
      const status = String(request.status || "requested");
      const stepIndex = statusSteps.indexOf(status);
      const canCancel = ["requested", "provider_failed"].includes(status);

      return `
        <article class="return-history-card" id="return-${esc(request.id)}">
          <div class="return-history-card__top">
            <div>
              <span class="returns-eyebrow">RETURN</span>
              <h3>${esc(request.returnNumber || request.id)}</h3>
              <div class="return-muted">
                Order ${esc(request.orderNumber || "")}
                ${request.createdAt ? ` · ${esc(date(request.createdAt))}` : ""}
                · Estimated refund ${money(request.refundEstimate, request.currency)}
              </div>
            </div>
            <span class="return-status return-status--${esc(status)}">
              ${esc(statusLabel(status))}
            </span>
          </div>

          <div class="return-timeline">
            ${statusSteps
              .map((step, index) => `
                <span class="${index < stepIndex ? "is-complete" : index === stepIndex ? "is-current" : ""}">
                  ${esc(statusLabel(step))}
                </span>
              `)
              .join("")}
          </div>

          ${request.review?.note
            ? `<p class="return-muted" style="margin-top:12px;">${esc(request.review.note)}</p>`
            : ""}

          <div class="return-history-card__actions">
            ${canCancel
              ? `<button class="returns-secondary" type="button" data-cancel-return="${esc(request.id)}">Cancel request</button>`
              : ""}
          </div>
        </article>
      `;
    })
    .join("");

  historyEl
    .querySelectorAll<HTMLButtonElement>("[data-cancel-return]")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        if (!window.confirm("Cancel this return request?")) return;
        button.disabled = true;

        try {
          await apiRequest(`/returns/${encodeURIComponent(button.dataset.cancelReturn || "")}/cancel`, {
            method: "POST",
          });
          await loadData();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : "Could not cancel return.");
          button.disabled = false;
        }
      });
    });

      });
    });

  if (requestedReturnId) {
    document
      .getElementById(`return-${requestedReturnId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function downloadVoucher(returnId: string): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Sign in to download your voucher.");

  const token = await user.getIdToken();
  const response = await fetch(
    `${API_BASE_URL}/returns/${encodeURIComponent(returnId)}/label`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    window.alert(payload?.message || "Return voucher is not available yet.");
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `return-${returnId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

onAuthStateChanged(firebaseAuth, async (user) => {
  if (!user) {
    if (authMessage) {
      authMessage.innerHTML =
        'Please <a href="/login?redirect=%2Freturns">sign in</a> to start or track a return.';
    }
    app?.classList.add("hidden");
    return;
  }

  try {
    if (authMessage) authMessage.textContent = "Loading your orders and returns…";
    await loadData();
    authMessage?.classList.add("hidden");
    app?.classList.remove("hidden");
  } catch (error) {
    if (authMessage) {
      authMessage.textContent =
        error instanceof Error ? error.message : "Could not load the Returns Center.";
    }
  }
});
