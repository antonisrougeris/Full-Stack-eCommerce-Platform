import "../../i18n/auto";
import { locale, localizedPath } from "../../i18n/locale";
import { firebaseAuth } from "../../services/firebase";
import {
  sendVerificationCode,
  verifyEmailCode,
} from "../../services/api";

import { showFlashToast } from "../../utils/toast.ts";

import { apiRequest } from "../../services/api";
import { normalizeSameOriginPath } from "../../utils/redirect";

const form = document.getElementById("verifyEmailForm") as HTMLFormElement | null;
const statusEl = document.getElementById("status");
const resendBtn = document.getElementById("resendCode") as HTMLButtonElement | null;

const otpInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>(".otp-input")
);

const otpHidden = document.getElementById("otpValue") as HTMLInputElement | null;

document.addEventListener("DOMContentLoaded", () => {
  showFlashToast();
});


function getRedirectUrl(): string {
  const redirect = normalizeSameOriginPath(
    new URLSearchParams(window.location.search).get("redirect")
  );

  return redirect || "/";
}

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

    const pasted = event.clipboardData
      ?.getData("text")
      .replace(/\D/g, "")
      .slice(0, 6) || "";

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

firebaseAuth.onAuthStateChanged((user) => {
  if (!user) {
    const redirectTarget = normalizeSameOriginPath(window.location.pathname + window.location.search) || "/";
    window.location.href = localizedPath(
      "/login?redirect=" + encodeURIComponent(redirectTarget),
      locale
    );
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const otp = syncOtpValue();

  if (otp.length !== 6) {
    if (statusEl) statusEl.textContent = "Please enter the 6-digit code.";
    return;
  }

  try {
    if (statusEl) statusEl.textContent = "Verifying...";

    await verifyEmailCode(otp);

    try {
  await apiRequest("/cart/merge-guest", {
    method: "POST",
  });
} catch (mergeError) {
  console.warn("Guest cart merge after verification failed:", mergeError);
}

    if (statusEl) statusEl.textContent = "Email verified. Redirecting...";

    setTimeout(() => {
      window.location.href = localizedPath(
        getRedirectUrl(),
        locale
      );
    }, 800);
  } catch (err: any) {
    console.error("Verify email failed:", err);

    if (statusEl) {
      statusEl.textContent = err?.message || "Invalid code.";
    }
  }
});

resendBtn?.addEventListener("click", async () => {
  try {
    resendBtn.disabled = true;

    if (statusEl) statusEl.textContent = "Sending new code...";

    await sendVerificationCode();

    if (statusEl) statusEl.textContent = "New code sent. Check your email.";
  } catch (err: any) {
    console.error("Resend code failed:", err);

    if (statusEl) {
      statusEl.textContent = err?.message || "Could not resend code.";
    }
  } finally {
    setTimeout(() => {
      resendBtn.disabled = false;
    }, 30000);
  }
});