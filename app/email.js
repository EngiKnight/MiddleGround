// app/email.js
// Sends email via: Resend (if RESEND_API_KEY) -> SMTP/Nodemailer (if SMTP_*) -> console log (dev)

// ---------- fetch helper (Node 18+ has global fetch) ----------
async function doFetch(url, options) {
  if (typeof fetch === "function") return fetch(url, options);
  try {
    const nf = await import("node-fetch");     // npm i node-fetch (only if Node < 18)
    return nf.default(url, options);
  } catch {
    const { fetch: undiciFetch } = require("undici"); // npm i undici (fallback)
    return undiciFetch(url, options);
  }
}

// ---------- env helpers ----------
const getFrom = () => process.env.FROM_EMAIL || "onboarding@resend.dev";

// ---------- Resend sender ----------
async function sendViaResend({ to, subject, html, text, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;

  const payload = {
    from: getFrom(),
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    ...(replyTo ? { reply_to: Array.isArray(replyTo) ? replyTo : [replyTo] } : {})
  };

  const r = await doFetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await r.text();
  if (!r.ok) {
    // Surface helpful details for sandbox / domain issues
    console.error("Resend error:", r.status, bodyText);
    throw new Error(`Resend ${r.status}: ${bodyText.slice(0, 800)}`);
  }
  return true;
}

// ---------- SMTP/Nodemailer sender ----------
async function sendViaSMTP({ to, subject, html, text, replyTo }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) return false;

  const nodemailer = require("nodemailer"); // npm i nodemailer
  const port = Number(SMTP_PORT || 587);
  const secure = port === 465; // 465 = implicit TLS; 587 = STARTTLS

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  await transporter.sendMail({
    from: getFrom(),
    to,
    subject,
    text,
    html,
    ...(replyTo ? { replyTo } : {}),
  });

  return true;
}

// ---------- Public API ----------
async function sendMail(opts) {
  // Try Resend first (if configured)
  if (process.env.RESEND_API_KEY) {
    try { return await sendViaResend(opts); }
    catch (e) {
      // If Resend blocks (e.g., sandbox), fall back to SMTP if available
      console.warn("[email] Resend failed; attempting SMTP fallback:", e.message);
    }
  }

  // Try SMTP next
  if (process.env.SMTP_HOST) {
    try { return await sendViaSMTP(opts); }
    catch (e) {
      console.error("[email] SMTP failed:", e.message);
    }
  }

  // Dev fallback: just log
  console.log(
    "\n--- EMAIL (dev fallback) ---\nTO:",
    opts.to,
    "\nSUBJ:",
    opts.subject,
    "\nTEXT:\n",
    (opts.text || "").slice(0, 1200),
    "\nHTML (truncated):\n",
    (opts.html || "").slice(0, 1200),
    "\n----------------------------\n"
  );
  return true;
}

module.exports = { sendMail };
