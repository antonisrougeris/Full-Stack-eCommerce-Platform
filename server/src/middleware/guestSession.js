import crypto from "crypto";
import { ApiError } from "../utils/apiError.js";

const COOKIE_NAME = "guest_session";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

function getSecret() {
  const secret = process.env.GUEST_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("GUEST_SESSION_SECRET must be at least 32 characters");
  }
  return secret;
}

function sign(value) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(value)
    .digest("base64url");
}

function encodeGuestSession(guestId) {
  const payload = Buffer.from(
    JSON.stringify({ guestId, iat: Date.now() })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeGuestSession(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);

  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return null;
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!parsed?.guestId || Date.now() - Number(parsed.iat || 0) > MAX_AGE_MS)
    return null;
  return parsed.guestId;
}

export function createGuestId() {
  return `guest_${crypto.randomBytes(24).toString("base64url")}`;
}

export function setGuestCookie(res, guestId) {
  const isProduction = process.env.NODE_ENV === "production";
  const secureCookie =
    isProduction || String(process.env.COOKIE_SECURE || "").toLowerCase() === "true";

  res.cookie(COOKIE_NAME, encodeGuestSession(guestId), {
    httpOnly: true,
    sameSite: isProduction ? "lax" : "lax",
    secure: secureCookie,
    maxAge: MAX_AGE_MS,
    path: "/",
  });
}

export function attachGuestSession(req, _res, next) {
  try {
    const guestId = decodeGuestSession(req.cookies?.[COOKIE_NAME]);
    if (guestId) req.guestId = guestId;
    return next();
  } catch {
    return next(new ApiError(401, "Invalid guest session"));
  }
}

export function requireGuestOrUser(req, _res, next) {
  if (req.user?.uid || req.guestId) return next();
  return next(new ApiError(401, "Missing authenticated user or guest session"));
}
