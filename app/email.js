// app/email.js
// Email sending via Resend (preferred). Fallback logs to console in development.

function fromAddress() {
  return process.env.MAIL_FROM || "MiddleGround <no-reply@middleground.local>";
}

async function sendViaResend({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");
  // Use global fetch (Node 18+)
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    })
  });
  if (!resp.ok) {
    const body = await resp.text();
    console.error("Resend error:", resp.status, body);
    throw new Error(`Resend failed: ${resp.status}`);
  }
  return true;
}

async function sendMail(opts) {
  if (process.env.RESEND_API_KEY) {
    return sendViaResend(opts);
  }
  // Fallback: log only
  console.log("\n--- EMAIL (dev) ---");
  console.log("From:", fromAddress());
  console.log("To:", opts.to);
  console.log("Subject:", opts.subject);
  console.log("Text:", (opts.text || "").slice(0, 400));
  console.log("--------------\n");
  return true;
}

module.exports = { sendMail };
