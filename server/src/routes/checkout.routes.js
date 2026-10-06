import { Router } from "express";
import {
  requireAuth,
  requireVerifiedEmail,
} from "../middleware/auth.js";
import { checkout } from "../controllers/checkout.controller.js";

const router = Router();

router.post(
  "/",
  requireAuth,
  requireVerifiedEmail,
  checkout
);

export default router;
