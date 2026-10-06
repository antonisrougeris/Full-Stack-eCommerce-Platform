import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";
import {
  sendVerificationOtp,
  verifyEmailOtp,
} from "../services/verification.service.js";

export const sendEmailVerificationOtp = asyncHandler(async (req, res) => {
  const uid = req.user?.uid;
  const email = req.user?.email;

  const result = await sendVerificationOtp({ uid, email });

  return ok(res, {
    message: "Verification code sent",
    ...result,
  });
});

export const verifyEmailCode = asyncHandler(async (req, res) => {
  const uid = req.user?.uid;
  const otp = String(req.body?.otp || "").trim();

  const result = await verifyEmailOtp({ uid, otp });

  return ok(res, {
    message: "Email verified successfully",
    ...result,
  });
});