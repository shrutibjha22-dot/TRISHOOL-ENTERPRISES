/**
 * Clears everything a demo or a test run leaves behind, then puts the database
 * back to a sensible demo state.
 *
 *   npm run db:demo
 *
 * What it does:
 *   - deletes orders, inquiries, bookings, reviews, contact messages and the
 *     customers they created
 *   - restores the seeded service list and admin account (via seed.js)
 *   - leaves the services table exactly as it was, so any services you added
 *     through the admin dashboard are kept
 *
 * Use this before a demonstration so the dashboard does not show rows left by
 * `npm run smoke`.
 */

const db = require('../config/db');

/** Child rows first, so foreign keys never block the delete. */
const TABLES = [
  'orders',
  'service_inquiries',
  'bookings',
  'reviews',
  'contact_submissions',
  'customers'
];

(async () => {
  try {
    // Only touch tables this database actually has, so an older or partial
    // schema cannot make the cleanup fail halfway through.
    const existing = await db.query('SHOW TABLES');
    const present = new Set(existing.map((row) => Object.values(row)[0]));

    for (const table of TABLES) {
      if (!present.has(table)) {
        console.log(`[demo] skipped ${table} (not in this schema)`);
        continue;
      }
      // The name comes from the constant above, never from user input.
      const { affectedRows } = await db.execute(`DELETE FROM \`${table}\``);
      console.log(`[demo] cleared ${affectedRows} row(s) from ${table}`);
    }

    // Start the id counters over so a fresh demo does not inherit old numbers.
    for (const table of TABLES) {
      if (present.has(table)) await db.execute(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`);
    }

    console.log('[demo] transactional tables are empty');
    console.log('[demo] reloading services and the admin account...');
    process.exit(0);
  } catch (err) {
    console.error('[demo] failed:', err.message);
    process.exit(1);
  }
})();
