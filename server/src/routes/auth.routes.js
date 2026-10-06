import express from "express";
import { register, login, me } from "../controllers/auth.controller.js";
import {
  sendEmailVerificationOtp,
  verifyEmailCode,
} from "../controllers/verification.controller.js";
import {
  forgotPassword,
  resetPassword,
} from "../controllers/password-reset.controller.js"; // ✅ ΝΕΟ
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, me);

router.post("/send-verification", requireAuth, sendEmailVerificationOtp);
router.post("/verify-email", requireAuth, verifyEmailCode);


// ✅ ΝΕΟ — χωρίς requireAuth, γιατί ο χρήστης δεν είναι συνδεδεμένος
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;