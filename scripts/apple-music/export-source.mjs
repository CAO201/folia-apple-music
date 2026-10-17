import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// scripts/apple-music/export-source.mjs
// Export the actual working sources, including the fork changes, with no Git history or personal runtime data.
const root = process.cwd();
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const output = path.join(root, 'release/apple-music');
await fs.mkdir(output, { recursive: true });
const staging = await fs.mkdtemp(path.join(output, '.source-'));
const folder = `Folia-Apple-Music-${pkg.version}-source`;
const destination = path.join(staging, folder);
const listing = execFileSync(process.env.GIT || 'git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root }).toString().split('\0').filter(Boolean);
const allowedExample = name => /(?:example|sample|template)/i.test(path.basename(name));
const denied = name => name.split('/').some(part => ['.git', '.dev-credentials', '.codex', '.codex-tmp', 'test-results', 'node_modules', 'dist', '.apple-package', 'release'].includes(part))
  || /(?:^|\/)\.env(?:\.|$)/.test(name) && !allowedExample(name)
  || /\.(?:p12|pfx|pem|key|provisionprofile|mobileprovision|log)$/i.test(name)
  || /(?:^|\/)(?:config\.json|cookies?\.json|credentials?\.json|\.npmrc|\.DS_Store)$/i.test(name);
const files = [];
try {
  for (const name of [...new Set(listing)].sort()) {
    if (denied(name)) continue;
    const source = path.join(root, name);
    const stat = await fs.lstat(source).catch(() => null);
    if (!stat?.isFile()) continue;
    const file = path.join(destination, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.copyFile(source, file); await fs.chmod(file, stat.mode & 0o777);
    files.push({ path: name, sha256: createHash('sha256').update(await fs.readFile(file)).digest('hex') });
  }
  // Generated third-party corresponding sources must accompany both source and binary distributions.
  await fs.cp('release-materials/third-party-sources', path.join(destination, 'release-materials/third-party-sources'), { recursive: true });
  await fs.writeFile(path.join(destination, 'SOURCE_MANIFEST.json'), JSON.stringify({ version: pkg.version,
    upstream: 'chthollyphile/folia-major@1b39fd868e2ddda95788f1baa839c032f3e7a285', files }, null, 2) + '\n');
  const zip = path.join(output, `${folder}.zip`);
  await fs.rm(zip, { force: true });
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--noextattr', '--noqtn', '--keepParent', destination, zip], { stdio: 'inherit' });
  console.log(`${zip} (${files.length} source files)`);
} finally { await fs.rm(staging, { recursive: true, force: true }); }
