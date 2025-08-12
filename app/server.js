const path = require("path");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "..", ".env") });

let foursquareUrl = "https://places-api.foursquare.com/places/search";

let keys = require("../env.json");
let foursquareKey = keys.foursquare;

let options = {
    method: "GET",
    headers: {
        accept: "application/json",
        "X-Places-Api-Version": "2025-06-17",
        "Authorization": `Bearer ${foursquareKey}`
    }
};

const { pool, query } = require("./db");

const app = express();
const isProd = process.env.NODE_ENV === "production";
if (isProd) app.set("trust proxy", 1); // trust reverse proxy in prod

const port = process.env.PORT || 3000;
const hostname = process.env.HOSTNAME || "localhost";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new pgSession({
    pool,
    tableName: "session"
  }),
  secret: process.env.SESSION_SECRET || "dev_secret_change_me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: "lax",
    secure: isProd // only send cookie over HTTPS in prod
  }
}));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Helpers
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

// API routes
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
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

// Example protected route
app.get("/api/protected", requireAuth, (req, res) => {
  res.json({ message: `Hello, ${req.session.user.username}!` });
});

app.get("/api/places", (req, res) => {
  let lat = req.query.lat;
  let long = req.query.long;

  fetch(foursquareUrl + `?ll=${lat},${long}&fields=categories,location,name`, options)
    .then(info => info.json())
    .then(info => {
      //console.log(info);
      return res.json(info);
    })
    .catch(err => console.log(err));
})

app.listen(port, hostname, () => {
  console.log(`Listening at: http://${hostname}:${port}`);
});
