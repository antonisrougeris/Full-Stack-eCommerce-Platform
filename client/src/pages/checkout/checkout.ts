import "../../i18n/auto";


import { firebaseAuth } from "../../services/firebase";
import { getCart, type CartItem } from "../../services/cart";
import { checkout } from "../../services/checkout";
import { getMe } from "../../services/api";
import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
const CHECKOUT_DRAFT_KEY = "skanare_checkout_draft";
const PREMIUM_GIFT_PRICE = 1.5;
import { setFlashToast } from "../../utils/toast.ts";
import { normalizeSameOriginPath } from "../../utils/redirect";
import {
  locale,
  localizedPath,
} from "../../i18n/locale";

function saveCheckoutDraft(formEl: HTMLFormElement): void {
  const form = new FormData(formEl)
  const draft: Record<string, string> = {};

  form.forEach((value, key) => {
    draft[key] = String(value);
  });

  formEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name]')
    .forEach((checkbox) => {
      draft[checkbox.name] = String(checkbox.checked);
    });

  localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
}

function restoreCheckoutDraft(): void {
  const raw = localStorage.getItem(CHECKOUT_DRAFT_KEY);
  if (!raw) return;

  try {
    const draft = JSON.parse(raw) as Record<string, string>;

    Object.entries(draft).forEach(([key, value]) => {
      const el = document.querySelector<HTMLInputElement>(
        `[name="${CSS.escape(key)}"]`
      );

      if (!el) return;

      if (el.type === "radio") {
        const radio = document.querySelector<HTMLInputElement>(
          `input[name="${CSS.escape(key)}"][value="${CSS.escape(value)}"]`
        );
        if (radio) radio.checked = true;
        return;
      }

      if (el.type === "checkbox") {
        el.checked = value === "true" || value === "on";
        if (key === "giftBox") {
          el.dataset.cartGiftInitialized = "true";
        }
        return;
      }

      el.value = value;

      if (key === "personalNote") {
        el.dataset.cartGiftInitialized = "true";
      }
    });
  } catch {
    localStorage.removeItem(CHECKOUT_DRAFT_KEY);
  }
}

function saveCheckoutDraftFromPage(): void {
  const form = document.getElementById("checkoutForm") as HTMLFormElement | null;
  if (form) saveCheckoutDraft(form);
}

let discount = 0;
let checkoutSubmitting = false;
let checkoutHasItems = true;

function formatPrice(n: number): string {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
  }).format(n || 0);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCartItemTitle(item: CartItem): string {
  return item.title || "Product";
}

function getCartItemImage(item: CartItem): string {
  return item.image || "/assets/img/logo_Image.png";
}

function getCartItemUnitPrice(item: CartItem): number {
  return typeof item.price === "number" ? item.price : 0;
}

function getCartItemVariant(item: CartItem) {
  return item.variant || null;
}

function getCartItemQr(item: CartItem): string {
  return item.qrDestination || "";
}

function calculateShipping(
  subtotal: number
): number {
  if (subtotal >= 50) {
    return 0;
  }

  return 2.0;
}

function setPayButtonState(): void {
  const button = document.querySelector<HTMLButtonElement>(
    "#checkoutForm button[type='submit']"
  );

  if (!button) return;

  const user = firebaseAuth.currentUser;

  if (!checkoutHasItems) {
    button.disabled = true;
    button.textContent = "Add products to continue";
    return;
  }

  button.disabled = checkoutSubmitting;

  if (!user) {
    button.textContent = "Sign in to pay with viva.com";
  } else {
    button.textContent = "Pay with viva.com";
  }
}



