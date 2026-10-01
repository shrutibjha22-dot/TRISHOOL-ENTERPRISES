/**
 * Admin authentication.
 *
 * A successful login returns a signed JWT, which is also set as an HttpOnly
 * cookie so the browser never has to hold it in JavaScript (that is what makes
 * it resistant to XSS theft). The frontend uses the cookie automatically.
 *
 * Endpoints under /api/admin require this middleware.
 */

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const db = require('../config/db');
const { cleanText } = require('../utils/validate');

/** Hash a plaintext password with bcrypt. */
const hashPassword = (plain) => require('bcryptjs').hash(plain, config.auth.bcryptRounds);

/** Compare a plaintext password against a stored bcrypt hash. */
const verifyPassword = (plain, hash) => require('bcryptjs').compare(plain, hash);

/** Sign a token for an admin row. */
const signToken = (admin) =>
  jwt.sign(
    { sub: admin.id, email: admin.email, name: admin.name, role: admin.role },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn }
  );

function setAuthCookie(res, token) {
  res.cookie(config.auth.cookieName, token, {
    httpOnly: true,                 // not readable from JavaScript
    sameSite: 'lax',                // blocks cross-site submission
    secure: config.auth.cookieSecure, // set true when served over https
    maxAge: 8 * 60 * 60 * 1000
  });
}

function clearAuthCookie(res) {
  res.clearCookie(config.auth.cookieName);
}

/** Pull the token from the cookie, falling back to an Authorization header. */
function readToken(req) {
  const fromCookie = req.cookies?.[config.auth.cookieName];
  if (fromCookie) return fromCookie;

  const header = req.get('authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/** Populates req.admin when a valid token is present. Never blocks. */
async function attachAdmin(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, config.auth.jwtSecret);
    const rows = await db.query(
      'SELECT id, name, email, role FROM admin_accounts WHERE id = :id AND is_active = 1',
      { id: payload.sub }
    );
    if (rows.length) req.admin = rows[0];
  } catch {
    // Expired or tampered token: stay anonymous.
  }
  next();
}

/** Blocks the request unless a valid admin session is present. */
function requireAdmin(req, res, next) {
  if (!req.admin) {
    return res.status(401).json({
      ok: false,
      error: 'Please sign in to the admin dashboard.',
      code: 'UNAUTHENTICATED'
    });
  }
  next();
}

module.exports = {
  hashPassword, verifyPassword, signToken,
  setAuthCookie, clearAuthCookie, readToken,
  attachAdmin, requireAdmin,
  cleanText
};
