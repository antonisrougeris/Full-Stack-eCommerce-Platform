import crypto from "crypto";

import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { ApiError } from "../utils/apiError.js";
import { nowIso } from "../utils/ids.js";
import { sendEmail } from "./email.service.js";
import { brandedEmailTemplate } from "./email-template.service.js";
import { processBoxNowReturnWebhookEvent } from "./returns.service.js";


/* ==================================================
   RAW DATA EXTRACTION
================================================== */

/*
 * BOX NOW signs ONLY the raw "data" JSON object.
 *
 * We must NOT do:
 *
 * JSON.stringify(req.body.data)
 *
 * because whitespace / key order may change and the
 * signature would no longer match.
 *
 * This function extracts the exact raw JSON substring
 * belonging to the top-level "data" property.
 */
export function extractRawDataObject(rawBody) {
  const raw =
    Buffer.isBuffer(rawBody)
      ? rawBody.toString("utf8")
      : String(rawBody || "");

  if (!raw.trim()) {
    throw new ApiError(
      400,
      "Missing BOX NOW raw webhook body"
    );
  }

  let inString = false;
  let escaped = false;
  let depth = 0;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      /*
       * At top-level object depth 1,
       * check whether this property is "data".
       */
      if (depth === 1) {
        let j = i + 1;
        let key = "";
        let keyEscaped = false;

        while (j < raw.length) {
          const keyChar = raw[j];

          if (keyEscaped) {
            key += keyChar;
            keyEscaped = false;
            j += 1;
            continue;
          }

          if (keyChar === "\\") {
            keyEscaped = true;
            j += 1;
            continue;
          }

          if (keyChar === "\"") {
            break;
          }

          key += keyChar;
          j += 1;
        }

        if (key === "data") {
          let k = j + 1;

          while (
            k < raw.length &&
            /\s/.test(raw[k])
          ) {
            k += 1;
          }

          if (raw[k] !== ":") {
            continue;
          }

          k += 1;

          while (
            k < raw.length &&
            /\s/.test(raw[k])
          ) {
            k += 1;
          }

          if (raw[k] !== "{") {
            throw new ApiError(
              400,
              "Invalid BOX NOW webhook data object"
            );
          }

          const start = k;

          let objectDepth = 0;
          let objectInString = false;
          let objectEscaped = false;

          for (
            let p = start;
            p < raw.length;
            p += 1
          ) {
            const objectChar = raw[p];

            if (objectInString) {
              if (objectEscaped) {
                objectEscaped = false;
                continue;
              }

              if (objectChar === "\\") {
                objectEscaped = true;
                continue;
              }

              if (objectChar === "\"") {
                objectInString = false;
              }

              continue;
            }

            if (objectChar === "\"") {
              objectInString = true;
              continue;
            }

            if (objectChar === "{") {
              objectDepth += 1;
            }

            if (objectChar === "}") {
              objectDepth -= 1;

              if (objectDepth === 0) {
                return raw.slice(
                  start,
                  p + 1
                );
              }
            }
          }

          throw new ApiError(
            400,
            "Incomplete BOX NOW webhook data object"
          );
        }
      }

      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
    }
  }

  throw new ApiError(
    400,
    "BOX NOW webhook does not contain data object"
  );
}


/* ==================================================
   SIGNATURE
================================================== */

export function verifyBoxNowSignature({
  rawBody,
  signature,
}) {
  const secret =
    String(
      process.env.BOXNOW_WEBHOOK_SECRET ||
      ""
    ).trim();

  if (!secret) {
    throw new ApiError(
      500,
      "BOX NOW webhook secret is not configured"
    );
  }

  const receivedSignature =
    String(signature || "")
      .trim()
      .toLowerCase();

  if (!receivedSignature) {
    throw new ApiError(
      401,
      "Missing BOX NOW webhook signature"
    );
  }

  const rawData =
    extractRawDataObject(rawBody);

  const expectedSignature =
    crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(
        rawData,
        "utf8"
      )
      .digest("hex")
      .toLowerCase();

  /*
   * timingSafeEqual requires equal length buffers.
   */
  const receivedBuffer =
    Buffer.from(
      receivedSignature,
      "utf8"
    );

  const expectedBuffer =
    Buffer.from(
      expectedSignature,
      "utf8"
    );

  if (
    receivedBuffer.length !==
    expectedBuffer.length
  ) {
    throw new ApiError(
      401,
      "Invalid BOX NOW webhook signature"
    );
  }

  if (
    !crypto.timingSafeEqual(
      receivedBuffer,
      expectedBuffer
    )
  ) {
    throw new ApiError(
      401,
      "Invalid BOX NOW webhook signature"
    );
  }

  return true;
}


/* ==================================================
   ORDER LOOKUP
================================================== */

