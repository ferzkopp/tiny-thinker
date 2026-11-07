import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { release } from './release.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const DEPLOYMENT_FILES = Object.freeze([
  'html/index.html', 'html/experiments.html', 'html/chat.html', 'html/licenses.html',
  'js/capabilities.js', 'js/check.js', 'js/picker.js', 'js/chat.js', 'js/dom.js', 'js/experiments.js',
  'js/licenses.js', 'js/loading.js', 'js/models.js', 'js/tour.js', 'js/turtle.js', 'css/styles.css',
  'images/icon.svg', 'images/datacenter.svg', 'config/catalog.json', 'config/version.json', 'LICENSE',
  'web/robots.txt', 'web/web.config', 'web/.htaccess',
  'engines/webllm-engine.js', 'engines/webllm-worker.js', 'engines/wllama-engine.js',
  'vendor/jslogo/logo.js', 'vendor/jslogo/LICENSE.md', 'vendor/jslogo/LICENSE.txt', 'vendor/jslogo/README.md',
]);

export function deploymentPath(file) {
  return file.replace(/^(?:html|web)[\\/]/, '');
}

function isWithin(parent, path) {
  const difference = relative(parent, path);
  return difference === '' || (!isAbsolute(difference) && difference !== '..' && !difference.startsWith(`..${sep}`));
}

function ignored(name) {
  return name.startsWith('.') || /\.(?:part|revision)$/i.test(name)
    || ['__pycache__', 'node_modules', 'test-results'].includes(name);
}

function collectFiles(directory) {
  const files = new Set();
  const add = (path) => {
    const absolute = resolve(directory, path);
    if (!isWithin(directory, absolute)) throw new Error(`Deployment path escapes the source: ${path}`);
    let current = directory;
    for (const component of relative(directory, absolute).split(sep)) {
      current = join(current, component);
      if (!existsSync(current)) throw new Error(`Missing deployment asset: ${path}`);
      if (lstatSync(current).isSymbolicLink()) throw new Error(`Deployment assets cannot be symbolic links: ${path}`);
    }
    const info = lstatSync(absolute);
    if (info.isDirectory()) {
      const children = readdirSync(absolute).filter((name) => !ignored(name));
      if (!children.length) throw new Error(`Empty deployment asset directory: ${path}`);
      for (const name of children) add(join(path, name));
    } else if (info.isFile()) {
      files.add(relative(directory, absolute));
    } else {
      throw new Error(`Unsupported deployment asset: ${path}`);
    }
  };
  for (const file of DEPLOYMENT_FILES) add(file);
  const modelsDirectory = join(directory, 'models');
  const manifestPath = join(modelsDirectory, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error('Missing models/manifest.json. Prepare models or run python tools/download_models.py --manifest-only first.');
  }
  add('models/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const modelAsset = (path) => {
    if (typeof path !== 'string' || !path || isAbsolute(path) || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
      throw new Error(`Invalid model asset path: ${String(path)}`);
    }
    if (path.split(/[\\/]/).some((name) => name !== '..' && ignored(name))) {
      throw new Error(`Model manifest references a local-only asset: ${path}`);
    }
    const absolute = resolve(modelsDirectory, path);
    if (absolute === modelsDirectory || !isWithin(modelsDirectory, absolute)) {
      throw new Error(`Model asset escapes models/: ${path}`);
    }
    add(relative(directory, absolute));
  };
  for (const engine of ['webllm', 'gguf']) {
    const builds = manifest[engine];
    if (!builds || typeof builds !== 'object' || Array.isArray(builds)) {
      throw new Error(`Model manifest must contain a ${engine} object`);
    }
    for (const build of Object.values(builds)) {
      if (!build || typeof build !== 'object') throw new Error(`Invalid ${engine} build in model manifest`);
      for (const key of engine === 'webllm' ? ['model', 'lib', 'licenseFile', 'attributionFile'] : ['path', 'licenseFile', 'attributionFile']) {
        modelAsset(build[key]);
      }
      const notice = join(dirname(build.licenseFile), 'NOTICE');
      if (existsSync(join(modelsDirectory, notice))) modelAsset(notice);
    }
    if (engine === 'webllm' && Object.keys(builds).length) modelAsset('webllm/libs/ATTRIBUTION.txt');
  }
  return [...files].sort();
}

/** Builds a fresh upload snapshot without changing the source or earlier snapshots.
 * @param {{directory?: string, outputRoot?: string, dryRun?: boolean}} options Source, output parent and preview mode.
 * @returns {{output: string|null, version: string, files: string[], bytes: number}} Snapshot or dry-run summary.
 */
export function prepareDeployment({ directory = root, outputRoot = join(directory, 'deployment'), dryRun = false } = {}) {
  directory = resolve(directory);
  outputRoot = resolve(outputRoot);
  if (isWithin(directory, outputRoot) && outputRoot !== join(directory, 'deployment')) {
    throw new Error('Use the deployment/ output root or choose an output root outside the source repository.');
  }
  const files = collectFiles(directory);
  release(['--check'], directory);
  const { version } = JSON.parse(readFileSync(join(directory, 'config', 'version.json'), 'utf8'));
  const bytes = files.reduce((total, file) => total + lstatSync(join(directory, file)).size, 0);
  if (dryRun) return { output: null, version, files, bytes };
  mkdirSync(outputRoot, { recursive: true });
  const output = mkdtempSync(join(outputRoot, `tiny-thinker-${version}-`));
  try {
    for (const file of files) {
      const destination = join(output, deploymentPath(file));
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(directory, file), destination, constants.COPYFILE_EXCL);
    }
  } catch (error) {
    throw new Error(`Deployment copy failed; incomplete output retained at ${output}: ${error.message}`, { cause: error });
  }
  return { output, version, files, bytes };
}

function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node tools/prepare-deployment.mjs [--dry-run] [--output-root DIRECTORY]');
    return;
  }
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--dry-run') options.dryRun = true;
    else if (args[index] === '--output-root' && args[index + 1] && !args[index + 1].startsWith('--')) {
      options.outputRoot = args[++index];
    } else throw new Error(`Unknown or incomplete option: ${args[index]}. Use --help for usage.`);
  }
  const result = prepareDeployment(options);
  if (options.dryRun) for (const file of result.files) console.log(deploymentPath(file).split(sep).join('/'));
  console.log(`${options.dryRun ? 'Would copy' : 'Copied'} ${result.files.length} files (${(result.bytes / 1024 ** 3).toFixed(2)} GiB), release ${result.version}.`);
  if (result.output) console.log(`Upload the contents of: ${result.output}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}