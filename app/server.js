// app/server.js
// MiddleGround server: meetings, invitations, locations, midpoint & venue suggestions, finalization.
// Stack: Node.js + Express + Postgres (Neon friendly) + Resend email + Foursquare Places API.
//
// ENV VARS (required/optional):
// - DATABASE_URL=postgres://user:pass@host/db (Neon connection string)
// - SESSION_SECRET=some-long-random
// - BASE_URL=https://your-domain.com (or http://localhost:3000 in dev)
// - RESEND_API_KEY=... (for emailing invitations/notifications)
// - MAIL_FROM="MiddleGround <team@yourdomain.com>"
// - FOURSQUARE_API_KEY=... (Places search)
// - HOST=0.0.0.0 (optional), PORT=3000 (optional)

const path = require("path");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs"); // still available if you later add auth
const crypto = require("crypto");
const child_process = require("child_process");

const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { pool, query } = require("./db");
const { sendMail } = require("./email");

const app = express();
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/,"");

// --- Foursquare setup ---
const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY || "";
const FOURSQUARE_SEARCH_URL = "https://api.foursquare.com/v3/places/search";

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isProd = process.env.NODE_ENV === "production";

app.use(
  session({
    store: new pgSession({
      pool, // Reuse PG pool
      tableName: "session",
      createTableIfMissing: true,
    }),
    name: "mg.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "lax",
      secure: isProd,
    },
  })
);

// Static
app.use(express.static(path.join(__dirname, "public")));

// Force "/" to index.html (start at main page)
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// ------------------------- DB HELPERS -------------------------
function toPoint(lat, lng) {
  return { lat: parseFloat(lat), lng: parseFloat(lng) };
}

