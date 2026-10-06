import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";
import {
  assertPositiveInteger,
  assertString,
  normalizeVariantInput,
  giftOptionsSchema,
  parseOrThrow,
} from "../utils/validators.js";
import {
  addCartItem,
  getCartByUserId,
  removeCartItem,
  updateCartItem,
  updateCartGiftOptions,
  copyUserCartToGuestCart,
} from "../services/cart.service.js";
import { createGuestId, setGuestCookie } from "../middleware/guestSession.js";

function getCartOwner(req, res) {
  if (req.user?.uid) return { type: "user", id: req.user.uid };
  if (req.guestId) return { type: "guest", id: req.guestId };

  const guestId = createGuestId();
  setGuestCookie(res, guestId);
  req.guestId = guestId;
  return { type: "guest", id: guestId };
}

export const getCart = asyncHandler(async (req, res) => {
  const owner = getCartOwner(req, res);
  return ok(res, { cart: await getCartByUserId(owner.id) });
});

export const addToCart = asyncHandler(async (req, res) => {
  const owner = getCartOwner(req, res);
  const cart = await addCartItem({
    userId: owner.id,
    productId: assertString(req.body?.productId, "productId"),
    quantity: assertPositiveInteger(req.body?.quantity, "quantity"),
    selectedVariant: normalizeVariantInput(req.body?.variant),
  });
  return ok(res, { cart }, 201);
});

export const patchCartItem = asyncHandler(async (req, res) => {
  const owner = getCartOwner(req, res);
  const cart = await updateCartItem({
    userId: owner.id,
    itemId: assertString(req.params.itemId, "itemId"),
    quantity: assertPositiveInteger(req.body?.quantity, "quantity"),
  });
  return ok(res, { cart });
});

export const patchCartGiftOptions = asyncHandler(async (req, res) => {
  const owner = getCartOwner(req, res);
  const giftOptions = parseOrThrow(
    giftOptionsSchema,
    req.body,
    "Invalid gift options"
  );
  return ok(res, {
    cart: await updateCartGiftOptions({ userId: owner.id, giftOptions }),
  });
});

export const deleteCartItem = asyncHandler(async (req, res) => {
  const owner = getCartOwner(req, res);
  return ok(res, {
    cart: await removeCartItem({
      userId: owner.id,
      itemId: assertString(req.params.itemId, "itemId"),
    }),
  });
});

export const transferCartToGuest = asyncHandler(async (req, res) => {
  if (!req.user?.uid) throw new Error("Missing authenticated user");

  let guestId = req.guestId;
  if (!guestId) {
    guestId = createGuestId();
    setGuestCookie(res, guestId);
  }

  const cart = await copyUserCartToGuestCart({
    userId: req.user.uid,
    guestId,
  });

  return ok(res, { cart, guestId });
});
