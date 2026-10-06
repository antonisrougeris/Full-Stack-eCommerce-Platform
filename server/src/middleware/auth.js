import { getAuthService, getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [type, token] = header.split(" ");

    if (type !== "Bearer" || !token) {
      return res.status(401).json({
        success: false,
        message: "Missing or invalid Authorization header",
      });
    }

    const decoded = await getAuthService().verifyIdToken(token);

    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
      admin: !!decoded.admin,
      emailVerifiedByProvider:
        decoded.email_verified === true,
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
}

export async function requireVerifiedEmail(
  req,
  res,
  next
) {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (req.user.emailVerifiedByProvider) {
      return next();
    }

    const snap = await getDB()
      .collection(COLLECTIONS.USERS)
      .doc(req.user.uid)
      .get();

    if (
      !snap.exists ||
      snap.data()?.emailVerified !== true
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Please verify your email before checkout",
      });
    }

    return next();
  } catch {
    return res.status(500).json({
      success: false,
      message:
        "Unable to verify email status",
    });
  }
}

export async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [type, token] = header.split(" ");

    if (type === "Bearer" && token) {
      const decoded = await getAuthService().verifyIdToken(token);

      req.user = {
        uid: decoded.uid,
        email: decoded.email || null,
        name: decoded.name || null,
        admin: !!decoded.admin,
        emailVerifiedByProvider:
          decoded.email_verified === true,
      };
    }
  } catch {
    // ignore invalid token
  }

  const guestId = req.headers["x-guest-id"];
  if (!req.user && guestId) {
    req.guestId = guestId;
  }

  next();
}