async function render(): Promise<void> {
  const cart = await getCart();
  const items: CartItem[] = cart?.items || [];

  const giftSection =
    document.getElementById("gift-options") as HTMLDetailsElement | null;

  const personalNoteInput = document.querySelector<HTMLTextAreaElement>(
    'textarea[name="personalNote"]'
  );

  if (
    giftSection &&
    giftSection.dataset.cartGiftInitialized !== "true"
  ) {
    const cartTier =
      cart?.giftOptions?.tier === "simple" ||
      cart?.giftOptions?.tier === "premium"
        ? cart.giftOptions.tier
        : cart?.giftOptions?.giftBox
          ? "premium"
          : "none";

    const tierInput =
      document.querySelector<HTMLInputElement>(
        `input[name="giftTier"][value="${cartTier}"]`
      );

    if (tierInput) {
      tierInput.checked = true;
    }

    if (personalNoteInput) {
      personalNoteInput.value =
        cart?.giftOptions?.personalNote || "";
    }

    giftSection.dataset.cartGiftInitialized = "true";
  }

  const giftTier =
    (
      document.querySelector<HTMLInputElement>(
        'input[name="giftTier"]:checked'
      )?.value || "none"
    ) as "none" | "simple" | "premium";

  const hasGiftOptions =
    giftTier !== "none";

  document
    .querySelector<HTMLElement>("[data-checkout-gift-note]")
    ?.classList.toggle(
      "hidden",
      giftTier !== "premium"
    );

  const giftSummaryAction =
    document.querySelector<HTMLElement>(
      ".checkout-gift-summary__action"
    );

  if (giftSummaryAction) {
    giftSummaryAction.textContent =
      hasGiftOptions ? "Added" : "Add";
  }

  const container = document.getElementById("checkoutItems");
  if (!container) return;

  let subtotal = 0;

  const summary =
    document.querySelector<HTMLElement>(".checkout-page__summary");

  if (items.length === 0) {
    checkoutHasItems = false;
    summary?.classList.add("is-empty");

    container.innerHTML = `
      <div class="checkout-empty-state">
        <strong>Your cart is empty</strong>
        <p>Add a product before continuing to payment.</p>
        <a href="/products">Shop products →</a>
      </div>
    `;

    document.getElementById("subtotal")!.textContent = formatPrice(0);
    document.getElementById("shipping")!.textContent = formatPrice(0);
    document.getElementById("total")!.textContent = formatPrice(0);

    document
      .getElementById("giftFeeRow")
      ?.classList.add("hidden");

    const msg = document.getElementById("freeShippingMsg");
    if (msg) msg.textContent = "";

    setPayButtonState();
    return;
  }

  checkoutHasItems = true;
  summary?.classList.remove("is-empty");
  setPayButtonState();

  container.innerHTML = items
    .map((item) => {
      const unitPrice = getCartItemUnitPrice(item);
      const itemTotal = unitPrice * Number(item.quantity || 0);
      subtotal += itemTotal;

      const variant = getCartItemVariant(item);
      const title = escapeHtml(getCartItemTitle(item));
      const image = escapeHtml(getCartItemImage(item));
      const qr = escapeHtml(getCartItemQr(item));
      const quantity = Number(item.quantity || 0);

      return `
        <div class="checkout-item">
          <div class="checkout-item__image-wrapper">
            <img src="${image}" alt="${title}" />
            <span class="checkout-item__badge">${quantity}</span>
          </div>

          <div class="checkout-item__info">
            <p>${title}</p>
            <small>Size: ${escapeHtml(variant?.size || "-")}</small>
            ${qr ? `<small>${qr}</small>` : ""}
          </div>

          <strong>${formatPrice(itemTotal)}</strong>
        </div>
      `;
    })
    .join("");

  const discountedSubtotal = subtotal * (1 - discount / 100);
  const shipping =
    calculateShipping(
      discountedSubtotal
    );
  const giftFee =
    giftTier === "premium"
      ? PREMIUM_GIFT_PRICE
      : 0;
  const total =
    discountedSubtotal +
    shipping +
    giftFee;

  document.getElementById("subtotal")!.textContent =
    formatPrice(discountedSubtotal);

  document.getElementById("shipping")!.textContent =
    shipping === 0 ? "Free" : formatPrice(shipping);

  const giftFeeRow =
    document.getElementById("giftFeeRow");

  giftFeeRow?.classList.toggle(
    "hidden",
    giftFee === 0
  );

  const giftFeeValue =
    document.getElementById("giftFee");

  if (giftFeeValue) {
    giftFeeValue.textContent =
      "+" + formatPrice(giftFee);
  }

  document.getElementById("total")!.textContent = formatPrice(total);

  const msg =
  document.getElementById(
    "freeShippingMsg"
  );

if (msg) {

  msg.classList.remove(
    "is-unlocked"
  );

  if (discountedSubtotal < 50) {

    const amountLeft =
      50 - discountedSubtotal;

    msg.textContent =
      `Add ${formatPrice(
        amountLeft
      )} for FREE shipping`;

  } else if (
    discountedSubtotal < 80
  ) {

    const amountLeft =
      80 - discountedSubtotal;

    msg.textContent =
      `Add ${formatPrice(
        amountLeft
      )} more to get a FREE sticker set`;

  } else {

    msg.textContent =
      "FREE Skanare sticker set added 🎁";

    msg.classList.add(
      "is-unlocked"
    );
  }
}
}

