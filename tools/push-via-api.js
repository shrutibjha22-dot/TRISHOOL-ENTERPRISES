/**
 * Push through the REST API when `git push` is being refused.
 *
 * GitHub's git-over-HTTPS endpoint returned a 500 for several minutes while
 * their REST API kept working, which left the repository stuck on a commit
 * whose files had an encoding fault in them. This uploads the same tree the
 * way the API does it: blob, tree, commit, ref.
 *
 *   node tools/push-via-api.js <repo> <baseRef> <message> [files...]
 *
 * With no file list, every path that differs from the base commit is sent.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const GH = 'C:\\Users\\diksh\\AppData\\Local\\Programs\\gh\\bin\\gh.exe';
const repo = process.argv[2];
const ref = process.argv[3] || 'main';
const message = process.argv[4] || 'Update via REST API';
const root = path.join(__dirname, '..');

if (!repo) {
  console.error('usage: node tools/push-via-api.js <owner/repo> <ref> <message> [files...]');
  process.exit(1);
}

const token = execFileSync(GH, ['auth', 'token'], { encoding: 'utf8' }).trim();

async function api(method, endpoint, body) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'trishool-deploy'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
  if (!res.ok) {
    throw new Error(`${method} ${endpoint} -> ${res.status} ${(json && json.message) || text.slice(0, 200)}`);
  }
  return json;
}

(async () => {
  console.log(`  repo ${repo}, ref ${ref}`);

  const base = await api('GET', `/repos/${repo}/commits/${ref}`);
  console.log(`  base commit ${base.sha.slice(0, 7)}`);

  // Which tracked files differ from the base commit?
  let wanted = process.argv.slice(5);
  if (!wanted.length) {
    const diff = execFileSync('git', ['diff', '--name-only', `${base.sha}`, 'HEAD'], { cwd: root, encoding: 'utf8' });
    wanted = diff.split(/\r?\n/).filter(Boolean);
    // Also pick up files that are new and not yet in the base tree.
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
    wanted = wanted.concat(untracked.split(/\r?\n/).filter(Boolean));
    wanted = [...new Set(wanted)];
  }

  if (!wanted.length) { console.log('  nothing to send'); return; }
  console.log(`  sending ${wanted.length} file(s): ${wanted.join(', ')}`);

  const entries = [];
  for (const rel of wanted) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) { console.log(`    skip ${rel} (missing)`); continue; }
    const content = fs.readFileSync(full);
    const blob = await api('POST', `/repos/${repo}/git/blobs`, {
      content: content.toString('base64'),
      encoding: 'base64'
    });
    entries.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
    console.log(`    ${rel}  ${content.length} bytes`);
  }

  const tree = await api('POST', `/repos/${repo}/git/trees`, {
    base_tree: base.commit.tree.sha,
    tree: entries
  });

  const commit = await api('POST', `/repos/${repo}/git/commits`, {
    message,
    tree: tree.sha,
    parents: [base.sha]
  });

  await api('PATCH', `/repos/${repo}/git/refs/heads/${ref}`, { sha: commit.sha, force: false });

  console.log(`\n  new commit ${commit.sha.slice(0, 7)} on ${ref}`);
})().catch((err) => {
  console.error(`\n  FAILED: ${err.message}`);
  process.exit(1);
});