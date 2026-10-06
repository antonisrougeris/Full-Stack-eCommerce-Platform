import "../../i18n/auto";
import { locale, localizedPath } from "../../i18n/locale";
/* 3220089_3220172  2025 */

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";

import { initNav } from "../../components/initNav";
import { initMobileMenu } from "../../components/menu";
import { updateCartBadge } from "../../utils/cart-badge";
import { initPasswordVisibility } from "../../utils/password-visibility";
import { firebaseAuth } from "../../services/firebase";
import { register, sendVerificationCode } from "../../services/api";
import { normalizeSameOriginPath } from "../../utils/redirect";

initPasswordVisibility();

initNav();
void updateCartBadge();
initMobileMenu();
document.addEventListener("DOMContentLoaded", () => {
  applyPrefill();
  applyLoginRedirect();
});

const form = document.getElementById("registerForm") as HTMLFormElement | null;
const statusEl = document.getElementById("status");
const googleBtn = document.querySelector<HTMLButtonElement>(".auth-google");
const loginLink = document.getElementById(
  "loginLink"
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

function getRedirectUrl(): string {
  const redirect = normalizeSameOriginPath(
    new URLSearchParams(window.location.search).get("redirect")
  );

  return redirect || "/";
}

function applyLoginRedirect(): void {
  if (!loginLink) return;

  const params = new URLSearchParams(window.location.search);
  const redirect = getRedirectUrl();
  const email = params.get("email")?.trim() || "";
  const firstName = params.get("firstName")?.trim() || "";
  const lastName = params.get("lastName")?.trim() || "";

  loginLink.href = localizedPath(`/login${buildAuthQuery({
    redirect,
    email,
    firstName,
    lastName,
  })}`, locale);
}

function goToRedirect(delay = 800): void {
  setTimeout(() => {
    window.location.href = localizedPath(
      getRedirectUrl(),
      locale
    );
  }, delay);
}

function applyPrefill(): void {
  const params = new URLSearchParams(window.location.search);

  if (!form) return;

  const firstName = params.get("firstName");
  const lastName = params.get("lastName");
  const email = params.get("email");

  const fn = form.querySelector<HTMLInputElement>('input[name="firstName"]');
  const ln = form.querySelector<HTMLInputElement>('input[name="lastName"]');
  const em = form.querySelector<HTMLInputElement>('input[name="email"]');

  if (fn && firstName) fn.value = firstName;
  if (ln && lastName) ln.value = lastName;
  if (em && email) em.value = email;
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (statusEl) statusEl.textContent = "";

  const formData = new FormData(form);

  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (statusEl) statusEl.textContent = "Registering...";

try {
  const credentials = await createUserWithEmailAndPassword(
    firebaseAuth,
    email,
    password
  );

  const token = await credentials.user.getIdToken();

  await register({
    firstName,
    lastName,
    email,
    password,
    idToken: token,
  });

  await sendVerificationCode();

  if (statusEl) {
    statusEl.textContent =
      "Registration successful. Please check your email to verify your account.";
  }

  window.location.href = localizedPath(
    "/verify-email?redirect=" + encodeURIComponent(getRedirectUrl()),
    locale
  );

  return;
} catch (err: any) {
  console.error("Register error:", err);

  if (statusEl) {
    statusEl.textContent = err.message || "Registration failed";
  }
}}

);

googleBtn?.addEventListener("click", async () => {
  try {
    if (statusEl) statusEl.textContent = "Signing up with Google...";

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

    if (statusEl) {
      statusEl.textContent = "Registration successful! Redirecting...";
    }

    goToRedirect();
  } catch (err: any) {
    console.error("Google register error:", err);

    if (statusEl) {
      statusEl.textContent = err?.message || "Google sign-up failed";
    }
  }
});