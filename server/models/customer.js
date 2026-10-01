/**
 * Customer helper.
 *
 * A phone number is the natural identity for this business: people call and
 * WhatsApp far more than they email. So we look up by normalised phone and
 * reuse the customer row rather than creating duplicates every visit.
 */

const db = require('../config/db');
const { str, formatPhone, cleanText, normalisePhone } = require('../utils/validate');

/** Find an existing customer by phone, or null. */
async function findByPhone(phone) {
  const formatted = formatPhone(phone);
  if (!formatted) return null;

  const rows = await db.query(
    'SELECT * FROM customers WHERE phone = :phone LIMIT 1',
    { phone: formatted }
  );
  return rows[0] || null;
}

/**
 * Get the customer for this phone, creating the row if needed.
 *
 * Name and email are only overwritten when the caller supplied them, so an
 * existing record is never blanked out by a later, sparser submission.
 */
async function upsert({ name, phone, email, city }) {
  const formatted = formatPhone(phone);
  if (!formatted) return null;

  const existing = await findByPhone(formatted);
  const cleanName = cleanText(str(name), 120);
  const cleanEmail = cleanText(str(email), 190) || null;
  const cleanCity = cleanText(str(city), 80) || null;

  if (existing) {
    await db.execute(
      `UPDATE customers
          SET name  = COALESCE(NULLIF(:name, ''), name),
              email = COALESCE(:email, email),
              city  = COALESCE(:city, city)
        WHERE id = :id`,
      { name: cleanName, email: cleanEmail, city: cleanCity, id: existing.id }
    );
    return existing.id;
  }

  const result = await db.execute(
    `INSERT INTO customers (name, phone, email, city) VALUES (:name, :phone, :email, :city)`,
    {
      // A phone-only submission still needs a name for the admin list.
      name: cleanName || 'Customer',
      phone: formatted,
      email: cleanEmail,
      city: cleanCity
    }
  );
  return result.insertId;
}

module.exports = { findByPhone, upsert, formatPhone, normalisePhone };
