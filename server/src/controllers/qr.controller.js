import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";
import {
  getQrCodesForUser,
  updateQrCodeTarget,
} from "../services/qr.service.js";

export const getMyQrCodes = asyncHandler(async (req, res) => {
  const qrCodes = await getQrCodesForUser(req.user.uid);
  return ok(res, { qrCodes });
});

export const updateQrCode = asyncHandler(async (req, res) => {
  const qrCode = await updateQrCodeTarget({
    userId: req.user.uid,
    qrId: req.params.qrId,
    targetUrl: req.body?.targetUrl,
  });

  return ok(res, { qrCode });
});
