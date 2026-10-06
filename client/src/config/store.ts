export const STORE_NAME =
  import.meta.env.VITE_STORE_NAME || "NovaStore";

export const STORE_TAGLINE =
  import.meta.env.VITE_STORE_TAGLINE ||
  "Modern essentials for everyday life.";

export const STORE_URL =
  (import.meta.env.VITE_STORE_URL || window.location.origin).replace(/\/$/, "");

export const STORE_SUPPORT_EMAIL =
  import.meta.env.VITE_STORE_SUPPORT_EMAIL || "support@example.com";
