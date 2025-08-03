const express = require("express");
const app = express();

const port = 3000;
const hostname = "localhost";

app.get("/login.html", (req, res, next) => {
    console.log("log in");
    next();
});

app.get("/API Test/api.html", (req, res, next) => {
    console.log("Loading API test page");
    next();
});

app.use(express.static("public"));

app.use(express.json());

app.listen(port, hostname, () => {
    console.log(`Listening at: http://${hostname}:${port}`);
});