/* 3220089_3220172 */


import { firebaseAuth } from "./firebase";
import type { ProductVariant } from "./products";
import { addCartItem } from "./cart";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://cldrq5-4000.csb.app/api";

export interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
}

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

async function buildHeaders(init?: HeadersInit): Promise<Headers> {
  const headers = new Headers(init || {});

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const csrfToken = readCookie("csrf_token");

  if (csrfToken && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;

  if (user) {
    const freshToken = await user.getIdToken();
    headers.set("Authorization", `Bearer ${freshToken}`);
  }

  return headers;
}
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: await buildHeaders(options.headers),
  });

  if (response.status === 204) {
    return null as T;
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      `Request failed (${response.status})`;

    throw new Error(message);
  }

  return payload as T;
}

export const apiFetch = apiRequest;

/* =========================================================
   AUTH TYPES
========================================================= */

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  idToken: string;
  emailVerified?: boolean;
}

export interface LoginPayload {
  email: string;
  idToken: string;
}

export interface AuthUser {
  id?: string;
  uid?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  createdAt?: string;
  updatedAt?: string;
  emailVerified?: boolean;
emailVerifiedAt?: string;
}

export interface AuthResponse {
  success?: boolean;
  message?: string;
  token?: string;
  user?: AuthUser;
  data?: AuthUser;
}

export async function register(
  payload: RegisterPayload
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getMe(): Promise<AuthUser | null> {
  const response = await apiRequest<
    | AuthUser
    | {
        success?: boolean;
        user?: AuthUser;
        data?: AuthUser;
      }
  >("/auth/me");

  if (!response) return null;

  if ("email" in response) {
    return response as AuthUser;
  }

  return response.user || response.data || null;
}

export async function sendVerificationCode(): Promise<void> {
  await apiRequest("/auth/send-verification", {
    method: "POST",
  });
}

export async function verifyEmailCode(otp: string): Promise<void> {
  await apiRequest("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ otp }),
  });
}

export interface AddToCartInput {
  productId: string;
  quantity?: number;
  variant?: ProductVariant | null;
  qrDestination?: string;
}

export async function addToCart(payload: AddToCartInput) {
  return addCartItem(payload);
}


/* =========================================================
   PASSWORD RESET
========================================================= */

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  email: string;
  code: string;
  newPassword: string;
}

export async function requestPasswordReset(
  email: string
): Promise<{ success?: boolean; message?: string }> {
  return apiRequest("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  payload: ResetPasswordPayload
): Promise<{ success?: boolean; message?: string }> {
  return apiRequest("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}