import { Router } from "express";
import {
  handleResendWebhook,
} from "../controllers/resend.controller.js";

const router = Router();

router.post("/webhook", handleResendWebhook);

export default router;
