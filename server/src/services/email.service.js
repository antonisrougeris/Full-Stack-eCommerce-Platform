import { Resend } from "resend";

function maskEmail(value) {
  const email = String(value || "");
  const [local, domain] = email.split("@");

  if (!domain) return "redacted";

  return `${local.slice(0, 2)}***@${domain}`;
}

export async function sendEmail({
  to,
  subject,
  html,
  from,
  replyTo,
  attachments = [],
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is missing");
  }

  const sender =
    from ||
    process.env.CONTACT_EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    "Skanare Contact <contact@skanare.com>";

  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from: sender,
    to,
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
    ...(attachments.length ? { attachments } : {}),
  });

  if (result.error) {
    console.error("email_send_failed", {
      to: maskEmail(to),
      subject,
      message: result.error.message || "Email send failed",
    });

    throw new Error(result.error.message || "Email send failed");
  }

  console.info("email_sent", {
    to: maskEmail(to),
    subject,
    id: result.data?.id || null,
    attachments: attachments.length,
  });

  return result.data;
}
