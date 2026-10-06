import { ApiError } from "./apiError.js";

function startsWithHex(buffer, hex) {
  if (!Buffer.isBuffer(buffer)) return false;
  return buffer.subarray(0, hex.length / 2).toString("hex") === hex.toLowerCase();
}

export function assertPdfBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) {
    throw new ApiError(400, "Invalid PDF file");
  }

  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new ApiError(400, "Invalid PDF file signature");
  }
}

export function assertImageBuffer(buffer, mimetype) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    throw new ApiError(400, "Invalid image file");
  }

  const type = String(mimetype || "").toLowerCase();

  const valid =
    (type === "image/png" &&
      startsWithHex(buffer, "89504e470d0a1a0a")) ||
    (type === "image/jpeg" &&
      startsWithHex(buffer, "ffd8ff")) ||
    (type === "image/webp" &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP");

  if (!valid) {
    throw new ApiError(400, "Image content does not match the declared file type");
  }
}
