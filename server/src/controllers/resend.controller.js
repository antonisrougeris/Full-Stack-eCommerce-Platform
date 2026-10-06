import {
  forwardInboundEmail,
  verifyResendWebhook,
} from "../services/resend-inbound.service.js";

export async function handleResendWebhook(
  req,
  res,
  next
) {
  try {
    if (!req.rawBody) {
      return res.status(400).json({
        success: false,
        message: "Missing raw webhook body",
      });
    }

    const event = verifyResendWebhook({
      rawBody: req.rawBody.toString("utf8"),
      headers: req.headers,
    });

    if (event.type !== "email.received") {
      return res.status(200).json({
        success: true,
        ignored: true,
      });
    }

    const result = await forwardInboundEmail(
      event.data
    );

    console.info("resend_inbound_processed", {
      requestId: req.requestId,
      emailId: event.data?.email_id || null,
      forwarded: result.forwarded,
      inboundRecipient:
        result.inboundRecipient || null,
      attachments:
        result.attachments || 0,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = String(error?.message || "");

    if (
      message.toLowerCase().includes("signature") ||
      message.toLowerCase().includes("timestamp") ||
      message.toLowerCase().includes("webhook")
    ) {
      console.warn("resend_webhook_rejected", {
        requestId: req.requestId,
        message,
      });

      return res.status(400).json({
        success: false,
        message: "Invalid Resend webhook",
      });
    }

    return next(error);
  }
}
