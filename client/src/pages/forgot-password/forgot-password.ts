import "../../i18n/auto";
import { locale, localizedPath } from "../../i18n/locale";
/* 3220089_3220172 2025 */

import { initNav } from "../../components/initNav";
import { initMobileMenu } from "../../components/menu";
import { updateCartBadge } from "../../utils/cart-badge";
import { initPasswordVisibility } from "../../utils/password-visibility";
import { requestPasswordReset, resetPassword } from "../../services/api";
import { normalizeSameOriginPath } from "../../utils/redirect";

initPasswordVisibility();

const requestStep = document.getElementById("requestStep");
const resetStep = document.getElementById("resetStep");

const requestForm = document.getElementById("requestForm") as HTMLFormElement | null;
const requestStatus = document.getElementById("requestStatus");

const resetForm = document.getElementById("resetForm") as HTMLFormElement | null;
const resetStatus = document.getElementById("resetStatus");
const targetEmailEl = document.getElementById("targetEmail");
const forgotEmailInput =
  document.getElementById(
    "forgotEmail"
  ) as HTMLInputElement | null;

const backToLoginLink =
  document.getElementById(
    "backToLoginLink"
  ) as HTMLAnchorElement | null;

const resendBtn = document.getElementById("resendCode") as HTMLButtonElement | null;

const otpInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>(".otp-input")
);
const otpHidden = document.getElementById("otpValue") as HTMLInputElement | null;

let currentEmail = "";

function getRedirectUrl(): string | null {
  const redirect = normalizeSameOriginPath(
    new URLSearchParams(window.location.search).get("redirect")
  );

  return redirect || null;
}

function applyForgotPasswordContext(): void {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const email =
    params.get("email")?.trim() || "";

  if (email) {
    currentEmail = email;

    if (forgotEmailInput) {
      forgotEmailInput.value = email;
    }
  }

  updateBackToLoginLink();
}

function updateBackToLoginLink(): void {
  if (!backToLoginLink) return;

  const params =
    new URLSearchParams();

  const email =
    forgotEmailInput?.value.trim() ||
    currentEmail;

  if (email) {
    params.set("email", email);
  }

  const redirect =
    getRedirectUrl();

  if (redirect) {
    params.set(
      "redirect",
      redirect
    );
  }

  const query =
    params.toString();

  backToLoginLink.href = localizedPath(
    "/login" + (query ? `?${query}` : ""),
    locale
  );
}

initNav();
initMobileMenu();
void updateCartBadge();

applyForgotPasswordContext();

forgotEmailInput?.addEventListener(
  "input",
  () => {
    currentEmail =
      forgotEmailInput.value.trim();

    updateBackToLoginLink();
  }
);

/* =========================
   OTP INPUT HANDLING
========================= */

function syncOtpValue(): string {
  const otp = otpInputs.map((input) => input.value).join("");

  if (otpHidden) {
    otpHidden.value = otp;
  }

  return otp;
}

otpInputs.forEach((input, index) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 1);

    if (input.value && otpInputs[index + 1]) {
      otpInputs[index + 1].focus();
    }

    syncOtpValue();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Backspace" && !input.value && otpInputs[index - 1]) {
      otpInputs[index - 1].focus();
    }
  });

  input.addEventListener("paste", (event) => {
    event.preventDefault();

    const pasted =
      event.clipboardData?.getData("text").replace(/\D/g, "").slice(0, 6) || "";

    pasted.split("").forEach((char, i) => {
      if (otpInputs[i]) {
        otpInputs[i].value = char;
      }
    });

    syncOtpValue();

    const focusIndex = Math.min(Math.max(pasted.length - 1, 0), 5);
    otpInputs[focusIndex]?.focus();
  });
});

/* =========================
   STEP 1: REQUEST CODE
========================= */

requestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(requestForm);
  const email = String(formData.get("email") || "").trim();

  if (!email) return;

  const submitBtn = requestForm.querySelector<HTMLButtonElement>(
    'button[type="submit"]'
  );

  try {
    if (submitBtn) submitBtn.disabled = true;
    if (requestStatus) requestStatus.textContent = "Sending code...";

    await requestPasswordReset(email);

    currentEmail = email;
    updateBackToLoginLink();
    if (targetEmailEl) targetEmailEl.textContent = email;

    requestStep?.classList.add("hidden");
    resetStep?.classList.remove("hidden");
    if (resetStatus) resetStatus.textContent = "";

    otpInputs[0]?.focus();
  } catch (err: any) {
    console.error("Request password reset failed:", err);

    // ✅ ουδέτερο μήνυμα ώστε να μην αποκαλύπτεται αν το email υπάρχει
    if (requestStatus) {
      requestStatus.textContent =
        "If an account exists for this email, a code has been sent.";
    }

    currentEmail = email;
    updateBackToLoginLink();
    if (targetEmailEl) targetEmailEl.textContent = email;

    requestStep?.classList.add("hidden");
    resetStep?.classList.remove("hidden");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

/* =========================
   STEP 2: RESET PASSWORD
========================= */

resetForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const otp = syncOtpValue();

  if (otp.length !== 6) {
    if (resetStatus) resetStatus.textContent = "Please enter the 6-digit code.";
    return;
  }

  const formData = new FormData(resetForm);
  const newPassword = String(formData.get("newPassword") || "");

  if (newPassword.length < 8) {
    if (resetStatus) {
      resetStatus.textContent = "Password must be at least 8 characters.";
    }
    return;
  }

  const submitBtn = resetForm.querySelector<HTMLButtonElement>(
    'button[type="submit"]'
  );

  try {
    if (submitBtn) submitBtn.disabled = true;
    if (resetStatus) resetStatus.textContent = "Resetting password...";

    await resetPassword({
      email: currentEmail,
      code: otp,
      newPassword,
    });

    if (resetStatus) {
      resetStatus.textContent = "Password reset! Redirecting to sign in...";
    }

    setTimeout(() => {
  const params =
    new URLSearchParams();

  params.set(
    "email",
    currentEmail
  );

  const redirect =
    getRedirectUrl();

  if (redirect) {
    params.set(
      "redirect",
      redirect
    );
  }

  window.location.href = localizedPath(
    "/login?" + params.toString(),
    locale
  );
}, 1200);

  } catch (err: any) {
    console.error("Reset password failed:", err);

    if (resetStatus) {
      resetStatus.textContent = err?.message || "Invalid or expired code.";
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

/* =========================
   RESEND CODE
========================= */

resendBtn?.addEventListener("click", async () => {
  if (!currentEmail) return;

  try {
    resendBtn.disabled = true;
    if (resetStatus) resetStatus.textContent = "Sending new code...";

    await requestPasswordReset(currentEmail);

    if (resetStatus) resetStatus.textContent = "New code sent. Check your email.";
  } catch (err: any) {
    console.error("Resend code failed:", err);

    if (resetStatus) {
      resetStatus.textContent = err?.message || "Could not resend code.";
    }
  } finally {
    setTimeout(() => {
      resendBtn.disabled = false;
    }, 30000);
  }
});