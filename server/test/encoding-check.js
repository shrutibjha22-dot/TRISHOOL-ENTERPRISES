/**
 * Encoding check.
 *
 * Looks for the signature of a file that was read and written back with the
 * wrong codepage: UTF-8 bytes decoded as Windows-1252, then saved as UTF-8
 * again. The rupee sign turns into three junk characters, the middle dot into
 * "A-circumflex .", an em dash into "a-circumflex -".
 *
 * The damage is invisible in a diff and survives a quick look at the file, but
 * the page then renders "a-circumflex 300" instead of a price. It got in once
 * because a line-slicing helper re-saved a UTF-8 file with the wrong encoding,
 * so it is checked from now on.
 *
 * The patterns are written with escapes rather than the characters themselves:
 * typing the damaged text literally would put the very mojibake being hunted
 * for into this file.
 *
 *   node server/test/encoding-check.js [folder] [files...]
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || path.join(__dirname, '..', '..');
const files = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['index.html', 'admin.html', 'app.js', 'admin.js', 'styles.css', 'admin.css',
     'sw.js', 'manifest.webmanifest', 'robots.txt'];

/* What a correct file legitimately contains, so this can be reported too. */
const GOOD = { '₹': 0x20b9, '—': 0x2014, '–': 0x2013, '·': 0x00b7, '’': 0x2019, '“': 0x201c };

/**
 * A damaged pair is one of the Latin-1 lead bytes that only ever appear as the
 * start of a mis-decoded sequence, followed by a character that a clean file
 * has no reason to place after it.
 */
const LEAD = '\\u00C2\\u00C3\\u00E2\\u00F0';
const FOLLOW = '\\u0080-\\u00BF\\u20A0-\\u20CF\\u2000-\\u22FF';
const DAMAGED = new RegExp(`[${LEAD}][${FOLLOW}]`, 'g');

/* The specific ones worth naming, so the output says what broke. */
const NAMED = [
  ['rupee sign', /â‚¹/g],
  ['middle dot', /Â·/g],
  ['nbsp', /Â /g],
  ['em dash', /â€“/g],
  ['left quote', /â€œ/g],
  ['right quote', /â€/g],
  ['apostrophe', /â€™/g],
  ['bullet', /â€¢/g],
  ['emoji', /ðŸ/g]
];

let bad = 0;
let checked = 0;

for (const f of files) {
  const full = path.join(dir, f);
  if (!fs.existsSync(full)) {
    // Reported, not skipped. An earlier version skipped silently, so pointing
    // it at a folder that held none of these files printed "PASS" having
    // checked nothing at all - which is worse than no check.
    bad++;
    console.log(`  MISSING  ${f}  (not found in ${dir})`);
    continue;
  }
  checked++;

  const text = fs.readFileSync(full, 'utf8');

  const hits = [];
  for (const [name, re] of NAMED) {
    const n = (text.match(re) || []).length;
    if (n) hits.push(`${n} damaged ${name}`);
  }

  const total = (text.match(DAMAGED) || []).length;
  if (total && !hits.length) hits.push(`${total} mis-decoded character(s)`);

  const undecodable = (text.match(/�/g) || []).length;
  if (undecodable) hits.push(`${undecodable} undecodable byte(s)`);

  if (hits.length) {
    bad++;
    console.log(`  BROKEN  ${f}`);
    for (const h of hits) console.log(`            - ${h}`);
  } else {
    const intact = Object.keys(GOOD).filter((c) => text.includes(c));
    console.log(`  ok      ${f}  ${intact.length ? 'intact: ' + intact.join(' ') : 'no special characters used'}`);
  }
}

console.log(`\n  ${bad === 0 ? `PASS - no encoding damage in ${checked} file(s)` : 'FAIL - ' + bad + ' file(s) need attention'}`);
if (checked === 0) console.log('  WARNING  nothing was actually checked');
console.log('');
process.exit(bad === 0 && checked > 0 ? 0 : 1);