function getRequiredFormString(
  form: FormData,
  field: string,
  label: string
): string {
  const value = String(form.get(field) || "").trim();

  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}




const PHONE_RULES: Record<string, { length: number; prefix?: RegExp }> = {
  GR: { length: 10, prefix: /^69/ },
  CY: { length: 8, prefix: /^9/ },
  GB: { length: 10, prefix: /^7/ },
  DE: { length: 10 },
  FR: { length: 9, prefix: /^[67]/ },
  IT: { length: 9, prefix: /^3/ },
  ES: { length: 9, prefix: /^[6789]/ },
  US: { length: 10 },
  CA: { length: 10 },
  AU: { length: 9, prefix: /^4/ },
  NL: { length: 9, prefix: /^6/ },
  BE: { length: 9, prefix: /^4/ },
  AT: { length: 10 },
  PT: { length: 9, prefix: /^9/ },
  IE: { length: 9, prefix: /^8/ },
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}



function keepDigitsOnly(input: HTMLInputElement): void {
  input.value = input.value.replace(/\D/g, "");
}

function getPhoneValidationMessage(
  phoneNumber: string,
  phoneCountryCode: string
): string {
  if (!phoneNumber) return "Phone number is required.";
  if (!/^\d+$/.test(phoneNumber)) return "Phone number must contain digits only.";

  const phoneRule = PHONE_RULES[phoneCountryCode];
  if (!phoneRule) return "Select a valid phone country.";

  const prefixMessage = phoneRule.prefix
    ? phoneCountryCode === "GR"
      ? "Greek phone numbers must start with 69."
      : "Phone number does not have the correct prefix for the selected country."
    : "";

  if (phoneNumber.length !== phoneRule.length) {
    return phoneCountryCode === "GR"
      ? "Greek phone numbers must start with 69 and contain exactly 10 digits."
      : `Phone number must contain exactly ${phoneRule.length} digits for the selected country.`;
  }

  if (phoneRule.prefix && !phoneRule.prefix.test(phoneNumber)) {
    return prefixMessage;
  }

  const parsedPhone = parsePhoneNumberFromString(
    phoneNumber,
    phoneCountryCode as CountryCode
  );
  if (!parsedPhone?.isValid()) {
    return "Enter a valid phone number for the selected country.";
  }

  return "";
}

function updatePhoneValidity(): void {
  const phoneInput = document.querySelector<HTMLInputElement>(
    "input[name='phoneNumber']"
  );
  const countrySelect = document.querySelector<HTMLSelectElement>(
    "select[name='phoneCountryCode']"
  );
  if (!phoneInput || !countrySelect) return;

  phoneInput.setCustomValidity(
    getPhoneValidationMessage(phoneInput.value.trim(), countrySelect.value)
  );

  const message = document.getElementById("phoneValidationMessage");
  const validationMessage = phoneInput.validationMessage;
  if (message) {
    message.textContent = validationMessage;
    message.hidden = !validationMessage;
  }
}

function updateBillingDocumentFields(): void {
  const selected = document.querySelector<HTMLInputElement>(
    'input[name="documentType"]:checked'
  );

  const invoiceFields = document.getElementById("invoiceFields");
  const wantsInvoice = selected?.value === "invoice";

  invoiceFields?.classList.toggle("hidden", !wantsInvoice);

  const invoiceNames = [
    "invoiceCompanyName",
    "invoiceVatNumber",
    "invoiceTaxOffice",
    "invoiceActivity",
    "invoiceAddress",
    "invoiceCity",
    "invoicePostalCode",
  ];

  for (const name of invoiceNames) {
    const input = document.querySelector<HTMLInputElement>(
      `[name="${name}"]`
    );

    if (input) {
      input.required = wantsInvoice;
    }
  }
}

