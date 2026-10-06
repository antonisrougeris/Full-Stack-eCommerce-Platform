import { Router } from "express";
import {
  healthController,
  livenessController,
  readinessController,
} from "../controllers/health.controller.js";

const router = Router();

router.get("/", healthController);
router.get("/live", livenessController);
router.get("/ready", readinessController);

export default router;
