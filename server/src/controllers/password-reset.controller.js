import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";
import {
  requestPasswordResetOtp,
  resetPasswordWithOtp,
} from "../services/password-reset.service.js";

export const forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();

  const result = await requestPasswordResetOtp({ email });

  // ✅ πάντα το ίδιο ουδέτερο μήνυμα, ό,τι κι αν συνέβη
  return ok(res, {
    message: "If an account exists for this email, a code has been sent.",
    ...result,
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const otp = String(req.body?.code || "").trim();
  const newPassword = String(req.body?.newPassword || "");

  const result = await resetPasswordWithOtp({ email, otp, newPassword });

  return ok(res, {
    message: "Password reset successfully",
    ...result,
  });
});