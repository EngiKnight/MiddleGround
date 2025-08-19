// app/server.js (clean: auth + Foursquare + meetings/invites email)
const path = require("path");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const crypto = require("crypto");
const { sendMail } = require("./email");
const { pool, query } = require("./db");

// ---- Foursquare setup (from your main) ----
const foursquareUrl = "https://places-api.foursquare.com/places/search";
const keys = require("../env.json");
const foursquareKey = keys.foursquare;
const options = {
  method: "GET",
  headers: {
    accept: "application/json",
    "X-Places-Api-Version": "2025-06-17",
    Authorization: `Bearer ${foursquareKey}`,
  },
};

// If Node < 18, provide a fetch fallback (also used by Resend in email.js if needed)
async function doFetch(url, opts) {
  if (typeof fetch === "function") return fetch(url, opts);
  const nf = await import("node-fetch"); // npm i node-fetch if needed
  return nf.default(url, opts);
}

const app = express();
const isProd = process.env.NODE_ENV === "production";
if (isProd) app.set("trust proxy", 1); // trust reverse proxy in prod

const port = process.env.PORT || 3000;
const hostname = process.env.HOSTNAME || "localhost";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: "session",
    }),
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "lax",
      secure: isProd, // only send cookie over HTTPS in prod
    },
  })
);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Helpers
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
  next();
}

