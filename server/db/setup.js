/**
 * Creates the database and tables from schema.sql.
 *
 *   npm run db:setup           create if missing, apply CREATE TABLE IF NOT EXISTS
 *   npm run db:reset           drop everything first, then recreate
 *
 * Reads statements from the SQL file and runs them one at a time, because the
 * MySQL protocol does not allow multipleStatements by default.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config/env');

const SCHEMA = path.join(__dirname, 'schema.sql');

/** Strip SQL comments and split on semicolons that end a statement. */
function splitStatements(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function run(fresh) {
  // Connect without a database so we can create it.
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: false
  });

  try {
    if (fresh) {
      console.log('[db] dropping existing database...');
      await conn.query(`DROP DATABASE IF EXISTS \`${config.db.database}\``);
    }

    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\`
         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.query(`USE \`${config.db.database}\``);

    const sql = fs.readFileSync(SCHEMA, 'utf8');
    const statements = splitStatements(sql);

    console.log(`[db] applying ${statements.length} statements...`);
    for (const stmt of statements) {
      await conn.query(stmt);
    }

    console.log(`[db] schema ready in \`${config.db.database}\``);
  } finally {
    await conn.end();
  }
}

run(process.argv.includes('--fresh'))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[db] setup failed:', err.message);
    process.exit(1);
  });
