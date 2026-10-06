import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";
import { checkoutCartForOwner } from "../services/order.service.js";
import { createVivaPaymentOrder } from "../services/viva.service.js";
import { ApiError } from "../utils/apiError.js";
import { checkoutSchema, parseOrThrow } from "../utils/validators.js";
import { attachVivaPaymentToOrder } from "../services/payment.service.js";

function getCheckoutOwner(req) {
  if (req.user?.uid) return { type: "user", id: req.user.uid };
  throw new ApiError(401, "You must be signed in to checkout");
}

export const checkout = asyncHandler(async (req, res) => {
  const owner = getCheckoutOwner(req);
  const body = parseOrThrow(checkoutSchema, req.body, "Invalid checkout data");

  const result = await checkoutCartForOwner({
    locale: body.locale || "en",
    ownerId: owner.id,
    ownerType: owner.type,
    customer: body.customer,
    phoneCountryCode: body.phoneCountryCode,
    shippingAddress: body.shippingAddress,
    delivery: body.delivery,
    locker: body.locker || null,
    notes: body.notes || "",
    giftOptions: body.giftOptions,
    documentType: body.documentType || "receipt",
    invoiceDetails: body.invoiceDetails || null,
  });

  const existingVivaOrderCode =
    result.order?.payment?.vivaOrderCode;

  const existingCheckoutUrl =
    result.order?.payment?.checkoutUrl;

  if (
    existingVivaOrderCode &&
    existingCheckoutUrl
  ) {
    return ok(
      res,
      {
        ...result,
        vivaOrderCode:
          String(existingVivaOrderCode),
        checkoutUrl:
          String(existingCheckoutUrl),
      },
      200
    );
  }

  const viva =
    await createVivaPaymentOrder(
      result.order
    );

  await attachVivaPaymentToOrder({
    orderId: result.orderId,
    vivaOrderCode:
      viva.vivaOrderCode,
    checkoutUrl:
      viva.checkoutUrl,
    raw:
      viva.raw,
  });

  return ok(
    res,
    {
      ...result,
      vivaOrderCode:
        viva.vivaOrderCode,
      checkoutUrl:
        viva.checkoutUrl,
    },
    result.reused ? 200 : 201
  );
});