async function findBoxNowOrder(
  tx,
  db,
  {
    orderNumber,
    parcelId,
  }
) {
  /*
   * Best lookup:
   * BOX NOW orderNumber is our own Skanare orderNumber.
   */
  if (orderNumber) {
    const snap =
      await tx.get(
        db
          .collection(
            COLLECTIONS.ORDERS
          )
          .where(
            "orderNumber",
            "==",
            String(orderNumber)
          )
          .limit(1)
      );

    if (!snap.empty) {
      return snap.docs[0];
    }
  }

  /*
   * Fallback lookup by BOX NOW parcel id.
   */
  if (parcelId) {
    const snap =
      await tx.get(
        db
          .collection(
            COLLECTIONS.ORDERS
          )
          .where(
            "shipping.boxnow.parcelIds",
            "array-contains",
            String(parcelId)
          )
          .limit(1)
      );

    if (!snap.empty) {
      return snap.docs[0];
    }
  }

  return null;
}




async function sendDeliveredOrderEmail(orderId) {
  const db = getDB();
  const ref = db
    .collection(COLLECTIONS.ORDERS)
    .doc(String(orderId));

  const snap = await ref.get();

  if (!snap.exists) return;

  const order = {
    id: snap.id,
    ...snap.data(),
  };

  if (order.emails?.deliveredOrderSentAt) {
    return;
  }

  const customerEmail = String(
    order.customer?.email || ""
  ).trim();

  if (!customerEmail) {
    console.warn("BOX NOW delivered email skipped: customer email missing", {
      orderId: order.id,
    });
    return;
  }

  const firstName = String(
    order.customer?.firstName || ""
  ).trim();

  await sendEmail({
    from:
      process.env.EMAIL_ORDER ||
      process.env.EMAIL_FROM,
    to: customerEmail,
    subject: `Your Skanare order ${order.orderNumber || order.id} was delivered`,
    html: brandedEmailTemplate({
      title: "Your order was delivered",
      intro:
        `Hi ${firstName || "there"}, BOX NOW marked your Skanare order as delivered.`,
      body: `
        <div style="background:#f7f7f7;border-radius:16px;padding:18px;margin:22px 0;color:#111;">
          <p style="margin:0 0 8px;"><strong>Order:</strong> ${order.orderNumber || order.id}</p>
          <p style="margin:0;"><strong>Status:</strong> Delivered</p>
        </div>
        <p style="color:#555;line-height:1.7;margin:0;">
          We hope you enjoy your Skanare order. If something is not right,
          contact us at hello@skanare.com.
        </p>
      `,
    }),
  });

  const sentAt = nowIso();

  await ref.set(
    {
      emails: {
        ...(order.emails || {}),
        deliveredOrderSentAt: sentAt,
        deliveredOrderEmail: customerEmail,
      },
      updatedAt: sentAt,
    },
    { merge: true }
  );

  console.info("BOX NOW delivered email sent", {
    orderId: order.id,
  });
}

export function shouldIgnoreBoxNowEvent(previousEventTime, eventTime) {
  if (!previousEventTime) return false;

  const previousTimestamp = Date.parse(previousEventTime);
  const incomingTimestamp = Date.parse(eventTime);

  return (
    Number.isFinite(previousTimestamp) &&
    Number.isFinite(incomingTimestamp) &&
    incomingTimestamp <= previousTimestamp
  );
}

/* ==================================================
   EVENT PROCESSING
================================================== */

