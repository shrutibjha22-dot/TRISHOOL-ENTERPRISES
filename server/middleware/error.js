/**
 * Error handling and a tiny request logger.
 */

/** Wrap an async route so a rejected promise reaches the error handler. */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Consistent JSON error shape for the whole API. */
function notFound(req, res) {
  res.status(404).json({ ok: false, error: `No route for ${req.method} ${req.originalUrl}` });
}

/** Central error handler. Must keep four parameters. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Surface database errors without leaking SQL or credentials.
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ ok: false, error: 'That record already exists', code: 'DUPLICATE' });
  }
  if (err && (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST')) {
    return res.status(503).json({ ok: false, error: 'Database unavailable, please try again', code: 'DB_DOWN' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'Malformed JSON body', code: 'BAD_JSON' });
  }

  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);

  /* The codes handled above are ours and safe to name. Anything else on a 5xx
     is a raw driver code - ER_NO_SUCH_TABLE and friends - which tells a caller
     which database engine is in use and what it is called. Useful while
     developing, so it stays on outside production and is withheld on a live
     site, where the full detail has already gone to the server log. */
  const ownCode = ['DUPLICATE', 'DB_DOWN', 'BAD_JSON'];
  const isServerError = status >= 500;
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(status).json({
    ok: false,
    error: isServerError ? 'Something went wrong on our side' : err.message,
    code: (!isServerError || !isProduction || ownCode.includes(err.code))
      ? (err.code || 'ERROR')
      : 'SERVER_ERROR'
  });
}

/** Minimal request log: method, path, status, duration. */
function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    if (req.path.startsWith('/api')) {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
    }
  });
  next();
}

module.exports = { asyncHandler, notFound, errorHandler, requestLogger };
