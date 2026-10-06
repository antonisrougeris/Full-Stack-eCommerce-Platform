import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";
import {
  approveReturnForAdmin,
  cancelReturnForUser,
  createReturnRequest,
  getReturnEligibilityForUser,
  getReturnLabelForAdmin,
  getReturnLabelForUser,
  getReturnsForUser,
  listReturnsForAdmin,
  markReturnReceivedForAdmin,
  markReturnRefundedForAdmin,
  rejectReturnForAdmin,
} from "../services/returns.service.js";

export const getReturnEligibility = asyncHandler(async (req, res) => {
  return ok(res, { orders: await getReturnEligibilityForUser(req.user.uid) });
});

export const listMyReturns = asyncHandler(async (req, res) => {
  return ok(res, { returns: await getReturnsForUser(req.user.uid) });
});

export const createReturn = asyncHandler(async (req, res) => {
  const request = await createReturnRequest({
    userId: req.user.uid,
    orderId: req.body?.orderId,
    items: req.body?.items,
    customerNote: req.body?.customerNote,
    conditionConfirmed: req.body?.conditionConfirmed === true,
  });

  return ok(res, { return: request }, 201);
});

export const cancelMyReturn = asyncHandler(async (req, res) => {
  return ok(res, {
    return: await cancelReturnForUser(req.user.uid, req.params.returnId),
  });
});

function sendPdf(res, { request, buffer }) {
  const filename = `return-${String(
    request.returnNumber || request.id
  ).replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", buffer.length);
  return res.status(200).send(buffer);
}

export const downloadMyReturnLabel = asyncHandler(async (req, res) => {
  return sendPdf(
    res,
    await getReturnLabelForUser(req.user.uid, req.params.returnId)
  );
});

export const adminListReturns = asyncHandler(async (_req, res) => {
  return ok(res, { returns: await listReturnsForAdmin() });
});

export const adminApproveReturn = asyncHandler(async (req, res) => {
  return ok(res, {
    return: await approveReturnForAdmin(req.params.returnId, req.user),
  });
});

export const adminRejectReturn = asyncHandler(async (req, res) => {
  return ok(res, {
    return: await rejectReturnForAdmin(
      req.params.returnId,
      req.user,
      req.body?.note
    ),
  });
});

export const adminMarkReturnReceived = asyncHandler(async (req, res) => {
  return ok(res, {
    return: await markReturnReceivedForAdmin(req.params.returnId, req.user),
  });
});

export const adminMarkReturnRefunded = asyncHandler(async (req, res) => {
  return ok(res, {
    return: await markReturnRefundedForAdmin(req.params.returnId, req.user, {
      amount: req.body?.amount,
      reference: req.body?.reference,
    }),
  });
});

export const adminDownloadReturnLabel = asyncHandler(async (req, res) => {
  return sendPdf(res, await getReturnLabelForAdmin(req.params.returnId));
});