async function findOrCreateUserByEmail(email, username) {
  if (!email) return null;
  const r = await query("SELECT id FROM users WHERE email=$1", [email.toLowerCase()]);
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

function isEmail(s) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

// ------------------------- MIGRATIONS NOTE -------------------------
// Run `npm run migrate` after updating env.DATABASE_URL

// ------------------------- MEETING FLOWS -------------------------

// Create a meeting + invites.
// Body: { title, ownerName, ownerEmail, venueType, radiusMeters?, invitees: "a@x.com, b@y.com" }
app.post("/api/meetings", async (req, res) => {
  try {
    const { title, ownerName, ownerEmail, venueType, radiusMeters, invitees } = req.body;

    if (!title || !ownerEmail || !isEmail(ownerEmail)) {
      return res.status(400).json({ error: "title and valid ownerEmail required" });
    }

    const radius = parseInt(radiusMeters || "3000", 10); // default 3km
    const owner = await findOrCreateUserByEmail(ownerEmail, ownerName);

    // Create meeting
    const m = await query(
      `INSERT INTO meetings (owner_user_id, title, venue_type, radius_meters, status)
       VALUES ($1,$2,$3,$4,'collecting') RETURNING id, title, venue_type, radius_meters`,
      [owner?.id, title, venueType || null, radius]
    );
    const meeting = m.rows[0];

    // Create invitations list (owner included with role='owner' so they get a token too)
    const emails = (invitees || "")
      .split(/[,\s;]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0 && isEmail(e));

    const all = [ownerEmail.toLowerCase(), ...emails.map((e) => e.toLowerCase())];

    const insertedInvites = [];
    for (let i = 0; i < all.length; i++) {
      const email = all[i];
      const role = i === 0 ? "owner" : "invitee";
      const tok = newToken();

      const ins = await query(
        `INSERT INTO invitations (meeting_id, email, invited_user_id, token, role, status)
         VALUES ($1,$2,$3,$4,$5,'pending')
         ON CONFLICT (meeting_id, email) DO UPDATE
           SET token = EXCLUDED.token, role = EXCLUDED.role
         RETURNING id, email, token, role`,
        [meeting.id, email, role === "owner" ? owner?.id : null, tok, role]
      );
      insertedInvites.push(ins.rows[0]);

      // send email
      const link = `${BASE_URL}/meet.html?mid=${meeting.id}&token=${ins.rows[0].token}&email=${encodeURIComponent(email)}`;
      await sendMail({
        to: email,
        subject: `You're invited to "${title}" on MiddleGround`,
        html: `
          <p>Hello${role === "owner" ? ` ${ownerName || ""}` : ""},</p>
          <p>You have an invitation to <strong>${title}</strong>.</p>
          <p>Please click below to confirm your location and see suggestions:</p>
          <p><a href="${link}">${link}</a></p>
          <p>Thanks,<br/>MiddleGround</p>
        `,
        text: `You're invited to "${title}". Open: ${link}`,
      });
    }

    res.json({
      meeting,
      invites: insertedInvites.map(({ email, role }) => ({ email, role })),
      ownerLink: `${BASE_URL}/meet.html?mid=${meeting.id}&token=${insertedInvites[0].token}&email=${encodeURIComponent(ownerEmail)}`,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

// Get meeting status (participants, locations, midpoint, suggestions if ready)
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
         FROM meeting_locations WHERE meeting_id=$1
         ORDER BY provided_at DESC`,
      [id]
    );

    const participants = inv.rows.map((r) => ({
      email: r.email,
      role: r.role,
      responded: !!r.responded_at || locs.rows.some((x) => x.email === r.email),
    }));

    // Compute midpoint if at least 2 locations exist
    let midpoint = null;
    if (locs.rows.length >= 2) {
      midpoint = computeGeographicMidpoint(locs.rows.map((r) => ({ lat: r.lat, lng: r.lng })));
    }

    res.json({ meeting, participants, locations: locs.rows, midpoint });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

// Submit a participant location (via token link or authenticated later)
// Body: { email, token, lat, lng }
app.post("/api/meetings/:id/location", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { email, token, lat, lng } = req.body;

    if (!email || !token || typeof lat === "undefined" || typeof lng === "undefined") {
      return res.status(400).json({ error: "email, token, lat, lng required" });
    }

    const inv = await query(
      `SELECT id, meeting_id, email, role, status, token
         FROM invitations
        WHERE meeting_id=$1 AND email=$2 AND token=$3`,
      [id, email.toLowerCase(), token]
    );
    if (!inv.rows[0]) return res.status(403).json({ error: "invalid invitation token" });
    if (inv.rows[0].status === "expired") return res.status(403).json({ error: "invitation expired" });

    // Upsert location by (meeting_id, email)
    await query(
      `INSERT INTO meeting_locations (meeting_id, email, lat, lng)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (meeting_id, email)
       DO UPDATE SET lat=EXCLUDED.lat, lng=EXCLUDED.lng, provided_at=NOW()`,
      [id, email.toLowerCase(), parseFloat(lat), parseFloat(lng)]
    );

    await query(
      `UPDATE invitations
          SET status='accepted', responded_at=NOW()
        WHERE id=$1 AND status='pending'`,
      [inv.rows[0].id]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

// Get venue suggestions once we have at least 2 locations
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
    if (locs.rows.length < 2) {
      return res.json({ ready: false, reason: "need at least two locations" });
    }

    const midpoint = computeGeographicMidpoint(locs.rows.map((r) => ({ lat: r.lat, lng: r.lng })));
    const venues = await searchFoursquare(midpoint, meeting.venue_type, meeting.radius_meters || 3000);

    res.json({ ready: true, midpoint, venues });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

// Finalize a venue (owner only via token). Body: { token, email, place }
app.post("/api/meetings/:id/finalize", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { token, email, place } = req.body;
    if (!token || !email || !place) return res.status(400).json({ error: "token, email, place required" });

    // Verify requester is the owner
    const inv = await query(
      `SELECT role FROM invitations WHERE meeting_id=$1 AND email=$2 AND token=$3`,
      [id, email.toLowerCase(), token]
    );
    if (!inv.rows[0]) return res.status(403).json({ error: "invalid token" });
    if (inv.rows[0].role !== "owner") return res.status(403).json({ error: "only owner can finalize" });

    const updated = await query(
      `UPDATE meetings
          SET status='finalized',
              finalized_place_json=$2
        WHERE id=$1
        RETURNING id, title, venue_type, radius_meters, finalized_place_json`,
      [id, JSON.stringify(place)]
    );
    const meeting = updated.rows[0];

    // Email all participants
    const parts = await query(`SELECT email FROM invitations WHERE meeting_id=$1`, [id]);
    const mapLink = googleMapsPlaceLinkFromFoursquare(place);

    await Promise.all(
      parts.rows.map((r) =>
        sendMail({
          to: r.email,
          subject: `Finalized: ${meeting.title}`,
          html: `
            <p>The meeting <strong>${meeting.title}</strong> is finalized.</p>
            <p>Meet at: <strong>${escapeHtml(place.name || "")}</strong><br/>
            ${escapeHtml((place.location && place.location.formatted_address) || "")}</p>
            ${mapLink ? `<p><a href="${mapLink}">Open in Google Maps</a></p>` : ""}
            <p>See details: <a href="${BASE_URL}/meet.html?mid=${meeting.id}">${BASE_URL}/meet.html?mid=${meeting.id}</a></p>
          `,
          text: `Finalized: ${meeting.title}\n${place.name}\n${(place.location && place.location.formatted_address) || ""}\nLink: ${mapLink || ""}`,
        })
      )
    );

    res.json({ ok: true, meeting });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal server error" });
  }
});

// ------------------------- FOURSQUARE HELPERS -------------------------
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
  const key = (type || "").toLowerCase().trim();
  return VENUE_QUERIES[key] || key || VENUE_QUERIES.default;
}

async function searchFoursquare({ lat, lng }, venueType, radiusMeters) {
  if (!FOURSQUARE_API_KEY) {
    return [];
  }
  const query = venueQueryFor(venueType);
  const url = new URL(FOURSQUARE_SEARCH_URL);
  url.searchParams.set("ll", `${lat},${lng}`);
  url.searchParams.set("radius", String(radiusMeters || 3000));
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "15");

  const resp = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "Authorization": FOURSQUARE_API_KEY,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error("Foursquare error", resp.status, text);
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
    distance: r.distance, // meters
  }));
}

function googleMapsPlaceLinkFromFoursquare(place) {
  try {
    const name = encodeURIComponent(place.name || "");
    const addr = encodeURIComponent((place.location && place.location.formatted_address) || "");
    return `https://www.google.com/maps/search/?api=1&query=${name}%20${addr}`;
  } catch {
    return null;
  }
}

// ------------------------- GEO -------------------------
function computeGeographicMidpoint(points) {
  // points: [{lat,lng}]
  // Convert to Cartesian, average, then back.
  let x = 0, y = 0, z = 0;
  for (const p of points) {
    const lat = toRadians(p.lat);
    const lon = toRadians(p.lng);
    x += Math.cos(lat) * Math.cos(lon);
    y += Math.cos(lat) * Math.sin(lon);
    z += Math.sin(lat);
  }
  const total = points.length;
  x /= total; y /= total; z /= total;

  const lon = Math.atan2(y, x);
  const hyp = Math.sqrt(x*x + y*y);
  const lat = Math.atan2(z, hyp);

  return { lat: toDegrees(lat), lng: toDegrees(lon) };
}
function toRadians(d) { return (d * Math.PI) / 180; }
function toDegrees(r) { return (r * 180) / Math.PI; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

// ------------------------- START -------------------------
app.listen(port, hostname, () => {
  const localUrl = `http://localhost:${port}`;
  console.log(`MiddleGround listening at ${hostname}:${port}`);
  console.log(`Open ${localUrl} in your browser`);

  // Auto-open the index page in development (set OPEN_BROWSER=0 to skip)
  const openOnStart = (process.env.OPEN_BROWSER || "1") !== "0";
  if (!isProd && openOnStart) {
    const url = `${localUrl}/`;
    const cmd = process.platform === "win32" ? "start" :
                process.platform === "darwin" ? "open" : "xdg-open";
    try {
      child_process.exec(`${cmd} "${url}"`);
    } catch {
      /* ignore if opening fails */
    }
  }
});
