import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/** Stamps cache-version and app-version text in a source string.
 * @param {string} source Source text to update.
 * @param {string} version Release version such as `1.3`.
 * @returns {string} Updated source text.
 */
export function updateVersionReferences(source, version) {
  return source
    .replace(/([?&]v=)\d+\.\d+(?:\.\d+)?\b/g, `$1${version}`)
    .replace(/(<small class="app-version">v)\d+\.\d+(?:\.\d+)?(<\/small>)/g, `$1${version}$2`);
}

/** Applies or checks a release version across the app and test assets.
 * @param {string[]} args Release version or `--check`.
 * @param {string} directory Repository root.
 * @returns {void}
 */
export function release(args = [], directory = root) {
  if (args.length > 1) throw new Error('Usage: node release.mjs [version | --check]');
  const manifestPath = join(directory, 'version.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const checkOnly = args[0] === '--check';
  const version = checkOnly || !args.length ? manifest.version : args[0];
  if (typeof version !== 'string' || !/^\d+\.\d+(?:\.\d+)?$/.test(version)) {
    throw new Error('Release version must have the form major.minor or major.minor.patch');
  }
  const files = [
    ...readdirSync(directory).filter((name) => /\.(html|js|css)$/.test(name)).map((name) => join(directory, name)),
    ...readdirSync(join(directory, 'engines')).filter((name) => name.endsWith('.js')).map((name) => join(directory, 'engines', name)),
    join(directory, 'tests', 'browser-smoke.mjs'),
    join(directory, 'tests', 'prompt-grid.mjs'),
    join(directory, 'test-results', 'role-dialog.mjs'),
  ];
  const changes = files.filter((file) => existsSync(file)).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    const updated = updateVersionReferences(source, version);
    return updated === source ? [] : [{ file, updated }];
  });
  if (checkOnly) {
    if (changes.length) throw new Error(`Release ${version} has stale references: ${changes.map(({ file }) => relative(directory, file)).join(', ')}`);
    console.log(`Release ${version}: all version references match.`);
    return;
  }
  for (const { file, updated } of changes) writeFileSync(file, updated, 'utf8');
  if (manifest.version !== version) {
    writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`, 'utf8');
  }
  console.log(`Release ${version}: updated ${changes.length} files.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    release(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}