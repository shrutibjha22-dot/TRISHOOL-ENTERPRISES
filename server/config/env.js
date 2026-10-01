/**
 * Environment configuration.
 *
 * Credentials are read from process.env (loaded from .env) and are never
 * exposed to the browser. Only PUBLIC_* values are ever sent to a client.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ENV_FILE = path.join(ROOT, '.env');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');

/**
 * If .env is missing, create it from .env.example.
 *
 * A fresh clone or a fresh unzip has no .env - it is deliberately never
 * committed, because it holds real passwords. Without this the server would
 * start with silent defaults and fail at the database with a confusing error.
 * Copying the template means the file exists with every documented setting,
 * so the only thing left to do is fill in the values.
 */
if (!fs.existsSync(ENV_FILE) && fs.existsSync(ENV_EXAMPLE)) {
  try {
    fs.copyFileSync(ENV_EXAMPLE, ENV_FILE);
    console.log('[env] created .env from .env.example');
    console.log('[env] fill in DB_PASSWORD and ADMIN_SEED_EMAIL, then restart');
  } catch (err) {
    console.log(`[env] could not create .env: ${err.message}`);
  }
}

require('dotenv').config({ path: ENV_FILE });

const bool = (v, fallback) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

const config = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 3000),
  host: process.env.HOST || '127.0.0.1',

  // The public address customers reach the site on. Used for CORS.
  publicOrigin: process.env.PUBLIC_ORIGIN || '',

  // How many reverse proxies sit in front of this process. Empty means none,
  // which is correct when Node is reached directly. Set to 1 behind a single
  // Nginx or hosting platform so rate limiting sees the real client IP.
  // Trusting a proxy that is not there would let anyone dodge the rate limiter.
  trustProxy: process.env.TRUST_PROXY || '',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'trishool_db',
    connectionLimit: num(process.env.DB_POOL_SIZE, 10)
  },

  auth: {
    // MUST be overridden in .env for anything but local development.
    jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    bcryptRounds: num(process.env.BCRYPT_ROUNDS, 12),
    cookieName: process.env.AUTH_COOKIE_NAME || 'trishool_admin_token',
    cookieSecure: bool(process.env.AUTH_COOKIE_SECURE, false)
  },

  // Business details, kept server-side so they drive the API responses
  // instead of being repeated in the frontend.
  business: {
    name: process.env.BUSINESS_NAME || 'TRISHOOL ENTERPRISES',
    whatsapp: process.env.BUSINESS_WHATSAPP || '919082278478',
    upiId: process.env.BUSINESS_UPI_ID || '9324534405@ptaxis',
    gstRate: num(process.env.GST_RATE, 18)
  }
};

/** Refuse to boot in production with the development secret. */
if (config.env === 'production' && config.auth.jwtSecret === 'dev-only-insecure-secret-change-me') {
  throw new Error('Refusing to start: set a real JWT_SECRET in .env before running in production.');
}

module.exports = config;
