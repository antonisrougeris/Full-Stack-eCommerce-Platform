import crypto from "crypto";
import { getDB, getAuthService } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { nowIso } from "../utils/ids.js";
import { sendEmail } from "./email.service.js";
import { otpEmailTemplate } from "./email-template.service.js";

const COLLECTION = "passwordResets";
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function createOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export async function requestPasswordResetOtp({ email }) {
  if (!email) throw new ApiError(400, "Missing email");

  const auth = getAuthService();
  const db = getDB();

  let userRecord;

  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (err) {
    if (err?.code === "auth/user-not-found") {
      // ✅ δεν αποκαλύπτουμε ότι το email δεν υπάρχει (user enumeration protection)
      return { sent: true };
    }
    throw err;
  }

  const otp = createOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  await db.collection(COLLECTION).doc(userRecord.uid).set({
    uid: userRecord.uid,
    email,
    otpHash: hashOtp(otp),
    expiresAt,
    attempts: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  await sendEmail({
    to: email,
    subject: "Reset your Skanare password",
    html: otpEmailTemplate({
      title: "Reset your Skanare password",
      intro: "Use the code below to reset your password.",
      code: otp,
      expiresMinutes: 10,
      warning: "If you did not request a password reset, you can ignore this email.",
    }),
  });

  return { sent: true };
}

export async function resetPasswordWithOtp({ email, otp, newPassword }) {
  if (!email || !otp || !newPassword) {
    throw new ApiError(400, "Missing reset data");
  }

  if (newPassword.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters");
  }

  const auth = getAuthService();
  const db = getDB();

  let userRecord;

  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (err) {
    if (err?.code === "auth/user-not-found") {
      throw new ApiError(400, "Invalid or expired code");
    }
    throw err;
  }

  const ref = db.collection(COLLECTION).doc(userRecord.uid);
  const snap = await ref.get();

  if (!snap.exists) throw new ApiError(400, "Invalid or expired code");

  const data = snap.data();

  if (new Date(data.expiresAt).getTime() < Date.now()) {
    await ref.delete();
    throw new ApiError(400, "Code expired");
  }

  if (Number(data.attempts || 0) >= MAX_ATTEMPTS) {
    throw new ApiError(429, "Too many attempts, please request a new code");
  }

  if (data.otpHash !== hashOtp(String(otp))) {
    await ref.set(
      { attempts: Number(data.attempts || 0) + 1, updatedAt: nowIso() },
      { merge: true }
    );
    throw new ApiError(400, "Invalid or expired code");
  }

  // ✅ Firebase Admin SDK: αλλάζει το password στο Firebase Auth
  await auth.updateUser(userRecord.uid, { password: newPassword });

  await db.collection(COLLECTIONS.USERS).doc(userRecord.uid).set(
    { updatedAt: nowIso() },
    { merge: true }
  );

  await ref.delete();

  return { reset: true };
}