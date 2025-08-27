// app/server.js
// MiddleGround server: auth + meetings + suggestions + safe email sending.

const path = require("path");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const child_process = require("child_process");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { pool, query } = require("./db");
const { sendMail } = require("./email");

const app = express();
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${port}`).replace(
  /\/+$/,
  ""
);
const isProd = process.env.NODE_ENV === "production";

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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    name: "mg.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
      secure: isProd,
    },
  })
);

// Static & root
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// ------------------------- AUTH -------------------------
function isEmail(s) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || ""));
}

async function getUserById(id) {
  const r = await query("SELECT id, username, email FROM users WHERE id=$1", [
    id,
  ]);
  return r.rows[0] || null;
}

app.post("/api/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password || !isEmail(email)) {
      return res
        .status(400)
        .json({ error: "username, valid email, and password are required" });
    }
    const dupe = await query("SELECT 1 FROM users WHERE email=$1", [
      email.toLowerCase(),
    ]);
    if (dupe.rowCount)
      return res.status(409).json({ error: "email already registered" });

    const hash = await bcrypt.hash(password, 10);
    const ins = await query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1,$2,$3) RETURNING id, username, email",
      [username, email.toLowerCase(), hash]
    );
    req.session.userId = ins.rows[0].id;
    res.json({ user: ins.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

// Login by email OR username
app.post("/api/login", async (req, res) => {
  try {
    const { identifier, email, username, password } = req.body;
    const id = (identifier || email || username || "").trim();
    if (!id || !password) {
      return res
        .status(400)
        .json({ error: "valid email/username and password required" });
    }

    let r;
    if (isEmail(id)) {
      r = await query(
        "SELECT id, username, email, password_hash FROM users WHERE email=$1",
        [id.toLowerCase()]
      );
    } else {
      r = await query(
        "SELECT id, username, email, password_hash FROM users WHERE LOWER(username)=LOWER($1)",
        [id]
      );
    }
    const u = r.rows[0];
    if (!u) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    req.session.userId = u.id;
    res.json({ user: { id: u.id, username: u.username, email: u.email } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

app.post("/api/logout", async (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const u = await getUserById(req.session.userId);
  res.json({ user: u || null });
});

// ==================== FOURSQUARE ROUTE ====================
app.get("/api/places", (req, res) => {
  const lat = req.query.lat;
  const long = req.query.long;
  const radius = req.query.radius || 3000; // Default to 3000 meters if no radius specified

  doFetch(
    `${foursquareUrl}?ll=${lat},${long}&radius=${radius}&fields=categories,location,name,distance,latitude,longitude,website,tel`,
    options
  )
    .then((info) => info.json())
    .then((info) => res.json(info))
    .catch((err) => {
      console.error("Foursquare error:", err);
      res.status(500).json({ error: "foursquare request failed" });
    });
});

// If Node < 18, provide a fetch fallback (also used by Resend in email.js if needed)
async function doFetch(url, opts) {
  if (typeof fetch === "function") return fetch(url, opts);
  const nf = await import("node-fetch"); // npm i node-fetch if needed
  return nf.default(url, opts);
}

// ------------------------- MEETING HELPERS -------------------------
async function findOrCreateUserByEmail(email, username) {
  if (!email) return null;
  const r = await query("SELECT id FROM users WHERE email=$1", [
    email.toLowerCase(),
  ]);
  if (r.rows[0]) return r.rows[0];
  const uname = username || email.split("@")[0];
  const pass = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10);
  const ins = await query(
    "INSERT INTO users (username, email, password_hash) VALUES ($1,$2,$3) RETURNING id",
    [uname, email.toLowerCase(), pass]
  );
  return ins.rows[0];
}

function newToken() {
  return crypto.randomBytes(24).toString("base64url");
}

const VENUE_QUERIES = {
  cafe: "cafe",
  coffee: "coffee",
  restaurant: "restaurant",
  brunch: "brunch",
  dinner: "restaurant",
  bar: "bar",
  park: "park",
  museum: "museum",
  library: "library",
  mall: "shopping mall",
  gym: "gym",
  default: "restaurant",
};
function venueQueryFor(type) {
  if (!type) return VENUE_QUERIES.default;
  const key = String(type || "")
    .toLowerCase()
    .trim();
  return VENUE_QUERIES[key] || key || VENUE_QUERIES.default;
}

async function searchFoursquare({ lat, lng }, venueType, radiusMeters) {
  if (!FOURSQUARE_API_KEY) return [];
  const url = new URL(FOURSQUARE_SEARCH_URL);
  url.searchParams.set("ll", `${lat},${lng}`);
  url.searchParams.set("radius", String(radiusMeters || 3000));
  url.searchParams.set("query", venueQueryFor(venueType));
  url.searchParams.set("limit", "15");
  const resp = await fetch(url.toString(), {
    headers: { Accept: "application/json", Authorization: FOURSQUARE_API_KEY },
  });
  if (!resp.ok) {
    console.error("Foursquare", resp.status, await resp.text());
    return [];
  }
  const data = await resp.json();
  return (data.results || []).map((r) => ({
    id: r.fsq_id,
    name: r.name,
    location: {
      address: r.location.address,
      locality: r.location.locality,
      region: r.location.region,
      country: r.location.country,
      formatted_address: r.location.formatted_address,
      lat: r.geocodes?.main?.latitude,
      lng: r.geocodes?.main?.longitude,
    },
    categories: r.categories?.map((c) => c.name) || [],
    distance: r.distance,
  }));
}

function googleMapsPlaceLinkFromFoursquare(place) {
  try {
    const name = encodeURIComponent(place.name || "");
    const addr = encodeURIComponent(place.location?.formatted_address || "");
    return `https://www.google.com/maps/search/?api=1&query=${name}%20${addr}`;
  } catch {
    return null;
  }
}
function computeGeographicMidpoint(points) {
  let x = 0,
    y = 0,
    z = 0;
  for (const p of points) {
    const lat = (p.lat * Math.PI) / 180;
    const lon = (p.lng * Math.PI) / 180;
    x += Math.cos(lat) * Math.cos(lon);
    y += Math.cos(lat) * Math.sin(lon);
    z += Math.sin(lat);
  }
  x /= points.length;
  y /= points.length;
  z /= points.length;
  const lon = Math.atan2(y, x);
  const hyp = Math.sqrt(x * x + y * y);
  const lat = Math.atan2(z, hyp);
  return { lat: (lat * 180) / Math.PI, lng: (lon * 180) / Math.PI };
}
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]
  );
}