function readInvoiceDetails(form: FormData) {
  const documentType =
    String(form.get("documentType") || "receipt") === "invoice"
      ? "invoice"
      : "receipt";

  if (documentType === "receipt") {
    return {
      documentType,
      invoiceDetails: null,
    } as const;
  }

  const required = (name: string, label: string) => {
    const value = String(form.get(name) || "").trim();

    if (!value) {
      throw new Error(`${label} is required for an invoice.`);
    }

    return value;
  };

  return {
    documentType,
    invoiceDetails: {
      companyName: required("invoiceCompanyName", "Company name"),
      vatNumber: required("invoiceVatNumber", "VAT number / AFM"),
      taxOffice: required("invoiceTaxOffice", "Tax office"),
      activity: required("invoiceActivity", "Business activity"),
      address: required("invoiceAddress", "Billing address"),
      city: required("invoiceCity", "Billing city"),
      postalCode: required("invoicePostalCode", "Billing postal code"),
    },
  } as const;
}


function updateLockerValidity(showError = false): boolean {
  const lockerInput = document.getElementById("lockerInput") as HTMLInputElement | null;
  const lockerMessage = document.getElementById("lockerValidationMessage");
  const lockerButton = document.getElementById("selectLockerBtn") as HTMLButtonElement | null;

  if (!lockerInput) return false;

  const user = firebaseAuth.currentUser;
  if (!user) {
    lockerInput.setCustomValidity("");
    lockerButton?.classList.remove("is-invalid");
    lockerButton?.removeAttribute("aria-invalid");

    if (lockerMessage) {
      lockerMessage.textContent = "";
      lockerMessage.hidden = true;
    }

    return true;
  }

  const lockerValue = String(lockerInput.value || "").trim();
  const hasLocker = Boolean(lockerValue);
  const errorMessage = "Please select a BOX NOW locker before continuing.";

  lockerInput.setCustomValidity(hasLocker ? "" : errorMessage);

  if (hasLocker) {
    lockerButton?.classList.remove("is-invalid");
    lockerButton?.removeAttribute("aria-invalid");

    if (lockerMessage) {
      lockerMessage.textContent = "";
      lockerMessage.hidden = true;
    }

    return true;
  }

  if (showError) {
    lockerButton?.classList.add("is-invalid");
    lockerButton?.setAttribute("aria-invalid", "true");

    if (lockerMessage) {
      lockerMessage.textContent = errorMessage;
      lockerMessage.hidden = false;
    }
  }

  return false;
}

function readAndValidateCheckoutForm(
  form: FormData,
  fallbackEmail = ""
) {
  const firstName =
    getRequiredFormString(
      form,
      "firstName",
      "First name"
    );

  const lastName =
    getRequiredFormString(
      form,
      "lastName",
      "Last name"
    );

  const email =
    String(
      form.get("email") || ""
    ).trim() ||
    fallbackEmail;

  const phoneCountryCode =
    getRequiredFormString(
      form,
      "phoneCountryCode",
      "Phone country"
    );

  const phoneNumber =
    getRequiredFormString(
      form,
      "phoneNumber",
      "Phone"
    );


  const phoneValidationMessage =
    getPhoneValidationMessage(
      phoneNumber,
      phoneCountryCode
    );

  if (phoneValidationMessage) {
    throw new Error(
      phoneValidationMessage
    );
  }


  if (!isValidEmail(email)) {
    throw new Error(
      "Enter a valid email address."
    );
  }


  const parsedPhone =
    parsePhoneNumberFromString(
      phoneNumber,
      phoneCountryCode as CountryCode
    );


  if (!parsedPhone) {
    throw new Error(
      "Enter a valid phone number."
    );
  }


  return {
    firstName,
    lastName,
    email,

    phone:
      parsedPhone.number,

    phoneCountryCode,
  };
}

