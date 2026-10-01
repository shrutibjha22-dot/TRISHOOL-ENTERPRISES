/**
 * Admin sign-in / sign-out / whoami.
 *
 * Login is rate limited at the router level, and every failure returns the
 * same message whether the email or the password was wrong, so the endpoint
 * cannot be used to discover which accounts exist.
 */

const db = require('../config/db');
const config = require('../config/env');
const { asyncHandler } = require('../middleware/error');
const auth = require('../middleware/auth');
const { str, cleanText, checkEmail } = require('../utils/validate');

/** POST /api/auth/login  { email, password } */
exports.login = asyncHandler(async (req, res) => {
  const email = str(req.body?.email).toLowerCase();
  const password = str(req.body?.password);

  const problems = [...checkEmail(email)];
  if (!password) problems.push('Password is required');
  if (problems.length) {
    return res.status(400).json({ ok: false, error: problems[0], fields: problems });
  }

  const rows = await db.query(
    'SELECT * FROM admin_accounts WHERE email = :email AND is_active = 1 LIMIT 1',
    { email }
  );
  const admin = rows[0];

  // Same response either way: do not leak whether the account exists.
  const invalid = { ok: false, error: 'Incorrect email or password' };
  if (!admin) return res.status(401).json(invalid);

  const ok = await auth.verifyPassword(password, admin.password_hash);
  if (!ok) return res.status(401).json(invalid);

  await db.execute('UPDATE admin_accounts SET last_login_at = NOW() WHERE id = :id', { id: admin.id });

  const token = auth.signToken(admin);
  auth.setAuthCookie(res, token);

  res.json({
    ok: true,
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    token
  });
});

/** POST /api/auth/logout */
exports.logout = asyncHandler(async (_req, res) => {
  auth.clearAuthCookie(res);
  res.json({ ok: true });
});

/** GET /api/auth/me — lets the dashboard check whether it is still signed in. */
exports.me = asyncHandler(async (req, res) => {
  if (!req.admin) return res.status(401).json({ ok: false, error: 'Not signed in' });
  res.json({
    ok: true,
    admin: {
      id: req.admin.id,
      name: req.admin.name,
      email: req.admin.email,
      role: req.admin.role,
      business: config.business.name
    }
  });
});

/**
 * GET /api/auth/status — is the visitor a signed-in admin?
 *
 * Unlike /auth/me this always answers 200, with `admin: null` for ordinary
 * visitors. The public website calls it on every page load to decide whether to
 * show the Admin link in the navigation bar. Returning 401 for a normal
 * customer would put a failed request in every visitor's browser console, which
 * is noise, looks like a bug, and says nothing useful that `null` does not.
 *
 * It reveals nothing to an outsider: without a valid, signed cookie the answer
 * is always "not an admin". The token is still verified on every call, and the
 * admin endpoints themselves remain protected by requireAdmin.
 */
exports.status = asyncHandler(async (req, res) => {
  res.json({
    ok: true,
    admin: req.admin
      ? { id: req.admin.id, name: req.admin.name, role: req.admin.role }
      : null
  });
});
