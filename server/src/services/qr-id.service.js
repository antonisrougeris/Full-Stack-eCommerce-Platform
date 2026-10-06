import crypto from "crypto";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { nowIso } from "../utils/ids.js";

const SHORT_ID_LENGTH = 6;

function createShortId(length = SHORT_ID_LENGTH) {
  const alphabet =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  const bytes = crypto.randomBytes(length);

  let result = "";

  for (let i = 0; i < length; i += 1) {
    result += alphabet[bytes[i] % alphabet.length];
  }

  return result;
}

export async function reserveUniqueQrShortId(tx, db) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const shortId = createShortId();

    const reservationRef = db
      .collection(COLLECTIONS.QR_SHORT_IDS)
      .doc(shortId);

    const reservationSnap = await tx.get(reservationRef);

    if (!reservationSnap.exists) {
      return {
        shortId,
        reservationRef,
      };
    }
  }

  throw new ApiError(
    500,
    "Could not generate unique QR short id"
  );
}

export function writeQrShortIdReservation(
  tx,
  reservationRef,
  {
    qrId,
    shortId,
    createdAt = nowIso(),
  }
) {
  tx.create(reservationRef, {
    qrId,
    shortId,
    createdAt,
  });
}