import { Router } from "express";
import {
  verifyVivaWebhook,
  handleVivaWebhook,
} from "../controllers/viva.controller.js";

const router = Router();

router.get("/webhook", verifyVivaWebhook);
router.post("/webhook", handleVivaWebhook);

export default router;
