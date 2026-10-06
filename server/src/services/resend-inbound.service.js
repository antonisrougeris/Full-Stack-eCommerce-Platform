import { Resend } from "resend";

const ALLOWED_INBOUND_RECIPIENTS = new Set([
  "info@skanare.com",
  "hello@skanare.com",
]);

const DEFAULT_FORWARD_TO = "adminskanare@gmail.com";
const DEFAULT_FORWARD_FROM = "Skanare Forwarding <forward@skanare.com>";

function normalizeAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function extractAddress(value) {
  const input = String(value || "").trim();
  const match = input.match(/<([^>]+)>/);
  return normalizeAddress(match ? match[1] : input);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function isAllowedInboundRecipient(value) {
  return ALLOWED_INBOUND_RECIPIENTS.has(extractAddress(value));
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is missing");
  }

  return new Resend(apiKey);
}

function getForwardDestination() {
  return (
    process.env.INBOUND_EMAIL_FORWARD_TO ||
    DEFAULT_FORWARD_TO
  ).trim();
}

function getForwardSender() {
  return (
    process.env.INBOUND_EMAIL_FORWARD_FROM ||
    DEFAULT_FORWARD_FROM
  ).trim();
}

async function buildForwardAttachments(resend, emailId) {
  const { data, error } =
    await resend.emails.receiving.attachments.list({
      emailId,
    });

  if (error) {
    throw new Error(
      error.message || "Failed to list inbound email attachments"
    );
  }

  const items = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
      ? data
      : [];

  return items
    .filter((item) => item?.download_url && item?.filename)
    .map((item) => ({
      path: item.download_url,
      filename: item.filename,
      ...(item.content_id
        ? { contentId: item.content_id }
        : {}),
    }));
}

function buildForwardHtml({ eventData, email }) {
  const originalHtml =
    email?.html ||
    (email?.text
      ? `<pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${escapeHtml(
          email.text
        )}</pre>`
      : "<p>(No message body)</p>");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <div style="padding:14px 16px;background:#f5f5f5;border-radius:8px;margin-bottom:18px">
        <strong>Forwarded by Skanare inbound mail</strong><br>
        <strong>To:</strong> ${escapeHtml((eventData.to || []).join(", "))}<br>
        <strong>From:</strong> ${escapeHtml(eventData.from || "")}<br>
        <strong>Subject:</strong> ${escapeHtml(eventData.subject || "(no subject)")}
      </div>
      ${originalHtml}
    </div>
  `;
}

export async function forwardInboundEmail(eventData) {
  if (!eventData?.email_id) {
    throw new Error("Resend inbound event is missing email_id");
  }

  const recipients = Array.isArray(eventData.to)
    ? eventData.to
    : [];

  const matchedRecipient = recipients.find(
    isAllowedInboundRecipient
  );

  if (!matchedRecipient) {
    return {
      forwarded: false,
      reason: "recipient_not_allowed",
    };
  }

  const resend = getResendClient();

  const { data: email, error: emailError } =
    await resend.emails.receiving.get(
      eventData.email_id
    );

  if (emailError) {
    throw new Error(
      emailError.message || "Failed to retrieve inbound email"
    );
  }

  const attachments = await buildForwardAttachments(
    resend,
    eventData.email_id
  );

  const subject = eventData.subject
    ? `[${extractAddress(matchedRecipient)}] ${eventData.subject}`
    : `[${extractAddress(matchedRecipient)}] (no subject)`;

  const result = await resend.emails.send({
    from: getForwardSender(),
    to: getForwardDestination(),
    subject,
    html: buildForwardHtml({
      eventData,
      email,
    }),
    ...(email?.text
      ? {
          text: [
            "Forwarded by Skanare inbound mail",
            `To: ${recipients.join(", ")}`,
            `From: ${eventData.from || ""}`,
            `Subject: ${eventData.subject || "(no subject)"}`,
            "",
            email.text,
          ].join("\n"),
        }
      : {}),
    ...(eventData.from
      ? { replyTo: extractAddress(eventData.from) }
      : {}),
    ...(attachments.length
      ? { attachments }
      : {}),
  });

  if (result.error) {
    throw new Error(
      result.error.message || "Failed to forward inbound email"
    );
  }

  return {
    forwarded: true,
    id: result.data?.id || null,
    to: getForwardDestination(),
    inboundRecipient: extractAddress(matchedRecipient),
    attachments: attachments.length,
  };
}

export function verifyResendWebhook({
  rawBody,
  headers,
}) {
  const webhookSecret =
    process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error("RESEND_WEBHOOK_SECRET is missing");
  }

  const resend = getResendClient();

  return resend.webhooks.verify({
    payload: rawBody,
    headers: {
      "svix-id": headers["svix-id"],
      "svix-timestamp": headers["svix-timestamp"],
      "svix-signature": headers["svix-signature"],
    },
    secret: webhookSecret,
  });
}
