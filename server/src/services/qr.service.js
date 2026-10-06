import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { nowIso } from "../utils/ids.js";
import { normalizeUrlOrThrow } from "../utils/validators.js";

import QRCode from "qrcode";


export async function getQrCodesForUser(userId) {
  if (!userId) throw new ApiError(401, "Missing user id");

  const db = getDB();
  const snapshot = await db
    .collection(COLLECTIONS.QR_CODES)
    .where("userId", "==", userId)
    .get();
  const qrCodes = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  qrCodes.sort(
    (a, b) =>
      new Date(b.createdAt || 0).getTime() -
      new Date(a.createdAt || 0).getTime()
  );
  return qrCodes;
}

export async function updateQrCodeTarget({ userId, qrId, targetUrl }) {
  if (!userId) throw new ApiError(401, "Missing user id");
  if (!qrId) throw new ApiError(400, "Missing qr id");

  const normalizedTargetUrl = normalizeUrlOrThrow(targetUrl, "targetUrl");
  const db = getDB();
  const qrRef = db.collection(COLLECTIONS.QR_CODES).doc(qrId);
  const qrSnap = await qrRef.get();

  if (!qrSnap.exists) throw new ApiError(404, "QR code not found");

  const qrCode = { id: qrSnap.id, ...qrSnap.data() };
  if (qrCode.userId !== userId)
    throw new ApiError(403, "You do not have access to this QR code");

  const updatedAt = nowIso();
  await qrRef.update({ targetUrl: normalizedTargetUrl, updatedAt });
  return { ...qrCode, targetUrl: normalizedTargetUrl, updatedAt };
}


export async function generateQrBuffer(url) {
  return QRCode.toBuffer(url, {
    type: "png",
    width: 1000,              // PRINT QUALITY
    margin: 2,
    errorCorrectionLevel: "H",
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}