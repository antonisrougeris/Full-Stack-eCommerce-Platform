import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getVivaWebhookVerificationKey,
  verifyVivaWebhookWithProvider,
} from "../services/viva.service.js";
import { markOrderPaidFromVivaWebhook } from "../services/payment.service.js";

export function isVivaPaymentCreatedEvent(body) {
  return Number(
    body?.EventTypeId ??
      body?.eventTypeId ??
      0
  ) === 1796;
}

export const verifyVivaWebhook = asyncHandler(async (_req, res) => {
  const key = await getVivaWebhookVerificationKey();
  return res.status(200).json(key);
});

export const handleVivaWebhook = asyncHandler(async (req, res) => {
  const eventTypeId = Number(
    req.body?.EventTypeId ??
      req.body?.eventTypeId ??
      0
  );

  /*
   * Only Transaction Payment Created (1796) may mark an order as paid.
   * Missing/unknown event types are acknowledged without changing state.
   */
  if (!isVivaPaymentCreatedEvent(req.body)) {
    console.info("Viva webhook ignored", {
      requestId: req.requestId,
      eventTypeId,
    });

    return res.status(200).json({
      message: "ignored",
    });
  }

  await verifyVivaWebhookWithProvider(req.body);
  await markOrderPaidFromVivaWebhook(req.body);

  console.info("Viva payment webhook processed", {
    requestId: req.requestId,
    eventTypeId,
  });

  return res.status(200).json({ message: "ok" });
});
