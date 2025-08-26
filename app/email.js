// app/email.js
const { Resend } = require("resend");

const API_KEY = process.env.RESEND_API_KEY || "";
const FROM = process.env.MAIL_FROM || 'MiddleGround <onboarding@resend.dev>';
// Set EMAIL_MODE=log to skip sending and just console.log
const MODE = (process.env.EMAIL_MODE || "").toLowerCase(); // 'log' to disable sending

let resend = null;
if (API_KEY && MODE !== "log") {
  try {
    resend = new Resend(API_KEY);
  } catch (e) {
    console.warn("Resend init failed; falling back to log mode.", e?.message || e);
    resend = null;
  }
}

async function sendMail({ to, subject, html, text }) {
  // In dev or if no API key, just log so flow never breaks
  if (!resend) {
    console.log("\n--- EMAIL (log mode) ---\nTo:", to, "\nSubject:", subject, "\nText:", text, "\n---\n");
    return { ok: true, mode: "log" };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM, to, subject, html, text
    });
    if (error) {
      console.warn("Resend error:", typeof error === "object" ? JSON.stringify(error) : String(error));
      // Fallback to log so we don't block the app
      console.log("\n--- EMAIL (fallback log) ---\nTo:", to, "\nSubject:", subject, "\nText:", text, "\n---\n");
      return { ok: false, error };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    console.warn("Resend exception:", e?.message || e);
    console.log("\n--- EMAIL (exception fallback log) ---\nTo:", to, "\nSubject:", subject, "\nText:", text, "\n---\n");
    return { ok: false, error: e };
  }
}

module.exports = { sendMail };
