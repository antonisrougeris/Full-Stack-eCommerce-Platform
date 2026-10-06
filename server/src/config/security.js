function normalizeConfiguredOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(`Invalid CORS_ORIGIN value: ${raw}`);
  }
}

export function getAllowedOrigins() {
  return String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map(normalizeConfiguredOrigin)
    .filter(Boolean);
}

export function corsOptions() {
  const allowedOrigins = getAllowedOrigins();
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && allowedOrigins.length === 0) {
    throw new Error("CORS_ORIGIN is required in production");
  }

  return {
    origin(origin, callback) {
      // curl/Postman/server-to-server requests may omit Origin.
      if (!origin) {
        return callback(null, true);
      }

      let normalizedOrigin;

      try {
        normalizedOrigin = new URL(origin).origin;
      } catch {
        console.warn("Blocked malformed CORS origin");
        return callback(null, false);
      }

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      console.warn("Blocked CORS origin:", normalizedOrigin);
      return callback(null, false);
    },

    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  };
}
