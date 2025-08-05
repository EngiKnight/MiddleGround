const express = require("express");
const session = require("express-session");
require("dotenv").config();

const app = express();
const port = 3000;
const hostname = "localhost";

// ===== Middleware =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(session({
    secret: process.env.SESSION_SECRET || "defaultSecret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// ===== Routes =====
const authRoutes = require('./auth');
app.use('/auth', authRoutes);

// ===== Original Routes =====
app.get("/login.html", (req, res, next) => {
    console.log("log in");
    next();
});

app.get("/API Test/api.html", (req, res, next) => {
    console.log("Loading API test page");
    next();
});

// ===== Start Server =====
app.listen(port, hostname, () => {
    console.log(`Listening at: http://${hostname}:${port}`);
});