function normalizeRoutePath(
  value: string | null | undefined,
  fallback = "/checkout"
): string {
  return (
    normalizeSameOriginPath(
      value,
      fallback
    ) ||
    fallback
  );
}

function restoreAfterAuth(): void {
  const flag = localStorage.getItem("skanare_returning_from_auth");

  if (flag === "1") {
    restoreCheckoutDraft();
    localStorage.removeItem("skanare_returning_from_auth");
  }
}


document.addEventListener("DOMContentLoaded", () => {
  restoreAfterAuth();
  restoreCheckoutDraft();

  const editCartButton =
  document.getElementById(
    "checkoutEditCart"
  ) as HTMLButtonElement | null;

editCartButton?.addEventListener(
  "click",
  () => {
    const cartButton =
      document.querySelector<HTMLElement>(
        "[data-cart-link], .cart-link"
      );

    cartButton?.click();
  }
);

  const checkoutForm = document.getElementById("checkoutForm") as HTMLFormElement | null;

  updateBillingDocumentFields();

  checkoutForm
    ?.querySelectorAll<HTMLInputElement>('input[name="documentType"]')
    .forEach((radio) => {
      radio.addEventListener("change", () => {
        updateBillingDocumentFields();
        saveCheckoutDraftFromPage();
      });
    });
  checkoutForm?.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
    if (target?.name === "phoneNumber" || target?.name === "postalCode") {
      keepDigitsOnly(target as HTMLInputElement);
    }
    updatePhoneValidity();
    updateLockerValidity();
    saveCheckoutDraftFromPage();

    if (target?.name === "personalNote") {
      const action =
        document.querySelector<HTMLElement>(
          ".checkout-gift-summary__action"
        );

      const tier =
        document.querySelector<HTMLInputElement>(
          'input[name="giftTier"]:checked'
        )?.value || "none";

      if (action) {
        action.textContent =
          tier === "none" ? "Add" : "Added";
      }
    }
  });
  checkoutForm?.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement | null;
    const option =
      target?.closest<HTMLElement>("[data-checkout-gift-tier]");

    if (!option) return;

    const input =
      option.querySelector<HTMLInputElement>(
        'input[name="giftTier"]'
      );

    option.dataset.wasChecked =
      input?.checked ? "true" : "false";
  });

  checkoutForm?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const option =
      target?.closest<HTMLElement>("[data-checkout-gift-tier]");

    if (!option) return;

    event.preventDefault();

    const input =
      option.querySelector<HTMLInputElement>(
        'input[name="giftTier"]'
      );

    if (!input) return;

    const wasChecked =
      option.dataset.wasChecked === "true";

    checkoutForm
      ?.querySelectorAll<HTMLInputElement>(
        'input[name="giftTier"]'
      )
      .forEach((radio) => {
        radio.checked = false;
      });

    if (!wasChecked) {
      input.checked = true;
    }

    saveCheckoutDraftFromPage();
    void render();
  });

  checkoutForm?.addEventListener("change", (event) => {
    const target =
      event.target as HTMLInputElement | HTMLTextAreaElement | null;

    updatePhoneValidity();
    updateLockerValidity();
    saveCheckoutDraftFromPage();

    if (
      target?.name === "giftTier" ||
      target?.name === "personalNote"
    ) {
      void render();
    }
  });
  updatePhoneValidity();
  updateLockerValidity();

  firebaseAuth.onAuthStateChanged(() => {
    setPayButtonState();
    void render();
  });

  window.addEventListener("skanare:cart-updated", () => {
    void render();
  });



  document.getElementById("applyDiscount")?.addEventListener("click", (e) => {
    e.preventDefault();

    const code = (
      document.getElementById("discountInput") as HTMLInputElement | null
    )?.value?.trim();

    if (code === "SKANARE10") {
      discount = 10;
      setFlashToast("10% discount applied ✅");
    } else {
      discount = 0;
      setFlashToast("Invalid code");
    }

    void render();
  });

  document
    .getElementById("checkoutForm")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();

      const formEl = e.target as HTMLFormElement;
      const user = firebaseAuth.currentUser;

      const lockerInput = document.getElementById("lockerInput") as HTMLInputElement | null;
      const lockerValue = String(lockerInput?.value || "").trim();

      if (user && !lockerValue) {
        updateLockerValidity(true);

        const lockerButton = document.getElementById(
          "selectLockerBtn"
        ) as HTMLButtonElement | null;

        lockerButton?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        window.setTimeout(() => {
          lockerButton?.focus({ preventScroll: true });
        }, 250);

        return;
      }

      if (lockerInput) {
        lockerInput.setCustomValidity("");
      }

      if (!formEl.reportValidity()) return;

      let formValues;
      try {
        formValues = readAndValidateCheckoutForm(new FormData(formEl));
      } catch (error) {
        setFlashToast(error instanceof Error ? error.message : "Invalid checkout details.");
        return;
      }

      
