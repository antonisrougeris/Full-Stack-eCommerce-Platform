import "../../i18n/auto";
/* 3220089_3220172 2025 */

import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";

import { initNav } from "../../components/initNav";
import { initMobileMenu } from "../../components/menu";
import { updateCartBadge } from "../../utils/cart-badge";
import { initPasswordVisibility } from "../../utils/password-visibility";
import { firebaseAuth } from "../../services/firebase";
import { login, register } from "../../services/api";


import { showFlashToast } from "../../utils/toast.ts";
import { normalizeSameOriginPath } from "../../utils/redirect";
import {
  locale,
  localizedPath,
} from "../../i18n/locale";

initPasswordVisibility();

const form = document.getElementById("loginForm") as HTMLFormElement | null;
const statusEl = document.getElementById("status");
const googleBtn = document.querySelector<HTMLButtonElement>(".auth-google");

const registerLink = document.getElementById(
  "registerLink"
) as HTMLAnchorElement | null;

const forgotPasswordLink = document.getElementById(
  "forgotPasswordLink"
) as HTMLAnchorElement | null;

function buildAuthQuery(params: Record<string, string | undefined>): string {
  const urlParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value && value.trim()) {
      urlParams.set(key, value.trim());
    }
  });

  const query = urlParams.toString();
  return query ? `?${query}` : "";
}

document.addEventListener("DOMContentLoaded", () => {
  showFlashToast();

  applyPrefill();
  applyForgotPasswordLink();

  const emailInput =
    form?.querySelector<HTMLInputElement>(
      'input[name="email"]'
    );

  emailInput?.addEventListener(
    "input",
    applyForgotPasswordLink
  );
});


function applyForgotPasswordLink(): void {
  if (!forgotPasswordLink) return;

  const emailInput = form?.querySelector<HTMLInputElement>(
    'input[name="email"]'
  );

  const email = emailInput?.value.trim() || "";

  const params = new URLSearchParams();

  if (email) {
    params.set("email", email);
  }

  const redirect = getRedirectUrl();

  if (redirect && redirect !== "/") {
    params.set("redirect", redirect);
  }

  const query = params.toString();

  forgotPasswordLink.href =
    localizedPath(
      "/forgot-password" +
        (query ? `?${query}` : ""),
      locale
    );
}

function getRedirectUrl(): string {
  const redirect = normalizeSameOriginPath(
    new URLSearchParams(window.location.search).get("redirect")
  );

  return redirect || "/";
}

function applyRegisterRedirect(): void {
  if (!registerLink) return;

  const params = new URLSearchParams(window.location.search);
  const redirect = getRedirectUrl();
  const email = params.get("email")?.trim() || "";
  const firstName = params.get("firstName")?.trim() || "";
  const lastName = params.get("lastName")?.trim() || "";

  const query = buildAuthQuery({
    redirect,
    email,
    firstName,
    lastName,
  });

  registerLink.href = localizedPath(
    `/register${query}`,
    locale
  );
}

function goToRedirect(delay = 800): void {
  setTimeout(() => {
    const redirect = getRedirectUrl();

    // 🔥 optional safety: restore checkout flag
    localStorage.setItem("skanare_returning_from_auth", "1");

    window.location.href = localizedPath(
      redirect,
      locale
    );
  }, delay);
}

function applyPrefill() {
  const email = new URLSearchParams(
    window.location.search
  ).get("email");

  if (!email || !form) return;

  const emailInput =
    form.querySelector<HTMLInputElement>(
      'input[name="email"]'
    );

  if (emailInput) {
    emailInput.value = email;
  }
}

initNav();
initMobileMenu();
void updateCartBadge();
applyRegisterRedirect();

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (statusEl) statusEl.textContent = "Logging in...";

    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    try {
      // 1. Firebase Auth login
      const credentials = await signInWithEmailAndPassword(
        firebaseAuth,
        email,
        password
      );

      const token = await credentials.user.getIdToken();

      // 2. Backend login (Firestore user fetch)
      const res = await login({
        email,
        idToken: token,
      });

      const user = res?.user;

      if (!user) {
        throw new Error("User not returned from server");
      }

      // 3. Firestore verification check (SOURCE OF TRUTH)
      if (!user.emailVerified) {
        await firebaseAuth.signOut();

        if (statusEl) {
          statusEl.textContent = "Please verify your email before continuing.";
        }
        return;
      }

      if (statusEl) statusEl.textContent = "Login successful! Redirecting...";

      goToRedirect();
    } catch (err: any) {
      console.error("Login error:", err);

      if (statusEl) {
        statusEl.textContent = err?.message || "Login failed";
      }
    }
  });
}

googleBtn?.addEventListener("click", async () => {
  try {
    if (statusEl) statusEl.textContent = "Signing in with Google...";

    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(firebaseAuth, provider);

    const token = await result.user.getIdToken();

    await register({
      firstName: result.user.displayName?.split(" ")[0] || "",
      lastName: result.user.displayName?.split(" ").slice(1).join(" ") || "",
      email: result.user.email || "",
      idToken: token,
      emailVerified: true,
    });

    if (statusEl) statusEl.textContent = "Login successful! Redirecting...";

    goToRedirect();
  } catch (err: any) {
    console.error("Google login error:", err);
    if (statusEl) {
      statusEl.textContent = err?.message || "Google sign-in failed";
    }
  }
});