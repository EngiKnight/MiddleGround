// app/db.js
const { Pool } = require('pg');

const isLocal = () => {
  const url = process.env.DATABASE_URL || '';
  return url.includes('localhost') || url.includes('127.0.0.1');
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Most cloud Postgres providers (Neon, etc.) require SSL.
  // Local Postgres typically doesn't use SSL.
  ssl: isLocal() ? false : { rejectUnauthorized: false },
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
