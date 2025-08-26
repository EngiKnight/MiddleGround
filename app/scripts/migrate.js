// app/scripts/migrate.js
// Simple migration runner: executes SQL files in app/migrations in order.
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function run() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    process.stdout.write(`\n== Running ${f} ==\n`);
    await pool.query(sql);
  }
  await pool.end();
  console.log('\nAll migrations applied.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
