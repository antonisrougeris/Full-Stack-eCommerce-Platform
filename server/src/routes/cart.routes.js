import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  addToCart,
  deleteCartItem,
  getCart,
  patchCartItem,
  patchCartGiftOptions,
  transferCartToGuest,
} from "../controllers/cart.controller.js";

import { optionalAuth } from "../middleware/auth.js";


const router = Router();

router.use(optionalAuth);
router.get("/", getCart);
router.post("/items", addToCart);
router.post("/transfer-to-guest", requireAuth, transferCartToGuest);
router.patch("/gift-options", patchCartGiftOptions);
router.patch("/items/:itemId", patchCartItem);
router.delete("/items/:itemId", deleteCartItem);

export default router;
