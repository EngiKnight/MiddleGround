// app/email.js
const os = require("os");

const FROM = process.env.FROM_EMAIL || `no-reply@${(process.env.PUBLIC_BASE_DOMAIN||"example.com")}`;

async function sendViaResend({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const payload = { from: FROM, to: [to], subject, html, text };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return true;
}

async function sendViaSMTP({ to, subject, html, text }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) return false;
  const nodemailer = require("nodemailer");
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
  await transport.sendMail({ from: FROM, to, subject, html, text });
  return true;
}

async function sendMail(opts) {
  if (process.env.RESEND_API_KEY) return sendViaResend(opts);
  if (process.env.SMTP_HOST) return sendViaSMTP(opts);
  console.log("\n--- EMAIL (dev) ---\nTO:", opts.to, "\nSUBJ:", opts.subject, "\n", (opts.text||"").slice(0, 400), "\n--------------\n");
  return true;
}

module.exports = { sendMail, FROM };
