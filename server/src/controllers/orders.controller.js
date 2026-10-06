import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";
import {
  getOrdersForUser,
  getOrderByIdForUser,
  getOrderByVivaOrderCodeForUser,
} from "../services/order.service.js";

export const listOrders = asyncHandler(async (req, res) => {
  const orders = await getOrdersForUser(req.user.uid);
  return ok(res, { orders });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await getOrderByIdForUser(req.user.uid, req.params.orderId);
  return ok(res, { order });
});

export const getOrderByVivaCode = asyncHandler(async (req, res) => {
  const order = await getOrderByVivaOrderCodeForUser(
    req.user.uid,
    req.params.vivaOrderCode
  );

  return ok(res, { order });
});
