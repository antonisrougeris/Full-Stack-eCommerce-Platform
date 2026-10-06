import { getDB } from "../config/db.js";
import { COLLECTIONS } from "../constants/collections.js";
import { nowIso } from "../utils/ids.js";
import { sendEmail } from "./email.service.js";

const STORE_NAME = process.env.STORE_NAME || "NovaStore";
const STORE_SUPPORT_EMAIL =
  process.env.STORE_SUPPORT_EMAIL || "support@example.com";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value, currency = "EUR", locale = "en") {
  return new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-IE", {
    style: "currency",
    currency,
  }).format(Number(value || 0));
}

function itemsHtml(order) {
  return (order.items || [])
    .map((item) => {
      const variant = [item.variant?.size, item.variant?.color]
        .filter(Boolean)
        .join(" · ");

      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #eee">
            <strong>${escapeHtml(item.title)}</strong>
            ${variant ? `<br><small style="color:#777">${escapeHtml(variant)}</small>` : ""}
          </td>
          <td style="padding:14px 0;border-bottom:1px solid #eee;text-align:center">
            ${Number(item.quantity || 0)}
          </td>
          <td style="padding:14px 0;border-bottom:1px solid #eee;text-align:right">
            ${money(item.lineTotal, item.currency || order.currency, order.locale)}
          </td>
        </tr>`;
    })
    .join("");
}

function customerTemplate(order) {
  return `<!doctype html>
<html>
<body style="margin:0;background:#f6f6f4;font-family:Arial,Helvetica,sans-serif">
  <div style="padding:32px 16px">
    <div style="max-width:680px;margin:auto;background:white;border:1px solid #eee;border-radius:20px;padding:32px">
      <div style="font-size:26px;font-weight:800;letter-spacing:4px;margin-bottom:26px">${escapeHtml(STORE_NAME)}</div>
      <h1 style="font-size:24px">Order confirmed</h1>
      <p style="color:#555;line-height:1.7">Thanks for your order. Your payment was successful and we are preparing it now.</p>
      <p><strong>Order:</strong> ${escapeHtml(order.orderNumber || order.id)}</p>
      <table style="width:100%;border-collapse:collapse">
        <tbody>${itemsHtml(order)}</tbody>
      </table>
      <div style="margin-top:24px;padding:18px;background:#fafafa;border-radius:14px">
        <div>Subtotal: ${money(order.subtotal, order.currency, order.locale)}</div>
        <div>Shipping: ${money(order.shippingCost, order.currency, order.locale)}</div>
        <div style="margin-top:8px;font-size:18px"><strong>Total: ${money(order.total, order.currency, order.locale)}</strong></div>
      </div>
      <div style="margin-top:28px;color:#777;font-size:13px">
        Need help? <a href="mailto:${escapeHtml(STORE_SUPPORT_EMAIL)}">${escapeHtml(STORE_SUPPORT_EMAIL)}</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendPaidOrderEmails(order) {
  if (!order?.id || !order?.customer?.email) return;

  const db = getDB();
  const orderRef = db.collection(COLLECTIONS.ORDERS).doc(order.id);
  const current = await orderRef.get();

  if (current.exists && current.data()?.emails?.paidOrderSentAt) return;

  await sendEmail({
    to: order.customer.email,
    subject: `Order confirmed · ${order.orderNumber || order.id}`,
    html: customerTemplate(order),
  });

  const adminEmail = process.env.STORE_ADMIN_EMAIL;
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: `New paid order · ${order.orderNumber || order.id}`,
      html: customerTemplate(order),
    });
  }

  const sentAt = nowIso();
  await orderRef.set(
    {
      emails: {
        paidOrderSentAt: sentAt,
      },
      updatedAt: sentAt,
    },
    { merge: true }
  );
}
