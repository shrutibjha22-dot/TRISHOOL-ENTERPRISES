/**
 * One-off: take the admin section out of the public page.
 *
 * Written as a script rather than done by hand because a previous attempt used
 * a shell helper that re-saved these files with the wrong codepage and quietly
 * turned every rupee sign, em dash and emoji in them into mojibake. Doing the
 * line surgery in Node, which reads and writes UTF-8 correctly, is the point.
 *
 *   node tools/remove-admin-from-public.js
 *
 * Safe to run twice: the second run finds nothing to remove and says so.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const appPath = path.join(root, 'app.js');

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s, 'utf8');

let changed = [];

/* ------------------------------ index.html ------------------------------ */

let html = read(indexPath);
const before = html;

// 1. The two entry points.
html = html.replace(
  /[ \t]*<!-- Staff entry point[\s\S]*?-->\r?\n[ \t]*<a href="admin\.html" id="navAdmin"[^>]*>Admin<\/a>\r?\n/,
  ''
);
html = html.replace(
  /\s*&middot;\s*<a class="foot-admin" href="admin\.html"[^>]*>Admin<\/a>/,
  ''
);

// 2. The "dashboard is not running" notice, up to the app.js tag.
html = html.replace(
  /\r?\n<!-- Shown when Admin is clicked[\s\S]*?<div class="admin-notice"[\s\S]*?<\/div>\r?\n\s*(?=<script src="app\.js">)/,
  '\n'
);

// 3. The whole embedded panel, from its banner comment to the last </div>
//    before </body>.
html = html.replace(
  /\r?\n<!-- ={10,}\r?\n\s*ADMIN PANEL[\s\S]*?\r?\n<\/body>/,
  '\n</body>'
);

// 4. Tidy the now-empty gap left by the notice.
html = html.replace(/<\/div>\n\s*\n\s*\n<script src="app\.js">/, '</div>\n\n<script src="app.js">');

if (html !== before) { write(indexPath, html); changed.push('index.html'); }

/* -------------------------------- app.js -------------------------------- */

let js = read(appPath);
const jsBefore = js;

// The click wiring for both Admin links and the notice, plus showAdminNav().
js = js.replace(
  /\n[ \t]*\/\* --- admin: open the dashboard panel from either link --- \*\/[\s\S]*?\n[ \t]*showAdminNav\(\);\n/,
  '\n'
);

// The block of functions that existed only to serve those links: the section
// banner, showAdminNav, loadAdminScript, SERVER_URL, openedAsFile,
// adminHostReachable, adminOfflineNotice, closeAdminNotice and openAdmin.
js = js.replace(
  /\n\/\* -+\r?\n\s*ADMIN LINK IN THE NAVIGATION[\s\S]*?\n(?:async function openAdmin\(\)[\s\S]*?\n\}\r?\n)\r?\n/,
  '\n'
);

// apiAvailable was only called by openAdmin, so it goes with it.
js = js.replace(
  /\/\*\*\r?\n \* Is the API actually answering\?[\s\S]*?\nlet apiCheck = null;\r?\nasync function apiAvailable\(\) \{[\s\S]*?\n\}\r?\n\r?\n/,
  ''
);

// The doc comment above BACKEND still describes an adminUrl setting that this
// page no longer has. Rewrite it to match what is actually here.
//
// Done by locating the boundaries rather than by pattern, because the banner
// rules are decorative and a regex over them is brittle.
js = (() => {
  const start = js.indexOf('/* ---------------------------------------------------------\n   WHERE THE BACKEND LIVES');
  const end = js.indexOf('const BACKEND = {');
  if (start === -1 || end === -1 || end < start) return js;

  return js.slice(0, start) + `/* ---------------------------------------------------------
   WHERE THE BACKEND LIVES
   ---------------------------------------------------------
   This page has no admin section, so it needs one thing from the
   backend: the address to save forms to.

   Two ways the site gets served:

   1. The page and the API share an origin - a Render deployment, or
      START-WEBSITE.bat on this computer. apiBase stays blank, so every
      call goes to the host that served the page. This is the default.

   2. The page is static on GitHub Pages and the API is hosted
      elsewhere. resolveBackend() finds that host by asking which one
      answers /api/health, so nothing is filled in by hand and nothing
      has to be rebuilt when the backend moves. Add the host to the
      candidates list below if it is not already there.
   --------------------------------------------------------- */
` + js.slice(end);
})();

// adminUrl is now written but never read on this page; admin.js keeps its own.
js = js.replace(
  /[ \t]*BACKEND\.adminUrl = base\r?\n[ \t]*\? base \+ '\/admin\.html'\r?\n[ \t]*: new URL\('admin\.html', location\.href\)\.href;\r?\n/,
  ''
);
js = js.replace(
  /\n[ \t]*\/\/ Nothing answered\. Keep the local fallback[\s\S]*?somewhere sensible to be sent\./,
  "\n    // Nothing answered. Leave apiBase blank so the forms keep addressing this\n    // same origin and report plainly that the server cannot be reached."
);

if (js !== jsBefore) { write(appPath, js); changed.push('app.js'); }

/* -------------------------------- report -------------------------------- */

console.log(changed.length ? `  rewrote: ${changed.join(', ')}` : '  nothing to remove (already done)');

/* ------------------------------- verify -------------------------------- */

const h = read(indexPath);
const j = read(appPath);
const leftovers = [];

for (const token of ['navAdmin', 'foot-admin', 'adminPanel', 'adminNotice', 'gateForm']) {
  if (h.includes(token)) leftovers.push(`index.html still has ${token}`);
}
for (const token of ['openAdmin', 'adminOfflineNotice', 'closeAdminNotice', 'adminHostReachable',
  'showAdminNav', 'loadAdminScript', 'SERVER_URL', 'openedAsFile', 'apiAvailable', 'adminUrl']) {
  if (j.includes(token)) leftovers.push(`app.js still has ${token}`);
}
if (!h.includes('</body>')) leftovers.push('index.html lost its closing body tag');
if (!h.includes('<script src="app.js">')) leftovers.push('index.html lost its app.js tag');
if (!/<\/html>\s*$/.test(h.trim())) leftovers.push('index.html lost its closing html tag');

if (leftovers.length) {
  console.log('\n  INCOMPLETE:');
  for (const l of leftovers) console.log(`    - ${l}`);
  process.exit(1);
}
console.log('  verified: no admin markup in the public page, no dead admin code in app.js');
console.log('  verified: index.html structure intact\n');