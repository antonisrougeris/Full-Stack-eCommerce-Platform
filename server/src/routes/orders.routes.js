import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getOrder,
  listOrders,
  getOrderByVivaCode,
} from "../controllers/orders.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", listOrders);
router.get("/viva/:vivaOrderCode", getOrderByVivaCode);
router.get("/:orderId", getOrder);

export default router;
