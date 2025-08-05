const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const app = express();

let env = require("../env.json");

const port = 3000;
const hostname = "localhost";

let pool = new Pool(env);
pool.connect().then(() => {
  console.log("Connected to database");
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Error acquiring client:', err.stack);
        return;
    }
    console.log('Connected to database');
    release();
});

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/signup.html", (req, res, next) => {
    console.log("sign up");
    next();
});

app.get("/login.html", (req, res, next) => {
    console.log("log in");
    next();
});

app.get("/API Test/api.html", (req, res, next) => {
    console.log("Loading API test page");
    next();
});

app.post("/api/register", async (req, res) => {
    try {
        const { fname, lname, email, pwd } = req.body;
        
        if (!fname || !lname || !email || !pwd) {
            return res.status(400).json({ 
                error: "All fields except location are required" 
            });
        }

        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1', 
            [email]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ 
                error: "User with this email already exists" 
            });
        }

        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(pwd, saltRounds);

        const result = await pool.query(
            'INSERT INTO users (first_name, last_name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, first_name, last_name, email',
            [fname, lname, email, passwordHash]
        );

        const newUser = result.rows[0];
        
        res.status(201).json({
            message: "User created successfully",
            user: {
                id: newUser.id,
                firstName: newUser.first_name,
                lastName: newUser.last_name,
                email: newUser.email,
                createdAt: newUser.created_at
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            error: "Internal server error" 
        });
    }
});

process.on('SIGINT', () => {
    console.log('Shutting down');
    pool.end(() => {
        console.log('Pool has ended');
        process.exit(0);
    });
});

app.listen(port, hostname, () => {
    console.log(`Listening at: http://${hostname}:${port}`);
});
