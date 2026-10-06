import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  cancelMyReturn,
  createReturn,
  downloadMyReturnLabel,
  getReturnEligibility,
  listMyReturns,
} from "../controllers/returns.controller.js";

const router = Router();

router.use(requireAuth);
router.get("/eligibility", getReturnEligibility);
router.get("/", listMyReturns);
router.post("/", createReturn);
router.post("/:returnId/cancel", cancelMyReturn);
router.get("/:returnId/label", downloadMyReturnLabel);

export default router;