// ------------------------- MEETING ROUTES -------------------------

// Create meeting + invites (email sending is non-blocking; won't 500 on email issues)
app.post("/api/meetings", async (req, res) => {
  try {
    const { title, ownerName, ownerEmail, venueType, radiusMeters, invitees } =
      req.body;
    if (!title || !ownerEmail || !isEmail(ownerEmail)) {
      return res
        .status(400)
        .json({ error: "title and valid ownerEmail required" });
    }
    const radius = parseInt(radiusMeters || "3000", 10);
    const owner = await findOrCreateUserByEmail(ownerEmail, ownerName);

    const m = await query(
      `INSERT INTO meetings (owner_user_id, title, venue_type, radius_meters, status)
       VALUES ($1,$2,$3,$4,'collecting')
       RETURNING id, title, venue_type, radius_meters`,
      [owner?.id, title, venueType || null, radius]
    );
    const meeting = m.rows[0];

    // parse invite emails
    const emails = (invitees || "")
      .split(/[,\s;]+/)
      .map((e) => e.trim())
      .filter((e) => e && isEmail(e));

    const all = [
      ownerEmail.toLowerCase(),
      ...emails.map((e) => e.toLowerCase()),
    ];

    const insertedInvites = [];
    for (let i = 0; i < all.length; i++) {
      const email = all[i];
      const role = i === 0 ? "owner" : "invitee";
      const tok = newToken();
      const ins = await query(
        `INSERT INTO invitations (meeting_id, email, invited_user_id, token, role, status)
         VALUES ($1,$2,$3,$4,$5,'pending')
         ON CONFLICT (meeting_id, email)
         DO UPDATE SET token = EXCLUDED.token, role = EXCLUDED.role
         RETURNING id, email, token, role`,
        [meeting.id, email, role === "owner" ? owner?.id : null, tok, role]
      );
      insertedInvites.push(ins.rows[0]);

      const link = `${BASE_URL}/meet.html?mid=${meeting.id}&token=${ins.rows[0].token}&email=${encodeURIComponent(email)}`;

      // Send invite email, but NEVER throw if sending fails
      try {
        const mail = await sendMail({
          to: email,
          subject: `You're invited to "${title}" on MiddleGround`,
          html: `
            <p>Hello${role === "owner" ? ` ${escapeHtml(ownerName || "")}` : ""},</p>
            <p>You have an invitation to <strong>${escapeHtml(title)}</strong>.</p>
            <p>Please click below to confirm your location and see suggestions:</p>
            <p><a href="${link}">${link}</a></p>
            <p>Thanks,<br/>MiddleGround</p>
          `,
          text: `You're invited to "${title}". Open: ${link}`,
        });
        if (!mail?.ok) console.warn("Invite email not sent for", email);
      } catch (e) {
        console.warn("Invite email exception for", email, e?.message || e);
      }
    }

    res.json({
      meeting,
      invites: insertedInvites.map(({ email, role }) => ({ email, role })),
      ownerLink: `${BASE_URL}/meet.html?mid=${meeting.id}&token=${insertedInvites[0].token}&email=${encodeURIComponent(all[0])}`,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

// Meeting status
app.get("/api/meetings/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const m = await query(
      `SELECT id, title, venue_type, radius_meters, status, finalized_place_json
       FROM meetings WHERE id=$1`,
      [id]
    );
    if (!m.rows[0]) return res.status(404).json({ error: "not found" });
    const meeting = m.rows[0];

    const inv = await query(
      `SELECT email, role, status, token, responded_at
       FROM invitations WHERE meeting_id=$1 ORDER BY role DESC, email ASC`,
      [id]
    );
    const locs = await query(
      `SELECT email, user_id, lat, lng, provided_at
       FROM meeting_locations WHERE meeting_id=$1 ORDER BY provided_at DESC`,
      [id]
    );

    const participants = inv.rows.map((r) => ({
      email: r.email,
      role: r.role,
      responded: !!r.responded_at || locs.rows.some((x) => x.email === r.email),
    }));

    let midpoint = null;
    if (locs.rows.length >= 2) {
      midpoint = computeGeographicMidpoint(
        locs.rows.map((r) => ({ lat: r.lat, lng: r.lng }))
      );
    }

    res.json({ meeting, participants, locations: locs.rows, midpoint });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

// Submit participant location
app.post("/api/meetings/:id/location", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { email, token, lat, lng } = req.body;
    if (
      !email ||
      !token ||
      typeof lat === "undefined" ||
      typeof lng === "undefined"
    ) {
      return res.status(400).json({ error: "email, token, lat, lng required" });
    }
    const inv = await query(
      `SELECT id, status FROM invitations WHERE meeting_id=$1 AND email=$2 AND token=$3`,
      [id, email.toLowerCase(), token]
    );
    if (!inv.rows[0])
      return res.status(403).json({ error: "invalid invitation token" });
    if (inv.rows[0].status === "expired")
      return res.status(403).json({ error: "invitation expired" });

    await query(
      `INSERT INTO meeting_locations (meeting_id, email, lat, lng)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (meeting_id, email)
       DO UPDATE SET lat=EXCLUDED.lat, lng=EXCLUDED.lng, provided_at=NOW()`,
      [id, email.toLowerCase(), parseFloat(lat), parseFloat(lng)]
    );

    await query(
      `UPDATE invitations SET status='accepted', responded_at=NOW()
       WHERE id=$1 AND status='pending'`,
      [inv.rows[0].id]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

// Suggestions (require at least two locations)
app.get("/api/meetings/:id/suggestions", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const m = await query(
      `SELECT id, title, venue_type, radius_meters, status
       FROM meetings WHERE id=$1`,
      [id]
    );
    if (!m.rows[0]) return res.status(404).json({ error: "not found" });
    const meeting = m.rows[0];

    const locs = await query(
      `SELECT lat, lng FROM meeting_locations WHERE meeting_id=$1`,
      [id]
    );
    if (locs.rows.length < 2)
      return res.json({ ready: false, reason: "need at least two locations" });

    const midpoint = computeGeographicMidpoint(
      locs.rows.map((r) => ({ lat: r.lat, lng: r.lng }))
    );
    const venues = await searchFoursquare(
      midpoint,
      meeting.venue_type,
      meeting.radius_meters || 3000
    );
    res.json({ ready: true, midpoint, venues });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

// Finalize venue (owner only) — emails are best-effort
app.post("/api/meetings/:id/finalize", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { token, email, place } = req.body;
    if (!token || !email || !place)
      return res.status(400).json({ error: "token, email, place required" });

    const inv = await query(
      `SELECT role FROM invitations WHERE meeting_id=$1 AND email=$2 AND token=$3`,
      [id, email.toLowerCase(), token]
    );
    if (!inv.rows[0]) return res.status(403).json({ error: "invalid token" });
    if (inv.rows[0].role !== "owner")
      return res.status(403).json({ error: "only owner can finalize" });

    const updated = await query(
      `UPDATE meetings
         SET status='finalized',
             finalized_place_json=$2
       WHERE id=$1
       RETURNING id, title, venue_type, radius_meters, finalized_place_json`,
      [id, JSON.stringify(place)]
    );
    const meeting = updated.rows[0];

    const parts = await query(
      `SELECT email FROM invitations WHERE meeting_id=$1`,
      [id]
    );
    const mapLink = googleMapsPlaceLinkFromFoursquare(place);

    // Try to email everyone; log failures but don't fail the API
    try {
      await Promise.all(
        parts.rows.map((r) =>
          sendMail({
            to: r.email,
            subject: `Finalized: ${meeting.title}`,
            html: `
              <p>The meeting <strong>${escapeHtml(meeting.title)}</strong> is finalized.</p>
              <p>Meet at: <strong>${escapeHtml(place.name || "")}</strong><br/>
              ${escapeHtml(place.location?.formatted_address || "")}</p>
              ${mapLink ? `<p><a href="${mapLink}">Open in Google Maps</a></p>` : ""}
              <p>Details: <a href="${BASE_URL}/meet.html?mid=${meeting.id}">${BASE_URL}/meet.html?mid=${meeting.id}</a></p>
            `,
            text: `Finalized: ${meeting.title}\n${place.name}\n${place.location?.formatted_address || ""}\n${mapLink || ""}`,
          }).catch((e) =>
            console.warn("Finalize email failed for", r.email, e?.message || e)
          )
        )
      );
    } catch (e) {
      console.warn("Finalize bulk email issue:", e?.message || e);
    }

    res.json({ ok: true, meeting });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

// ------------------------- START -------------------------
app.listen(port, hostname, () => {
  const localUrl = `http://localhost:${port}`;
  console.log(`MiddleGround listening at ${hostname}:${port}`);
  console.log(`Open ${localUrl}/index.html in your browser`);
  const openOnStart = (process.env.OPEN_BROWSER || "1") !== "0";
  if (!isProd && openOnStart) {
    const cmd =
      process.platform === "win32"
        ? "start"
        : process.platform === "darwin"
          ? "open"
          : "xdg-open";
    try {
      child_process.exec(`${cmd} "${localUrl}/index.html"`);
    } catch {}
  }
});
