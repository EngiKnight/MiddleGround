// app/email.js
// Tiny mail helper: Resend (preferred) -> SMTP -> dev log

// Use global fetch if Node >= 18; else fall back to node-fetch or undici
async function doFetch(url, options) {
  if (typeof fetch === "function") return fetch(url, options);
  try {
    const nf = await import("node-fetch");      // npm i node-fetch (if needed)
    return nf.default(url, options);
  } catch {
    const { fetch: undiciFetch } = require("undici"); // npm i undici (if needed)
    return undiciFetch(url, options);
  }
}

// Read FROM dynamically so it reflects current env
const getFrom = () =>
  process.env.FROM_EMAIL ||
  "onboarding@resend.dev"; // works for dev without verifying a domain

async function sendViaResend({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const payload = { from: getFrom(), to: [to], subject, html, text };
  const r = await doFetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const bodyText = await r.text();
  if (!r.ok) {
    console.error("Resend error:", r.status, bodyText);
    throw new Error(`Resend ${r.status}: ${bodyText.slice(0, 500)}`);
  }
  return true;
}

async function sendViaSMTP({ to, subject, html, text }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) return false;
  const nodemailer = require("nodemailer"); // npm i nodemailer (only if using SMTP)
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
  await transport.sendMail({ from: getFrom(), to, subject, html, text });
  return true;
}

async function sendMail(opts) {
  if (process.env.RESEND_API_KEY) return sendViaResend(opts);
  if (process.env.SMTP_HOST) return sendViaSMTP(opts);
  // Dev fallback (no send)
  console.log("\n--- EMAIL (dev) ---\nTO:", opts.to, "\nSUBJ:", opts.subject, "\n", (opts.text||"").slice(0, 400), "\n--------------\n");
  return true;
}

module.exports = { sendMail };
