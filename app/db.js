// app/db.js
const { Pool } = require('pg');

const isLocal = () => {
  const url = process.env.DATABASE_URL || '';
  return url.includes('localhost') || url.includes('127.0.0.1');
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal() ? false : { rejectUnauthorized: false }, // Neon requires SSL
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
