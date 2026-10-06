import rateLimit from "express-rate-limit";

function buildLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message,
    },
  });
}

export const apiLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: "Too many requests, please try again later",
});

export const authLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: "Too many authentication requests, please try again later",
});

export const sensitiveAuthLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  message: "Too many verification or password reset requests",
});

export const checkoutLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: "Too many checkout attempts, please try again later",
});

export const contactLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many contact messages, please try again later",
});

export const adminLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 180,
  message: "Too many admin requests, please try again later",
});

export const webhookLimiter = buildLimiter({
  windowMs: 60 * 1000,
  limit: 180,
  message: "Too many webhook requests",
});
