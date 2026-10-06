import crypto from "crypto";
import { ApiError } from "../utils/apiError.js";
import { getAllowedOrigins } from "../config/security.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TOKEN_COOKIE = "csrf_token";

function secureCookie() {
  return process.env.NODE_ENV === "production";
}

function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function sameToken(left, right) {
  if (!left || !right) return false;

  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function trustedOrigin(req) {
  const origin = String(req.get("origin") || "");
  if (!origin) return false;

  let normalizedOrigin;

  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }

  return getAllowedOrigins().includes(normalizedOrigin);
}

export function csrfProtection(req, res, next) {
  let token = req.cookies?.[TOKEN_COOKIE];

  if (!token) {
    token = newToken();

    res.cookie(TOKEN_COOKIE, token, {
      httpOnly: false,
      secure: secureCookie(),
      sameSite: "lax",
      path: "/",
    });
  }

  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  /*
   * Bearer-authenticated API requests are not authenticated by ambient
   * browser cookies, so they are not susceptible to classic CSRF.
   */
  if (String(req.get("authorization") || "").startsWith("Bearer ")) {
    return next();
  }

  /*
   * Third-party provider webhooks authenticate independently and do not
   * originate from the storefront browser.
   */
  if (
    req.path.startsWith("/viva") ||
    req.path.startsWith("/boxnow")
  ) {
    return next();
  }

  if (!trustedOrigin(req)) {
    return next(new ApiError(403, "Invalid request origin"));
  }

  const headerToken = req.get("x-csrf-token");

  if (!sameToken(token, headerToken)) {
    return next(new ApiError(403, "Invalid CSRF token"));
  }

  return next();
}
