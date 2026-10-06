import {
  processBoxNowWebhook,
} from "../services/boxnow-webhook.service.js";


export async function handleBoxNowWebhook(
  req,
  res,
  next
) {
  try {
    const result =
      await processBoxNowWebhook({
        payload:
          req.body,

        rawBody:
          req.rawBody,
      });


    /*
     * BOX NOW expects HTTP 200.
     */
    return res
      .status(200)
      .json({
        success: true,
        ...result,
      });
  } catch (error) {
    next(error);
  }
}