// ---- helpers for invite emails ----
function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] ?? req.protocol) || "http";
  return `${proto}://${req.get("host")}`;
}
function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ==================== AUTH ROUTES ====================
app.post("/api/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }
    const pw = String(password);
    if (pw.length < 8) {
      return res.status(400).json({ error: "password must be at least 8 characters" });
    }
    const hash = await bcrypt.hash(pw, 12);
    const result = await query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at",
      [username, email || null, hash]
    );
    const user = result.rows[0];
    req.session.user = { id: user.id, username: user.username, email: user.email };
    res.status(201).json({ user: req.session.user });
  } catch (err) {
    if (err && err.code === "23505") {
      return res.status(409).json({ error: "username or email already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }
    const result = await query(
      "SELECT id, username, email, password_hash FROM users WHERE username = $1",
      [username]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    const user = result.rows[0];
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    req.session.user = { id: user.id, username: user.username, email: user.email };
    res.json({ user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.get("/api/protected", requireAuth, (req, res) => {
  res.json({ message: `Hello, ${req.session.user.username}!` });
});

// ==================== FOURSQUARE ROUTE ====================
app.get("/api/places", (req, res) => {
  const lat = req.query.lat;
  const long = req.query.long;

  doFetch(
    `${foursquareUrl}?ll=${lat},${long}&fields=categories,location,name,distance,latitude,longitude,website,tel`,
    options
  )
    .then((info) => info.json())
    .then((info) => res.json(info))
    .catch((err) => {
      console.error("Foursquare error:", err);
      res.status(500).json({ error: "foursquare request failed" });
    });
});

// ==================== MEETINGS & INVITES ====================

// Create a meeting (owner = current user)
app.post("/api/meetings", requireAuth, async (req, res) => {
  try {
    const { title, venueType } = req.body || {};
    if (!title) return res.status(400).json({ error: "title is required" });

    const r = await query(
      `INSERT INTO meetings (owner_user_id, title, venue_type)
       VALUES ($1, $2, $3)
       RETURNING id, owner_user_id, title, venue_type, created_at`,
      [req.session.user.id, title, venueType || null]
    );

    res.status(201).json({ meeting: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

// Invite someone by email to a meeting
app.post("/api/meetings/:id/invite", requireAuth, async (req, res) => {
  try {
    const meetingId = Number(req.params.id);
    const { email } = req.body || {};
    if (!meetingId || !email) {
      return res.status(400).json({ error: "meeting id and email are required" });
    }

    // Only the owner can invite
    const ow = await query(`SELECT owner_user_id, title FROM meetings WHERE id = $1`, [meetingId]);
    if (ow.rowCount === 0) return res.status(404).json({ error: "meeting not found" });
    if (ow.rows[0].owner_user_id !== req.session.user.id) {
      return res.status(403).json({ error: "forbidden" });
    }

    const owner = req.session.user;
    const title = ow.rows[0].title;

    // If the email belongs to an existing user, link it
    const u = await query(`SELECT id, email, username FROM users WHERE email = $1`, [email]);
    const invitedUserId = u.rowCount ? u.rows[0].id : null;

    // Upsert one active invite per meeting/email
    const token = crypto.randomBytes(32).toString("hex");
    const up = await query(
      `INSERT INTO invitations (meeting_id, email, invited_user_id, token, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (meeting_id, email)
       DO UPDATE SET token = EXCLUDED.token, status = 'pending', sent_at = NOW(), invited_user_id = EXCLUDED.invited_user_id
       RETURNING id, token`,
      [meetingId, email, invitedUserId, token]
    );

    // Email invite
    const acceptLink = `${baseUrl(req)}/api/invitations/accept?token=${encodeURIComponent(up.rows[0].token)}`;
    const text = [
      `You've been invited to join the meeting "${title}" on Middle Ground.`,
      ``,
      `From: ${owner.username}${owner.email ? ` <${owner.email}>` : ""}`,
      `Accept: ${acceptLink}`,
      ``,
      `If you don't have an account yet, you can sign up after clicking the link.`,
    ].join("\n");

    const html = `
      <p>You've been invited to join the meeting "<b>${escapeHtml(title)}</b>" on Middle Ground.</p>
      <p>From: ${escapeHtml(owner.username)}${owner.email ? ` &lt;${escapeHtml(owner.email)}&gt;` : ""}</p>
      <p><a href="${acceptLink}">Accept invitation</a></p>
      <p>If you don't have an account yet, you can sign up after clicking the link.</p>
    `;

    await sendMail({ to: email, subject: `You're invited: ${title} — Middle Ground`, text, html });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

// Accept invitation by token
app.get("/api/invitations/accept", async (req, res) => {
  try {
    const { token } = req.query || {};
    if (!token) return res.status(400).send("Missing token");

    const r = await query(
      `SELECT i.id, i.meeting_id, i.email, i.invited_user_id, i.status, i.expires_at,
              m.title, m.owner_user_id
       FROM invitations i
       JOIN meetings m ON m.id = i.meeting_id
       WHERE i.token = $1`,
      [token]
    );
    if (r.rowCount === 0) return res.status(404).send("Invalid token");
    const inv = r.rows[0];
    if (inv.status !== "pending") return res.status(400).send("Invitation already handled");
    if (new Date(inv.expires_at) < new Date()) return res.status(400).send("Invitation expired");

    // If logged in, add them as a participant
    if (req.session && req.session.user) {
      await query(
        `INSERT INTO meeting_participants (meeting_id, user_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [inv.meeting_id, req.session.user.id]
      );
    }

    // Mark as accepted
    await query(
      `UPDATE invitations SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
      [inv.id]
    );

    // Optional: notify owner that someone accepted
    const owner = await query(`SELECT email, username FROM users WHERE id = $1`, [inv.owner_user_id]);
    const ownerEmail = owner.rows?.[0]?.email;
    if (ownerEmail) {
      const subject = `Invitation accepted: ${inv.title}`;
      const text = `Your invitation to ${inv.email} for "${inv.title}" was accepted.`;
      await sendMail({ to: ownerEmail, subject, text, html: `<p>${escapeHtml(text)}</p>` }).catch(() => {});
    }

    res.redirect("/");
  } catch (e) {
    console.error(e);
    res.status(500).send("Server error");
  }
});

// List my invitations (by my account email)
app.get("/api/my/invitations", requireAuth, async (req, res) => {
  try {
    const email = req.session.user.email;
    if (!email) return res.json({ invitations: [] });
    const r = await query(
      `SELECT id, meeting_id, email, status, sent_at, responded_at, expires_at
       FROM invitations WHERE email = $1
       ORDER BY sent_at DESC`,
      [email]
    );
    res.json({ invitations: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});
// ==================== END MEETINGS & INVITES ====================

app.listen(port, hostname, () => {
  console.log(`Listening at: http://${hostname}:${port}`);
});
