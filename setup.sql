\c middleground

-- use this to clear any existing tables to reinsert fresh data
-- you'll need to add a DROP TABLE for every table you add
-- we don't drop the database because that causes errors with fly
DROP TABLE IF EXISTS foo;

-- create whatever tables you need here
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
);

\q
