/**
 * Trishool Enterprises — server entry point.
 *
 * Serves the existing static frontend unchanged, plus the JSON API under
 * /api. One process, one port: the website and its backend run together.
 */

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const config = require('./config/env');
const db = require('./config/db');
const routes = require('./routes');
const auth = require('./middleware/auth');
const { notFound, errorHandler, requestLogger } = require('./middleware/error');

const ROOT = path.join(__dirname, '..');
const app = express();

/**
 * A closed stdout must not take the server down.
 *
 * If the process is started with its output piped somewhere that goes away
 * (a closed terminal, a supervisor tearing the pipe down, output redirected to
 * a full disk), every console write raises an EPIPE on the stream. Node treats
 * that as an unhandled 'error' event and exits, so a logging problem would
 * otherwise take the whole website offline.
 */
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err) => {
    if (err && (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED')) return;
    // Anything else is unexpected, but still not worth crashing over.
  });
}

/**
 * Trust a reverse proxy only when one is actually in front of this process.
 *
 * Rate limiting counts per client IP. Behind a proxy (Nginx, a load balancer,
 * a hosting platform) the real IP arrives in X-Forwarded-For, so it has to be
 * trusted - but trusting it when there is NO proxy is a hole: anyone can send
 * `X-Forwarded-For: <anything>` and get a brand new rate-limit bucket each
 * time, making the limiter useless.
 *
 * So the default is to trust nothing and take the socket address, which is
 * correct when running directly (localhost, a college demo, a single VM).
 * Set TRUST_PROXY=1 in .env when you put Nginx or a platform in front.
 */
if (config.trustProxy) {
  app.set('trust proxy', config.trustProxy);
}

/* ----------------------------- security ----------------------------- */
app.use(helmet({
  // The site loads fonts and images from CDNs, so the default same-origin
  // policy is relaxed deliberately. The API itself is same-origin.
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(compression());

// JSON bodies only; a 100kb ceiling is generous for a contact message and
// stops a trivially large payload from tying up the process.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

// Allow the API to be called from a separately hosted frontend if needed.
if (config.publicOrigin) {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', config.publicOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.sendStatus(204);
    }
    next();
  });
}

app.use(requestLogger);
app.use(auth.attachAdmin);

/* ------------------------------ api ------------------------------ */
app.use('/api', routes);
app.use('/api', notFound);

/* --------------------------- static site --------------------------- */
/**
 * Only these files are public.
 *
 * The static handler is pointed at the project root, which is also where the
 * backend source, the SQL schema, the database scripts and node_modules live.
 * Without this allowlist anyone could download them - /server/db/seed.js and
 * /server/test/smoke.js both contain the admin email address.
 *
 * An allowlist is used rather than a blocklist on purpose: a blocklist has to
 * be updated every time something new is added, and anything forgotten is
 * public. Here, a file that is not named is simply not served.
 */
const PUBLIC_FILES = new Set([
  'index.html',
  'admin.html',
  'styles.css',
  'admin.css',
  'app.js',
  'admin.js',
  'sw.js',
  'manifest.webmanifest',
  'robots.txt'
]);

/** Directories whose contents are public artwork and app icons. */
const PUBLIC_DIRS = new Set(['assets', 'icons']);

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  // Strip the leading slash and normalise, so "/server\db\seed.js" is caught too.
  const rel = decodeURIComponent(req.path).replace(/^\/+/, '').replace(/\\/g, '/');
  const top = rel.split('/')[0];

  // "/" is the website itself.
  if (rel === '') return next();

  if (rel.includes('/')) {
    // Only files inside an allowed artwork directory.
    return PUBLIC_DIRS.has(top) ? next() : notFound(req, res);
  }

  // A file in the project root: only if it is on the list.
  return PUBLIC_FILES.has(rel) ? next() : notFound(req, res);
});

// Serves index.html, admin.html, styles.css, app.js, assets/, icons/ etc.
// No frontend file is modified by the backend.
app.use(express.static(ROOT, {
  extensions: ['html'],
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    // HTML, JS and CSS must revalidate on every load. These filenames are not
    // content-hashed, so a long max-age would leave visitors (and the admin
    // dashboard) running stale code after an update. ETag / Last-Modified make
    // the revalidation cheap, because a 304 carries no body.
    if (/\.(html|js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(filePath)) {
      // Artwork and icons do not change between deploys.
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  }
}));

// The service worker must never be cached, or an old one sticks around.
app.get('/sw.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(ROOT, 'sw.js'));
});

app.use(errorHandler);

/* ------------------------------ start ------------------------------ */
async function start() {
  try {
    const info = await db.ping();
    console.log(`[db] connected to ${info.db} (${info.version})`);
  } catch (err) {
    console.error('');
    console.error('  [db] could not connect to the database');
    console.error('');
    console.error(`       ${err.message}`);
    console.error('');
    console.error('       Fix these in your .env file:');
    console.error(`         DB_HOST     (currently: ${config.db.host})`);
    console.error(`         DB_PORT     (currently: ${config.db.port})`);
    console.error(`         DB_USER     (currently: ${config.db.user})`);
    console.error(`         DB_PASSWORD (currently: ${config.db.password ? 'set' : 'EMPTY'})`);
    console.error('');
    console.error('       Then run these once:');
    console.error('         npm run db:setup     create the database and tables');
    console.error('         npm run db:seed      load the services and an admin account');
    console.error('');
    console.error('       If MySQL is not running, start it first.');
    console.error('');
    process.exit(1);
  }

  const server = app.listen(config.port, config.host, () => {
    console.log('');
    console.log('  TRISHOOL ENTERPRISES');
    console.log('  ----------------------');
    console.log(`  Website   http://${config.host}:${config.port}/`);
    console.log(`  Admin     http://${config.host}:${config.port}/admin.html`);
    console.log(`  API       http://${config.host}:${config.port}/api/health`);
    console.log(`  Mode      ${config.env}`);
    console.log('');
  });

  // Starting twice is the most common beginner problem. Without this the
  // process dies on an unhandled 'error' event and prints a stack trace,
  // which looks like a broken project rather than a port clash.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('');
      console.error(`  Port ${config.port} is already in use - another copy of the`);
      console.error('  server is probably already running.');
      console.error('');
      console.error('  Either open the other window, or close it and start again.');
      console.error(`  To use a different port, change PORT in your .env file.`);
      console.error('');
      process.exit(1);
    }
    console.error('[server] error:', err.message);
    process.exit(1);
  });
}

if (require.main === module) start();

module.exports = app;