if (!user) {
  saveCheckoutDraft(e.target as HTMLFormElement);

  const email = formValues.email;
  const firstName = formValues.firstName;
  const lastName = formValues.lastName;

  if (!email) {
    setFlashToast("Email is required");
    return;
  }

  const redirectTarget =
    normalizeRoutePath(
      window.location.pathname,
      "/checkout"
    );

  const payload =
    new URLSearchParams({
      redirect:
        redirectTarget,
      email,
      firstName,
      lastName,
    });

  /*
   * Do not reveal whether the email already has an account.
   * Login keeps the prefilled email and exposes a Register link
   * carrying the same checkout context for new customers.
   */
  window.location.href =
    localizedPath(
      `/login?${payload}`,
      locale
    );

  return;
}

if (checkoutSubmitting) {
  return;
}

checkoutSubmitting = true;

const submitButton = document.querySelector<HTMLButtonElement>(
  "#checkoutForm button[type='submit']"
);

submitButton && (submitButton.disabled = true);
submitButton && (submitButton.textContent = "Preparing payment...");

      try {
        const me = await getMe();

        if (!me?.emailVerified) {
          saveCheckoutDraft(e.target as HTMLFormElement);

          setFlashToast("Please verify your email before checkout.");

          window.location.href =
            localizedPath(
              "/verify-email?redirect=" +
                encodeURIComponent(
                  normalizeRoutePath(
                    window.location.pathname,
                    "/checkout"
                  )
                ),
              locale
            );

          return;
        }

        const form = new FormData(formEl);
        const cart = await getCart();
        const items: CartItem[] = cart?.items || [];

        if (items.length === 0) {
          throw new Error("Your cart is empty.");
        }

        const {
  firstName,
  lastName,
  email,
  phone,
  phoneCountryCode,
} =
  readAndValidateCheckoutForm(
    form,
    user.email || ""
  );

const delivery = "boxnow" as const;

const {
  documentType,
  invoiceDetails,
} = readInvoiceDetails(form);

let locker =
  String(
    form.get("locker") || ""
  ).trim();

if (!locker) {
  updateLockerValidity(true);
  return;
}

updateLockerValidity(false);
        const result = await checkout({
  locale,
  customer: {
    firstName,
    lastName,
    email,
    phone,
  },

  shippingAddress: {
    firstName,
    lastName,
    email,
    phone,
    country: "Greece",
    city: "",
    postalCode: "",
    addressLine1: "",
    addressLine2: "",
  },

  delivery,
  locker,
  phoneCountryCode,
  notes: "",
  giftOptions: {
    tier:
      String(form.get("giftTier") || "none") as
        | "none"
        | "simple"
        | "premium",
    giftBox:
      String(form.get("giftTier") || "none") === "premium",
    personalNote:
      String(form.get("giftTier") || "none") === "premium"
        ? String(
            form.get("personalNote") || ""
          ).trim()
        : "",
  },
  documentType,
  invoiceDetails,
});

        if (result.checkoutUrl) {
  saveCheckoutDraft(formEl);

  window.location.href =
    result.checkoutUrl;

  return;
}

        setFlashToast("Order created, but payment URL was not returned.");
      } catch (error) {
        console.error("Checkout failed:", error);
        setFlashToast(error instanceof Error ? error.message : "Checkout failed.");
      } finally {
        checkoutSubmitting = false;
        submitButton && (submitButton.disabled = false);
        setPayButtonState();
      }
    });
});
