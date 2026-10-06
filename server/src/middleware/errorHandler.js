import { ApiError } from "../utils/apiError.js";

export function errorHandler(err, req, res, _next) {
  const requestId = req.requestId || null;

  if (err instanceof ApiError) {
    console.warn("api_error", {
      requestId,
      method: req.method,
      path: req.originalUrl?.split("?")[0] || req.path,
      status: err.statusCode,
      message: err.message,
    });

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details || null,
      requestId,
    });
  }

  console.error("unhandled_error", {
    requestId,
    method: req.method,
    path: req.originalUrl?.split("?")[0] || req.path,
    message: err?.message || "Unknown error",
    stack: process.env.NODE_ENV === "production" ? undefined : err?.stack,
  });

  return res.status(500).json({
    success: false,
    message: "Internal server error",
    requestId,
  });
}