export async function processBoxNowWebhook({
  payload,
  rawBody,
}) {
  if (
    !payload ||
    typeof payload !== "object"
  ) {
    throw new ApiError(
      400,
      "Invalid BOX NOW webhook payload"
    );
  }

  /*
   * BOX NOW guide:
   * datasignature = HMAC SHA256 of exact raw data object.
   */
  verifyBoxNowSignature({
    rawBody,
    signature:
      payload.datasignature,
  });


  const data =
    payload.data;

  if (
    !data ||
    typeof data !== "object"
  ) {
    throw new ApiError(
      400,
      "Missing BOX NOW webhook data"
    );
  }


  /*
   * Use data.event, NOT parcelState.
   */
  const event =
    String(
      data.event ||
      ""
    )
      .trim()
      .toLowerCase();


  const parcelId =
    String(
      data.parcelId ||
      ""
    ).trim();


  const orderNumber =
    String(
      data.orderNumber ||
      ""
    ).trim();


  const eventTime =
    String(
      data.time ||
      ""
    ).trim();


  const messageId =
    String(
      payload.id ||
      ""
    ).trim();


  if (!event) {
    throw new ApiError(
      400,
      "Missing BOX NOW webhook event"
    );
  }


  if (
    !parcelId &&
    !orderNumber
  ) {
    throw new ApiError(
      400,
      "Missing BOX NOW parcelId/orderNumber"
    );
  }


  if (!eventTime) {
    throw new ApiError(
      400,
      "Missing BOX NOW webhook data.time"
    );
  }


  const parsedEventTime =
    Date.parse(
      eventTime
    );

  if (
    !Number.isFinite(
      parsedEventTime
    )
  ) {
    throw new ApiError(
      400,
      "Invalid BOX NOW webhook data.time"
    );
  }


  const db =
    getDB();

  const receivedAt =
    nowIso();


  const result =
    await db.runTransaction(
      async (tx) => {
        const doc =
          await findBoxNowOrder(
            tx,
            db,
            {
              orderNumber,
              parcelId,
            }
          );


        /*
         * Return 200 even when we do not know the order.
         *
         * Otherwise BOX NOW will keep retrying the same
         * webhook for a parcel we cannot process.
         */
        if (!doc) {
          console.warn(
            "BOX NOW webhook order not found",
            {
              orderNumber,
              parcelId,
              event,
              eventTime,
              messageId,
            }
          );

          return {
            processed:
              false,

            reason:
              "order_not_found",
          };
        }


        const order = {
          id:
            doc.id,

          ...doc.data(),
        };


        const previousEventTime =
          order.shipping
            ?.boxnow
            ?.lastEventAt ||
          null;


        /*
         * BOX NOW recommends data.time for duplicate /
         * invalid update filtering.
         *
         * Ignore same or older event.
         */
        if (
          shouldIgnoreBoxNowEvent(
            previousEventTime,
            eventTime
          )
        ) {
            console.log(
              "BOX NOW duplicate/old webhook ignored",
              {
                orderId:
                  order.id,

                parcelId,

                event,

                eventTime,

                previousEventTime,
              }
            );

            return {
              processed:
                false,

              reason:
                "duplicate_or_old_event",

              orderId:
                order.id,
            };
        }


        /*
         * We keep the actual BOX NOW event as the
         * shipping lifecycle status.
         *
         * Before the first webhook it is:
         *
         * created
         *
         * Then:
         *
         * new
         * in-depot
         * final-destination
         * delivered
         * returned
         * ...
         */
        const patch = {
          "shipping.status":
            event,

          "shipping.updatedAt":
            receivedAt,

          "shipping.boxnow.lastEvent":
            event,

          "shipping.boxnow.lastEventAt":
            eventTime,

          "shipping.boxnow.lastWebhookMessageId":
            messageId ||
            null,

          "shipping.boxnow.lastWebhookReceivedAt":
            receivedAt,

          "shipping.boxnow.lastParcelId":
            parcelId ||
            null,

          "shipping.boxnow.parcelState":
            data.parcelState ||
            null,

          "shipping.boxnow.eventLocation":
            data.eventLocation ||
            null,

          "shipping.boxnow.additionalInformation":
            data.additionalInformation ||
            null,

          updatedAt:
            receivedAt,
        };


        /*
         * Keep some useful timestamps.
         */
        if (
          event ===
          "delivered"
        ) {
          patch[
            "shipping.deliveredAt"
          ] =
            eventTime;

          patch.fulfillmentStatus =
            "completed";

          patch.completedAt =
            eventTime;

          patch.completionSource =
            "boxnow_webhook";

          patch.history = [
            ...(
              Array.isArray(order.history)
                ? order.history
                : []
            ),
            {
              action:
                "order_completed",
              at:
                eventTime,
              source:
                "boxnow_webhook",
              providerEvent:
                event,
              parcelId:
                parcelId || null,
            },
          ];
        }


        if (
          event ===
          "final-destination"
        ) {
          patch[
            "shipping.readyForPickupAt"
          ] =
            eventTime;
        }


        if (
          event ===
          "returned"
        ) {
          patch[
            "shipping.returnedAt"
          ] =
            eventTime;
        }


        if (
          event ===
          "canceled"
        ) {
          patch[
            "shipping.canceledAt"
          ] =
            eventTime;
        }


        tx.update(
          doc.ref,
          patch
        );


        return {
          processed:
            true,

          orderId:
            order.id,

          orderNumber:
            order.orderNumber,

          parcelId,

          event,

          eventTime,
        };
      }
    );


  if (result?.reason === "order_not_found") {
    const returnResult = await processBoxNowReturnWebhookEvent({
      orderNumber,
      parcelId,
      event,
      eventTime,
      messageId,
      data,
      receivedAt,
    });

    if (returnResult) {
      console.log("BOX NOW return webhook processed", returnResult);
      return returnResult;
    }
  }

  console.log(
    "BOX NOW webhook processed",
    result
  );

  /*
   * Email delivery confirmation outside the Firestore transaction.
   * If sending fails, return an error so BOX NOW retries. On retry,
   * the event update is idempotent and this email is attempted again
   * until deliveredOrderSentAt exists.
   */
  if (
    event === "delivered" &&
    result?.orderId
  ) {
    await sendDeliveredOrderEmail(
      result.orderId
    );
  }

  return result;
}