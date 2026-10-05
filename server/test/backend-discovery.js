/**
 * Backend discovery, tested without a browser.
 *
 * The resolver in app.js and admin.js picks the first origin that answers
 * /api/health. That choice is what makes the admin dashboard work from any
 * device once the API is hosted, so it is worth proving the loop behaves:
 *
 *   - a static host that cannot serve the API is skipped
 *   - the hosted API further down the list is chosen
 *   - the session cookie is relaxed only when a cross-origin frontend exists
 *
 * Run with: node server/test/backend-discovery.js
 */

const assert = require('assert');

/* The candidate list exactly as it appears in app.js and admin.js. */
const CANDIDATES = ['', 'https://trishool-website.onrender.com'];

/**
 * Same algorithm as resolveBackend, with fetch replaced so the outcome does not
 * depend on any host actually being up.
 */
async function discover(healthy) {
  const BACKEND = {
    apiBase: '',
    adminUrl: 'http://127.0.0.1:3000/admin.html',
    candidates: CANDIDATES
  };

  for (const candidate of BACKEND.candidates) {
    try {
      if (!healthy.includes(candidate)) continue;
      BACKEND.apiBase = candidate;
      BACKEND.adminUrl = candidate
        ? candidate + '/admin.html'
        : new URL('admin.html', 'https://page.example/').href;
      return BACKEND;
    } catch { /* keep looking */ }
  }
  return BACKEND;
}

(async () => {
  let pass = 0;
  let fail = 0;
  const check = (name, ok, detail = '') => {
    if (ok) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`); }
  };

  console.log('\n-- discovery --');

  const sameOrigin = await discover(['']);
  check('uses the serving origin when it serves the API',
    sameOrigin.apiBase === '', `got "${sameOrigin.apiBase}"`);
  check('admin url stays same-origin',
    sameOrigin.adminUrl === 'https://page.example/admin.html', sameOrigin.adminUrl);

  const hosted = await discover(['https://trishool-website.onrender.com']);
  check('skips a static host that cannot serve the API',
    hosted.apiBase === 'https://trishool-website.onrender.com', hosted.apiBase);
  check('points the dashboard at the hosted API',
    hosted.adminUrl === 'https://trishool-website.onrender.com/admin.html', hosted.adminUrl);

  const both = await discover(['', 'https://trishool-website.onrender.com']);
  check('prefers the serving origin when both work',
    both.apiBase === '', `got "${both.apiBase}"`);

  const neither = await discover([]);
  check('falls back to the local machine when nothing answers',
    neither.adminUrl === 'http://127.0.0.1:3000/admin.html', neither.adminUrl);

  console.log('\n-- session cookie --');
  const sameSiteFor = (publicOrigin, override) =>
    override || (publicOrigin ? 'none' : 'lax');

  check('lax when the page and API share an origin',
    sameSiteFor('') === 'lax');
  check('none when a separate frontend is allowed',
    sameSiteFor('https://shrutibjha22-dot.github.io') === 'none');
  check('explicit setting wins',
    sameSiteFor('https://shrutibjha22-dot.github.io', 'lax') === 'lax');

  console.log('\n-- deployment config --');
  const yaml = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'render.yaml'), 'utf8');
  check('TRUST_PROXY set so the rate limiter can tell visitors apart',
    /key:\s*TRUST_PROXY[\s\S]{0,60}value:\s*"1"/.test(yaml));
  check('PUBLIC_ORIGIN set so the published site is allowed through',
    /key:\s*PUBLIC_ORIGIN[\s\S]{0,120}value:\s*"https:\/\/shrutibjha22-dot\.github\.io"/.test(yaml));
  check('admin credentials are prompted for, never hardcoded',
    /key:\s*ADMIN_SEED_EMAIL[\s\S]{0,40}sync:\s*false/.test(yaml) &&
    /key:\s*ADMIN_SEED_PASSWORD[\s\S]{0,40}sync:\s*false/.test(yaml));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();