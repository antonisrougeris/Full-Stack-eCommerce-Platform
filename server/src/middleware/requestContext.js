import crypto from "crypto";

export function requestContext(req, res, next) {
  const incoming = String(req.get("x-request-id") || "").trim();

  const requestId =
    /^[A-Za-z0-9._:-]{1,100}$/.test(incoming)
      ? incoming
      : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const elapsedMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    console.info("http_request", {
      requestId,
      method: req.method,
      path: req.originalUrl?.split("?")[0] || req.path,
      status: res.statusCode,
      durationMs: Number(elapsedMs.toFixed(1)),
    });
  });

  next();
}
