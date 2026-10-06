import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getMyQrCodes, updateQrCode } from "../controllers/qr.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", getMyQrCodes);
router.patch("/:qrId", updateQrCode);

export default router;
