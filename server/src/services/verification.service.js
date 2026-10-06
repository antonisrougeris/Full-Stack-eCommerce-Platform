import crypto from "crypto";
import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { nowIso } from "../utils/ids.js";
import { sendEmail } from "./email.service.js";
import { otpEmailTemplate } from "./email-template.service.js";

const COLLECTION = "emailVerifications";
const OTP_TTL_MS = 10 * 60 * 1000;

function createOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export async function sendVerificationOtp({ uid, email }) {
  if (!uid || !email) throw new ApiError(400, "Missing verification user");

  const db = getDB();
  const otp = createOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  await db.collection(COLLECTION).doc(uid).set({
    uid,
    email,
    otpHash: hashOtp(otp),
    expiresAt,
    attempts: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  await sendEmail({
    to: email,
    subject: "Your Skanare verification code",
    html: otpEmailTemplate({
      title: "Verify your Skanare account",
      intro: "Use the verification code below to confirm your email address.",
      code: otp,
      expiresMinutes: 10,
      warning: "If you did not create this account, you can ignore this email.",
    }),
  });

  return { sent: true };
}

export async function verifyEmailOtp({ uid, otp }) {
  if (!uid || !otp) throw new ApiError(400, "Missing verification data");

  const db = getDB();
  const ref = db.collection(COLLECTION).doc(uid);
  const snap = await ref.get();

  if (!snap.exists) throw new ApiError(400, "Verification code not found");

  const data = snap.data();

  if (new Date(data.expiresAt).getTime() < Date.now()) {
    throw new ApiError(400, "Verification code expired");
  }

  if (Number(data.attempts || 0) >= 5) {
    throw new ApiError(429, "Too many verification attempts");
  }

  if (data.otpHash !== hashOtp(String(otp))) {
    await ref.set(
      { attempts: Number(data.attempts || 0) + 1, updatedAt: nowIso() },
      { merge: true }
    );
    throw new ApiError(400, "Invalid verification code");
  }

  await getDB().collection(COLLECTIONS.USERS).doc(uid).set(
    {
      emailVerified: true,
      emailVerifiedAt: nowIso(),
      updatedAt: nowIso(),
    },
    { merge: true }
  );

  await ref.delete();

  return { verified: true };
}