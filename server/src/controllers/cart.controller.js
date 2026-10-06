import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";
import {
  assertPositiveInteger,
  assertString,
  normalizeVariantInput,
  optionalUrl,
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

import {
  createGuestId,
  setGuestCookie,
} from "../middleware/guestSession.js";

export const getCart = asyncHandler(async (req, res) => {
  const owner = getCartOwner(req, res);

const cart = await getCartByUserId(owner.id);

  return ok(res, { cart });
});

export const transferCartToGuest = asyncHandler(async (req, res) => {
  if (!req.user?.uid) {
    throw new Error("Missing authenticated user");
  }

  let guestId = req.guestId;

  if (!guestId) {
    const { createGuestId, setGuestCookie } = await import(
      "../middleware/guestSession.js"
    );

    guestId = createGuestId();
    setGuestCookie(res, guestId);
  }

  const cart = await copyUserCartToGuestCart({
    userId: req.user.uid,
    guestId,
  });

  return ok(res, { cart, guestId });
});

export const addToCart = asyncHandler(async (req, res) => {
  const productId = assertString(req.body?.productId, "productId");
  const quantity = assertPositiveInteger(req.body?.quantity, "quantity");
  const variant = normalizeVariantInput(req.body?.variant);
  const qrDestination = optionalUrl(req.body?.qrDestination, "qrDestination");

  const owner = getCartOwner(req, res);

  const cart = await addCartItem({
    userId: owner.id, // 🔥 reuse same field
    productId,
    quantity,
    selectedVariant: variant,
    qrDestination,
  });
  

  return ok(res, { cart }, 201);
});

export const patchCartItem = asyncHandler(async (req, res) => {
  const itemId = assertString(req.params.itemId, "itemId");
  const quantity = assertPositiveInteger(req.body?.quantity, "quantity");
  const qrDestination = optionalUrl(req.body?.qrDestination, "qrDestination");

  const owner = getCartOwner(req, res);

const cart = await updateCartItem({
  userId: owner.id,
  itemId,
  quantity,
  qrDestination,
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

  const cart = await updateCartGiftOptions({
    userId: owner.id,
    giftOptions,
  });

  return ok(res, { cart });
});

export const deleteCartItem = asyncHandler(async (req, res) => {
  const itemId = assertString(req.params.itemId, "itemId");

  const owner = getCartOwner(req, res);

const cart = await removeCartItem({
  userId: owner.id,
  itemId,
});


  return ok(res, { cart });
});


function getCartOwner(req, res) {
  if (req.user?.uid) {
    return {
      type: "user",
      id: req.user.uid,
    };
  }

  if (req.guestId) {
    return {
      type: "guest",
      id: req.guestId,
    };
  }

  const guestId = createGuestId();
  setGuestCookie(res, guestId);
  req.guestId = guestId;

  return {
    type: "guest",
    id: guestId,
  };
}