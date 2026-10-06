import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";
import {
  registerUser,
  loginUser,
  getCurrentUser,
} from "../services/auth.service.js";
import { mergeGuestCartIntoUserCart } from "../services/cart.service.js";



function getUserCartId(user) {
  return user?.uid || user?.id || user?.userId || null;
}

async function mergeGuestCartIfNeeded(req, user) {
  const userId = getUserCartId(user);

  if (!req.guestId || !userId) {
    return null;
  }

  return mergeGuestCartIntoUserCart({
    guestId: req.guestId,
    userId,
  });
}

export const register = asyncHandler(async (req, res) => {
  const user = await registerUser(req.body || {});
  const cart = await mergeGuestCartIfNeeded(req, user);

  return ok(res, {
    message: "User synced successfully",
    user,
    cart,
  });
});

export const login = asyncHandler(async (req, res) => {
  const user = await loginUser(req.body || {});
  const cart = await mergeGuestCartIfNeeded(req, user);

  return ok(res, {
    message: "Login successful",
    user,
    cart,
  });
});

export const me = asyncHandler(async (req, res) => {
  const user = await getCurrentUser(req.user?.uid);
  return ok(res, { user });
});

