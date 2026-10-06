function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function brandedEmailTemplate({
  title,
  intro = "",
  body = "",
  footer = "Need help? Contact hello@skanare.com.",
}) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f6f4;">
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f6f6f4;padding:32px 16px;">
      <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #ececec;border-radius:22px;padding:34px;">
        <div style="text-align:center;margin-bottom:28px;">
          <div style="font-size:30px;font-weight:800;letter-spacing:6px;color:#111;">SKANARE</div>
          <div style="font-size:12px;color:#777;margin-top:8px;letter-spacing:1px;">QR CLOTHING & ACCESSORIES</div>
        </div>
        <h1 style="margin:0 0 12px;font-size:26px;color:#111;">${escapeHtml(title)}</h1>
        ${intro ? `<p style="color:#555;line-height:1.7;margin:0 0 22px;">${escapeHtml(intro)}</p>` : ""}
        ${body}
        <div style="margin-top:30px;padding-top:18px;border-top:1px solid #eee;color:#777;font-size:13px;line-height:1.6;">
          ${escapeHtml(footer)}
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function otpEmailTemplate({
  title,
  intro,
  code,
  expiresMinutes = 10,
  warning,
}) {
  return brandedEmailTemplate({
    title,
    intro,
    body: `
      <div style="font-size:32px;font-weight:800;letter-spacing:6px;background:#f4f4f4;padding:18px;text-align:center;border-radius:12px;color:#111;">
        ${escapeHtml(code)}
      </div>
      <p style="color:#666;margin:20px 0 0;line-height:1.6;">
        This code expires in ${Number(expiresMinutes)} minutes.
      </p>
      ${warning ? `<p style="color:#777;margin:10px 0 0;line-height:1.6;">${escapeHtml(warning)}</p>` : ""}
    `,
  });
}
