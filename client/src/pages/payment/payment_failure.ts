import "../../i18n/auto";
import { locale, localizedPath } from "../../i18n/locale";
const CHECKOUT_DRAFT_KEY = "skanare_checkout_draft";

const CHECKOUT_URL = localizedPath("/checkout", locale);

document.addEventListener("DOMContentLoaded", () => {
  const checkoutButton =
    document.querySelector<HTMLAnchorElement>(
      ".payment-result__button"
    );

  const hasCheckoutDraft =
    Boolean(
      localStorage.getItem(
        CHECKOUT_DRAFT_KEY
      )
    );

  console.log(
    "Returning from failed payment. Checkout draft:",
    hasCheckoutDraft
      ? "available"
      : "not found"
  );

  checkoutButton?.addEventListener(
    "click",
    (event) => {
      event.preventDefault();

      /*
       * IMPORTANT:
       * Do not delete the checkout draft.
       * checkout.ts will restore it.
       */

      window.location.href =
        CHECKOUT_URL;
    }
  );

  /*
   * Mobile menu
   */
  const menuToggle =
    document.getElementById(
      "menuToggle"
    ) as HTMLButtonElement | null;

  const mainNav =
    document.getElementById(
      "mainNav"
    );

  menuToggle?.addEventListener(
    "click",
    () => {
      const expanded =
        menuToggle.getAttribute(
          "aria-expanded"
        ) === "true";

      menuToggle.setAttribute(
        "aria-expanded",
        String(!expanded)
      );

      mainNav?.classList.toggle(
        "is-open",
        !expanded
      );
    }
  );
});