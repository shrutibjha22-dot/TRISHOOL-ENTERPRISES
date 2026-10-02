/**
 * MySQL connection pool.
 *
 * A single shared pool is used for every query. Pooled connections are cheap to
 * hold open, which matters for a small site with bursty traffic.
 */

const mysql = require('mysql2/promise');
const config = require('./env');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  charset: 'utf8mb4',
  // Keep DECIMAL/BIGINT as JS numbers so JSON stays readable. Safe here
  // because no monetary value is large enough to lose precision.
  decimalNumbers: true,
  dateStrings: ['DATE', 'DATETIME'],
  namedPlaceholders: true
});

/** Verify the server answers and the database exists. */
async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    const [rows] = await conn.query('SELECT VERSION() AS version, DATABASE() AS db');
    // The database host is included so a caller can refuse to run destructive
    // work against a remote database. See the smoke test's cleanup step.
    // This is DB_HOST, not the address the web server binds to, which is
    // usually 0.0.0.0 and says nothing about where the data lives.
    return { ...rows[0], host: config.db.host };
  } finally {
    conn.release();
  }
}

/** Run a parameterised query. Always use this instead of string concatenation. */
async function query(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Same, but returns the insert id / affected rows. */
async function execute(sql, params = {}) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/** Run several statements in one transaction, rolling back on any failure. */
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, ping, query, execute, transaction };
