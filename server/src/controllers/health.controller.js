import { getDB } from "../config/db.js";

export function healthController(_req, res) {
  res.json({
    success: true,
    service: "qr-ecommerce-api",
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

export function livenessController(_req, res) {
  res.status(200).json({
    success: true,
    status: "alive",
  });
}

export function readinessController(_req, res) {
  try {
    getDB();

    res.status(200).json({
      success: true,
      status: "ready",
      dependencies: {
        firebaseAdmin: "initialized",
      },
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: "not_ready",
      timestamp: new Date().toISOString(),
    });
  }
}
