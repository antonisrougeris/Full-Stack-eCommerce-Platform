import { getDB } from "../config/db.js";

export async function requireAdmin(
  req,
  res,
  next
) {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const db = getDB();

    const userDoc =
      await db
        .collection("users")
        .doc(req.user.uid)
        .get();

    if (!userDoc.exists) {
      return res.status(403).json({
        success: false,
        message: "Administrator access denied",
      });
    }

    const user =
      userDoc.data();

    if (user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Administrator access denied",
      });
    }

    req.admin = {
      id: userDoc.id,
      ...user,
    };

    next();

  } catch (error) {
    console.error(
      "requireAdmin error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to verify administrator access",
    });
  }
}