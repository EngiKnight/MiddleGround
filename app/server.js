const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const port = 3000;
const hostname = "localhost";

// ===== MongoDB Connection =====
mongoose.connect(process.env.MONGO_URI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
}).then(() => console.log("MongoDB connected"))
.catch(err => console.error("MongoDB connection error:", err));

// ===== Middleware =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// ===== Routes =====
const authRoutes = require('./auth');
app.use('/auth', authRoutes);

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
