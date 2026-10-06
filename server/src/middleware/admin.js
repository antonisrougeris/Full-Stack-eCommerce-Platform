export function requireAdmin(req, res, next) {
  if (!req.user?.admin) {
    return res.status(403).json({
      success: false,
      message: "Admin only",
    });
  }
  next();
}
