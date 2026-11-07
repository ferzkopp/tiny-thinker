// Unit tests for the mode catalog and its helpers (Node's built-in test runner, no browser needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { EXPERIMENTS, getExperiment, withExperiment, settingsMatch, describeChange, formatNotes, experimentBadgeLevel, recordExperimentInteraction, resetExperimentProgress } from '../experiments.js';
import { extractTurtleCode, parseTurtle, runTurtle } from '../turtle.js';
import { release, updateVersionReferences } from '../release.mjs';
import { parseGridOptions } from './prompt-grid-helpers.mjs';
import { DEPLOYMENT_FILES, prepareDeployment } from '../prepare-deployment.mjs';

test('TinyLlama has both GPU precisions, a CPU build and its native context limit', () => {
  const catalog = JSON.parse(readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
  const model = catalog.tiers.balanced;
  assert.equal(model.upstream, 'TinyLlama/TinyLlama-1.1B-Chat-v1.0');
  assert.equal(catalog.families[model.family].license, 'Apache-2.0');
  assert.equal(catalog.families[model.family].vocabSize, 32000);
  assert.equal(model.contextSize, 2048);
  assert.equal(model.webllm.f16.id, 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC');
  assert.equal(model.webllm.f32.id, 'TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC');
  assert.ok(model.webllm.f16.vramMB > catalog.tiers.small.webllm.f16.vramMB);
  assert.ok(model.webllm.f16.vramMB < catalog.tiers.medium.webllm.f16.vramMB);
  assert.equal(model.gguf.file, 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');
  assert.equal(model.gguf.sizeMB, 638);
});

test('TinyLlama setups resolve for both engines without changing existing context limits or recommendations', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => url.pathname.endsWith('/catalog.json')
      ? JSON.parse(readFileSync(url, 'utf8'))
      : { webllm: {}, gguf: {} },
  });
  let models;
  try {
    models = await import('../models.js');
  } finally {
    globalThis.fetch = originalFetch;
  }
  for (const variant of ['f16', 'f32']) {
    const setup = models.validateConfig({ engine: 'webllm', tier: 'balanced', variant });
    assert.equal(models.modelContextSize(setup), 2048);
    assert.equal(models.resolveSource(setup).id, models.CATALOG.tiers.balanced.webllm[variant].id);
    assert.equal(models.describeModel(setup).label, 'TinyLlama 1.1B');
    assert.equal(models.parameterCount('balanced').count, 1.1e9);
  }
  const cpu = models.validateConfig({ engine: 'wllama', tier: 'balanced' });
  assert.equal(models.modelContextSize(cpu), 2048);
  assert.equal(models.resolveSource(cpu).repo, 'TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF');
  assert.equal(models.modelContextSize({ engine: 'webllm', tier: 'medium' }), 4096);
  assert.equal(models.modelContextSize({ engine: 'wllama', tier: 'medium' }), 2048);
  assert.equal(models.countLocalModels().total, 15);
  const caps = { wasm: true, wasmSimd: true, secureContext: true, webgpu: { available: true, f16: true }, deviceMemoryGB: 8, mobile: false, cores: 8, threads: true, storageFreeMB: 10000 };
  assert.equal(models.recommend(caps).tier, 'medium');
  assert.equal(models.incompatibility('webllm', 'balanced', caps), '');
  assert.equal(models.incompatibility('wllama', 'balanced', caps), '');
});

test('evaluation and chat share message construction without mutating conversation history', async () => {
  const { buildModelMessages } = await import('../models.js');
  const settings = { systemPrompt: 'Give one hint.', maxTokens: 144 };
  const history = [{ role: 'user', content: 'How do I start?' }];
  const small = buildModelMessages({ engine: 'wllama', tier: 'small' }, settings, history);
  assert.equal(small[0].role, 'system');
  assert.match(small[0].content, /Never repeat the question/);
  assert.equal(small[1].content, `${small[0].content}\n\nHow do I start?`);
  assert.equal(history[0].content, 'How do I start?');
  const native = buildModelMessages({ engine: 'webllm', tier: 'balanced' }, settings, history);
  assert.equal(native[1].content, 'How do I start?');
  const longHistory = [{ role: 'user', content: 'old '.repeat(4000) },
    { role: 'assistant', content: 'old answer' }, ...history];
  const trimmed = buildModelMessages({ engine: 'wllama', tier: 'balanced' }, settings, longHistory);
  assert.equal(trimmed.length, 2);
  assert.equal(trimmed[1].content, 'How do I start?');
});

test('dinner-party guests use the tested card and Rosa is the preset guest', () => {
  const activity = getExperiment('dinner-party');
  const guests = activity.steps[0].actions.filter((action) => action.settings);
  assert.deepEqual(guests.map((guest) => guest.label), ['Seat Rosa (1930)', 'Seat Daniel (1960)', 'Seat Mei (1990)']);
  assert.equal(guests[0].settings.systemPrompt, activity.settings.systemPrompt);
  for (const [guest, name, year] of guests.map((item, index) => [item, ['Rosa', 'Daniel', 'Mei'][index], ['1930', '1960', '1990'][index]])) {
    const prompt = guest.settings.systemPrompt;
    assert.match(prompt, new RegExp(`^You are ${name}, .* in ${year}\\.`));
    assert.match(prompt, /You care about .*You worry that/);
    assert.match(prompt, /You only know your own time/);
    assert.match(prompt, new RegExp(`Stay true to what you care about.*${name}\\.$`));
    assert.doesNotMatch(prompt, /User:|Assistant:/);
  }
  assert.ok(activity.steps[1].actions.every((action) => action.prompt && /says/.test(action.prompt)), 'relay buttons model a student retelling');
  assert.equal(activity.settings.maxTokens, 96);
});

test('revised experiment prompts keep comparison and restoration controls consistent', () => {
  const action = (id, label) => getExperiment(id).steps.flatMap((step) => step.actions || []).find((item) => item.label === label);
  assert.equal(action('silly-rule', 'Original rule').settings.systemPrompt, getExperiment('silly-rule').settings.systemPrompt);
  const strict = action('silly-rule', 'Stricter rule').settings.systemPrompt;
  assert.notEqual(strict, getExperiment('silly-rule').settings.systemPrompt);
  assert.match(strict, /curvy yellow fruit/, 'the stricter rule gives the model an allowed answer');
  assert.match(strict, /riddles, spelling games, joined letters and pretend play/);
  assert.equal(action('coach', 'Coach mode').settings.systemPrompt, getExperiment('coach').settings.systemPrompt);
  assert.doesNotMatch(getExperiment('coach').settings.systemPrompt, /3\/4 equals 6\/8/);
  assert.equal(action('bug-hunt', 'Step-by-step rule').settings.systemPrompt, getExperiment('bug-hunt').settings.systemPrompt);
  assert.match(getExperiment('story').settings.systemPrompt, /For feedback, start with "Tip:"/);
  assert.doesNotMatch(getExperiment('story').settings.systemPrompt, /Always reply with a numbered list/);
});

test('experiment hint storage migrates legacy unversioned keys', () => {
  const migrateHintKeys = (value) => {
    let parsed;
    try { parsed = JSON.parse(value || '[]'); } catch { return []; }
    if (!Array.isArray(parsed)) return [];
    return parsed.map((key) => typeof key === 'string' && !key.includes('@') ? `${key}@1` : key);
  };
  assert.deepEqual(migrateHintKeys('["shakespeare","creativity@2"]'), ['shakespeare@1', 'creativity@2']);
  assert.deepEqual(migrateHintKeys('not json'), []);
});

test('grid options preserve precision, filters and explicit boolean flags', () => {
  const options = parseGridOptions(['--variant=f32', '--experiments=shakespeare,coach', '--holdout=false', '--rescore=true']);
  assert.equal(options.variant, 'f32');
  assert.equal(options.experiments, 'shakespeare,coach');
  assert.equal(options.holdout, false);
  assert.equal(options.rescore, true);
  assert.equal(parseGridOptions([]).variant, 'f16');
  assert.equal(parseGridOptions(['--engine=wllama']).variant, '');
  assert.equal(parseGridOptions(['--holdout']).holdout, true);
  assert.equal(parseGridOptions(['--prompts=folder/name=example.mjs']).prompts, 'folder/name=example.mjs');
});

test('grid options reject unknown names, experiments and invalid values', () => {
  for (const args of [
    ['--unknown-option=yes'], ['--experiments=not-a-real-id'], ['--experiments='],
    ['--variant=f64'], ['--engine=wllama', '--variant=f32'], ['--tiers='],
    ['--tiers=tiny,not-a-tier'], ['--sampling=unknown'], ['--holdout=maybe'],
    ['--rescore=maybe'], ['--repetitions=0'], ['--reference=../baseline'], ['phase'],
  ]) {
    assert.throws(() => parseGridOptions(args), undefined, args.join(' '));
  }
});

test('grid selections reject empty matches before loading Playwright', () => {
  for (const args of [['--variants=not-a-prompt-variant'], ['--experiments=dinner-party', '--holdout']]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./prompt-grid.mjs', import.meta.url)), ...args], {
      encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_MODULE: 'missing-playwright-module.mjs' },
    });
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, /No evaluation cases match/);
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
  }
});

test('evaluation tools do not pin stale app module cache versions', () => {
  const { version } = JSON.parse(readFileSync(new URL('../version.json', import.meta.url), 'utf8'));
  const source = readFileSync(new URL('./prompt-grid.mjs', import.meta.url), 'utf8');
  for (const match of source.matchAll(/[?&]v=(\d+\.\d+(?:\.\d+)?)/g)) {
    assert.equal(match[1], version, 'committed evaluator uses the current cache version');
  }
});

test('optional local role evaluator uses the current cache version', {
  skip: !existsSync(new URL('../test-results/role-dialog.mjs', import.meta.url)),
}, () => {
  const { version } = JSON.parse(readFileSync(new URL('../version.json', import.meta.url), 'utf8'));
  const source = readFileSync(new URL('../test-results/role-dialog.mjs', import.meta.url), 'utf8');
  for (const match of source.matchAll(/[?&]v=(\d+\.\d+(?:\.\d+)?)/g)) {
    assert.equal(match[1], version, 'local evaluator uses the current cache version');
  }
});

test('release labels and the entire local module graph use the same cache version', () => {
  const { version } = JSON.parse(readFileSync(new URL('../version.json', import.meta.url), 'utf8'));
  const visited = new Set();
  function checkModule(moduleUrl) {
    assert.equal(moduleUrl.search, `?v=${version}`, moduleUrl.href);
    assert.ok(existsSync(moduleUrl), moduleUrl.href);
    if (visited.has(moduleUrl.href)) return;
    visited.add(moduleUrl.href);
    const source = readFileSync(moduleUrl, 'utf8');
    for (const match of source.matchAll(/['"](\.{1,2}\/[^'"]+\.js(?:\?[^'"]*)?)['"]/g)) {
      checkModule(new URL(match[1], moduleUrl));
    }
  }
  for (const page of ['index.html', 'experiments.html', 'chat.html', 'licenses.html']) {
    const pageUrl = new URL(`../${page}`, import.meta.url);
    const html = readFileSync(pageUrl, 'utf8');
    assert.ok(html.includes(`<small class="app-version">v${version}</small>`), page);
    assert.ok(html.includes(`href="styles.css?v=${version}"`), page);
    const script = html.match(/<script type="module" src="([^"]+)"/);
    assert.ok(script, page);
    checkModule(new URL(script[1], pageUrl));
  }
});

test('release stamping changes only cache tokens and release labels, not model names or settings', () => {
  const source = '<small class="app-version">v1.1</small> styles.css?v=1.1 ./engines/webllm-worker.js?v=1.1 TinyLlama 1.1B temperature: 1.1';
  const updated = updateVersionReferences(source, '1.2');
  assert.equal(updated, '<small class="app-version">v1.2</small> styles.css?v=1.2 ./engines/webllm-worker.js?v=1.2 TinyLlama 1.1B temperature: 1.1');
  assert.equal(updateVersionReferences(updated, '1.2'), updated);
  assert.equal(updateVersionReferences('chat.js?v=1.2.3', '1.3'), 'chat.js?v=1.3');
});

test('release command detects stale references without writing and stamps from one manifest', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tiny-thinker-release-'));
  try {
    mkdirSync(join(directory, 'engines'));
    mkdirSync(join(directory, 'tests'));
    mkdirSync(join(directory, 'models'));
    const manifestPath = join(directory, 'version.json');
    writeFileSync(manifestPath, JSON.stringify({ version: '1.2' }));
    const fixtures = new Map([
      ['index.html', '<small class="app-version">v1.1</small><link href="styles.css?v=1.1">'],
      ['chat.js', 'import "./models.js?v=1.1";'],
      [join('engines', 'engine.js'), 'new Worker("./worker.js?v=1.1");'],
      [join('tests', 'browser-smoke.mjs'), 'import("./tour.js?v=1.1");'],
    ]);
    for (const [file, source] of fixtures) writeFileSync(join(directory, file), source);
    const modelPath = join(directory, 'models', 'metadata.json');
    writeFileSync(modelPath, JSON.stringify({ name: 'TinyLlama 1.1B', url: 'upstream?v=1.1' }));
    assert.throws(() => release(['--check'], directory), /stale references/);
    for (const [file, source] of fixtures) assert.equal(readFileSync(join(directory, file), 'utf8'), source);
    assert.throws(() => release(['invalid'], directory), /Release version must/);
    release([], directory);
    for (const [file, source] of fixtures) {
      assert.equal(readFileSync(join(directory, file), 'utf8'), updateVersionReferences(source, '1.2'));
    }
    assert.doesNotThrow(() => release(['--check'], directory));
    release(['1.3'], directory);
    assert.equal(JSON.parse(readFileSync(manifestPath, 'utf8')).version, '1.3');
    for (const [file, source] of fixtures) {
      assert.equal(readFileSync(join(directory, file), 'utf8'), updateVersionReferences(source, '1.3'));
    }
    assert.deepEqual(JSON.parse(readFileSync(modelPath, 'utf8')), { name: 'TinyLlama 1.1B', url: 'upstream?v=1.1' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('deployment snapshots include runtime, manifest models and licenses but exclude local artifacts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tiny-thinker-deployment-'));
  try {
    const fixture = (file, contents = file) => {
      mkdirSync(join(directory, file, '..'), { recursive: true });
      writeFileSync(join(directory, file), contents);
    };
    for (const file of DEPLOYMENT_FILES) fixture(file);
    fixture('version.json', JSON.stringify({ version: '1.3' }));
    const build = { path: 'gguf/tiny/model.gguf', licenseFile: 'gguf/tiny/LICENSE', attributionFile: 'gguf/tiny/ATTRIBUTION.txt' };
    const gpu = { model: 'webllm/tiny/resolve/main/', lib: 'webllm/libs/tiny.wasm',
      licenseFile: 'webllm/tiny/LICENSE', attributionFile: 'webllm/tiny/ATTRIBUTION.txt' };
    fixture('models/manifest.json', JSON.stringify({ webllm: { tiny: gpu }, gguf: { tiny: build } }));
    for (const file of [...Object.values(build), 'gguf/tiny/NOTICE']) fixture(`models/${file}`);
    for (const file of [gpu.lib, gpu.licenseFile, gpu.attributionFile, 'webllm/libs/ATTRIBUTION.txt',
      'webllm/tiny/resolve/main/mlc-chat-config.json', 'webllm/tiny/resolve/main/tokenizer.json', 'webllm/tiny/resolve/main/params_shard_0.bin',
      'webllm/tiny/resolve/main/params_shard_1.bin.part', 'webllm/tiny/resolve/main/.complete', 'webllm/tiny/resolve/main/.inventory.json',
      'webllm/tiny/resolve/main/params_shard_0.bin.revision']) fixture(`models/${file}`);
    for (const file of ['test-results/notes.txt', 'node_modules/private.js', 'scratch.js', 'serve.py', 'models/unused/model.gguf', 'models/gguf/tiny/model.gguf.part']) fixture(file);
    const preview = prepareDeployment({ directory, dryRun: true });
    assert.equal(preview.output, null);
    assert.equal(existsSync(join(directory, 'deployment')), false, 'dry run creates no output folder');
    const first = prepareDeployment({ directory });
    assert.deepEqual(first.files, preview.files);
    for (const file of first.files) assert.deepEqual(readFileSync(join(first.output, file)), readFileSync(join(directory, file)));
    assert.ok(first.files.includes(join('models', 'gguf', 'tiny', 'NOTICE')));
    assert.ok(first.files.includes(join('models', 'webllm', 'tiny', 'resolve', 'main', 'params_shard_0.bin')));
    assert.ok(first.files.includes(join('models', 'webllm', 'libs', 'tiny.wasm')));
    assert.equal(first.files.some((file) => /\.part$|\.revision$|\.complete$|\.inventory\.json$/.test(file)), false);
    for (const file of ['test-results', 'node_modules', 'scratch.js', 'serve.py', 'models/unused', 'models/gguf/tiny/model.gguf.part']) {
      assert.equal(existsSync(join(first.output, file)), false, file);
    }
    writeFileSync(join(first.output, 'keep.txt'), 'user-added record');
    const second = prepareDeployment({ directory });
    assert.notEqual(first.output, second.output);
    assert.equal(readFileSync(join(first.output, 'keep.txt'), 'utf8'), 'user-added record');
    assert.throws(() => prepareDeployment({ directory, outputRoot: join(directory, 'models') }), /outside the source/);
    fixture('models/manifest.json', JSON.stringify({ webllm: {}, gguf: { tiny: { ...build, path: '../version.json' } } }));
    assert.throws(() => prepareDeployment({ directory, dryRun: true }), /escapes models/);
    fixture('models/manifest.json', JSON.stringify({ webllm: {}, gguf: { tiny: { ...build, path: 'gguf/tiny/model.gguf.part' } } }));
    assert.throws(() => prepareDeployment({ directory, dryRun: true }), /local-only asset/);
    fixture('models/manifest.json', JSON.stringify({ webllm: {}, gguf: { tiny: { ...build, path: 'gguf/tiny/missing.gguf' } } }));
    assert.throws(() => prepareDeployment({ directory, dryRun: true }), /Missing deployment asset/);
    rmSync(join(directory, 'models', 'manifest.json'));
    assert.throws(() => prepareDeployment({ directory, dryRun: true }), /Missing models\/manifest.json/);
    fixture('models/manifest.json', JSON.stringify({ webllm: {}, gguf: {} }));
    fixture('index.html', '<small class="app-version">v1.2</small>');
    assert.throws(() => prepareDeployment({ directory, dryRun: true }), /stale references/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('deployment CLI documents options and rejects unknown or incomplete flags', () => {
  const script = fileURLToPath(new URL('../prepare-deployment.mjs', import.meta.url));
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--dry-run.*--output-root/);
  for (const args of [['--unknown'], ['--output-root'], ['--output-root', '--dry-run']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown or incomplete option/);
  }
});

/** Creates a minimal local-storage implementation for badge tests.
 * @param {string|null} value Initial JSON or raw value.
 * @returns {{getItem: (key: string) => string|null, setItem: (key: string, next: string) => void}} Storage-like object.
 */
function progressStorage(value = null) {
  return {
    getItem() { return value; },
    setItem(key, next) { value = next; },
  };
}

test('experiment badges persist and promote after one, two and five interactions', () => {
  const storage = progressStorage();
  assert.equal(experimentBadgeLevel('shakespeare', storage), 0);
  assert.equal(recordExperimentInteraction('shakespeare', storage), 1);
  assert.equal(experimentBadgeLevel('shakespeare', storage), 1);
  assert.equal(recordExperimentInteraction('shakespeare', storage), 2);
  assert.equal(recordExperimentInteraction('shakespeare', storage), 2);
  assert.equal(experimentBadgeLevel('shakespeare', storage), 2);
  const returningStorage = progressStorage(storage.getItem());
  assert.equal(recordExperimentInteraction('shakespeare', returningStorage), 2);
  assert.equal(recordExperimentInteraction('shakespeare', returningStorage), 3);
  assert.equal(experimentBadgeLevel('shakespeare', returningStorage), 3);
  assert.equal(recordExperimentInteraction('shakespeare', returningStorage), 3);
  assert.equal(JSON.parse(returningStorage.getItem()).shakespeare, 5);
  assert.equal(experimentBadgeLevel('story', storage), 0);
  assert.equal(recordExperimentInteraction('story', storage), 1);
  assert.equal(experimentBadgeLevel('shakespeare', storage), 2);
});

test('development progress reset removes all badges without clearing other saved data', () => {
  const values = new Map([
    ['tinythinker.experiment-progress', '{"shakespeare":5,"story":2}'],
    ['other-setting', 'keep'],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
  };
  assert.equal(experimentBadgeLevel('shakespeare', storage), 3);
  assert.equal(resetExperimentProgress(storage), true);
  assert.equal(experimentBadgeLevel('shakespeare', storage), 0);
  assert.equal(experimentBadgeLevel('story', storage), 0);
  assert.equal(storage.getItem('tinythinker.experiment-progress'), null);
  assert.equal(storage.getItem('other-setting'), 'keep');
  assert.equal(resetExperimentProgress({ removeItem() { throw new Error('blocked'); } }), false);
});

test('existing two-level badge progress carries forward without losing earned badges', () => {
  const storage = progressStorage('{"shakespeare":2,"story":1}');
  assert.equal(experimentBadgeLevel('story', storage), 1);
  assert.equal(experimentBadgeLevel('shakespeare', storage), 2);
  assert.equal(recordExperimentInteraction('shakespeare', storage), 2);
  assert.equal(recordExperimentInteraction('shakespeare', storage), 2);
  assert.equal(recordExperimentInteraction('shakespeare', storage), 3);
});

test('free chat and unknown experiments cannot earn badges', () => {
  const storage = progressStorage();
  for (const id of ['', null, '__proto__', 'unknown']) {
    assert.equal(recordExperimentInteraction(id, storage), 0);
    assert.equal(experimentBadgeLevel(id, storage), 0);
  }
  assert.equal(storage.getItem(), null);
});

test('badge progress handles corrupt data and unavailable storage without breaking chat', () => {
  for (const value of ['bad JSON', 'null', '[]', '{"shakespeare":-1}', '{"shakespeare":"2"}', '{"shakespeare":1.5}']) {
    const storage = progressStorage(value);
    assert.equal(experimentBadgeLevel('shakespeare', storage), 0);
    assert.equal(recordExperimentInteraction('shakespeare', storage), 1);
  }
  const unavailable = {
    getItem() { throw new Error('Storage disabled'); },
    setItem() { throw new Error('Storage disabled'); },
  };
  assert.equal(experimentBadgeLevel('shakespeare', unavailable), 0);
  assert.equal(recordExperimentInteraction('shakespeare', unavailable), 0);
});

test('all fourteen modes have valid presets and clickable step actions', () => {
  assert.equal(EXPERIMENTS.length, 14);
  assert.equal(new Set(EXPERIMENTS.map((item) => item.id)).size, 14);
  for (const activity of EXPERIMENTS) {
    assert.match(activity.id, /^[a-z-]+$/);
    for (const key of ['title', 'minutes', 'concept', 'objective', 'notice', 'entry', 'stretch']) {
      assert.equal(typeof activity[key], 'string');
      assert.ok(activity[key].length);
    }
    assert.equal(activity.steps.length, 3);
    const actions = activity.steps.flatMap((step) => step.actions || []);
    assert.ok(activity.steps.every((step) => step.text.length));
    assert.ok(actions.filter((action) => action.prompt).length >= 2, `${activity.id} has question buttons`);
    for (const action of actions) {
      assert.ok(action.label.length && action.label.length <= 24, `${action.label} is short`);
      assert.ok(Boolean(action.prompt) !== Boolean(action.settings), 'action either fills a question or changes settings');
      if (action.prompt) assert.ok(action.prompt.length < 2000);
      if (action.settings) {
        const merged = { ...activity.settings, ...action.settings };
        assert.ok(merged.systemPrompt.length < 1000);
        assert.ok(merged.temperature >= 0 && merged.temperature <= 1.5);
        assert.ok(Object.keys(action.settings).every((key) => key in activity.settings));
      }
    }
    assert.ok(activity.settings.systemPrompt.length < 1000);
    if (activity.hint) {
      assert.ok(Number.isInteger(activity.hint.version) && activity.hint.version >= 1, `${activity.id} hint has a positive integer version`);
      assert.ok(['system-prompt', 'temperature', 'max-tokens'].includes(activity.hint.field), `${activity.id} hint points at a settings field`);
      assert.ok(activity.hint.title.length <= 32 && activity.hint.text.length <= 240, `${activity.id} hint is short`);
    }
    const settingActions = actions.filter((action) => action.settings);
    if (settingActions.length && ['shakespeare', 'silly-rule', 'creativity', 'story', 'facts', 'languages', 'bug-hunt', 'coach', 'turtle', 'dinner-party'].includes(activity.id)) {
      assert.ok(activity.hint, `${activity.id} has a hint for setting changes`);
    }
    assert.ok(activity.settings.maxTokens >= 16 && activity.settings.maxTokens <= 256);
    assert.equal(activity.settings.maxTokens % 16, 0);
    assert.ok(activity.settings.temperature >= 0 && activity.settings.temperature <= 1.5);
  }
});

test('setting changes are described in plain words', () => {
  assert.equal(describeChange({ temperature: 1.2 }), 'temperature 1.2');
  assert.equal(describeChange({ systemPrompt: 'x', maxTokens: 64 }), 'new system prompt, max reply tokens 64');
});

test('voice comparison uses expressive scenes without prescribing a specific voice in the question', () => {
  const actions = getExperiment('shakespeare').steps[0].actions;
  assert.deepEqual(actions.map((action) => action.label), ['Rally the crew', 'Grand invitation']);
  for (const action of actions) {
    assert.match(action.prompt, /voice you have been given/);
    assert.match(action.prompt, /three short sentences/);
    assert.doesNotMatch(action.prompt, /Shakespeare|pirate|Hark|Arrr|sky blue/i);
  }
});

test('Shakespeare voice uses sustained Early Modern English and restores the same preset', () => {
  const activity = getExperiment('shakespeare');
  const prompt = activity.settings.systemPrompt;
  const restore = activity.steps.flatMap((step) => step.actions || [])
    .find((action) => action.label === 'Back to Shakespeare');
  assert.match(prompt, /Elizabethan \(Early Modern\) English/);
  assert.match(prompt, /Always begin every reply with "Hark!"/);
  assert.match(prompt, /Keep this voice in every sentence/);
  assert.match(prompt, /"doth", "hath", "art"/);
  assert.match(prompt, /Answer the request/);
  assert.match(prompt, /Sample of the voice: Hark![\s\S]*doth[\s\S]*thy/);
  assert.doesNotMatch(prompt, /User:|Assistant:/, 'dialogue examples make small models continue a fake conversation');
  assert.equal(restore.settings.systemPrompt, prompt);
});

test('pirate voice supplies explicit style rules and an example without changing generation settings', () => {
  const action = getExperiment('shakespeare').steps.flatMap((step) => step.actions || [])
    .find((item) => item.label === 'Pirate voice');
  assert.deepEqual(Object.keys(action.settings), ['systemPrompt']);
  assert.match(action.settings.systemPrompt, /Always begin every reply with "Arrr, matey!"/);
  assert.match(action.settings.systemPrompt, /"ye" instead of "you"/);
  assert.match(action.settings.systemPrompt, /"yer" instead of "your"/);
  assert.match(action.settings.systemPrompt, /Answer the request/);
  assert.match(action.settings.systemPrompt, /Sample of the voice: Arrr, matey!/);
  assert.doesNotMatch(action.settings.systemPrompt, /User:|Assistant:/);
});

test('activity routes accept only catalog IDs and preserve engine parameters', () => {
  assert.equal(getExperiment('__proto__'), null);
  const params = new URLSearchParams(withExperiment('engine=wllama&tier=tiny', 'shakespeare'));
  assert.equal(params.get('engine'), 'wllama');
  assert.equal(params.get('experiment'), 'shakespeare');
  assert.equal(new URLSearchParams(withExperiment(params, 'bad-id')).has('experiment'), false);
});

test('preset customization compares all three effective settings', () => {
  const settings = EXPERIMENTS[0].settings;
  assert.ok(settingsMatch(settings, { ...settings }));
  for (const change of [{ temperature: 0.1 }, { maxTokens: 64 }, { systemPrompt: 'Different' }]) {
    assert.equal(settingsMatch(settings, { ...settings, ...change }), false);
  }
});

test('local notes include the actual per-turn settings and student reflection', () => {
  const notes = formatNotes({ activity: EXPERIMENTS[0], model: 'CPU tiny', settings: EXPERIMENTS[0].settings,
    turns: [{ prompt: '<script>not html</script>', settings: { temperature: 1 }, reply: 'Hello', studentEditedCode: 'FD 50 RT 90' }], reflection: 'My prediction' });
  assert.ok(notes.includes('Mode: 1. Shakespeare remix'));
  assert.ok(notes.includes('"temperature": 1'));
  assert.ok(notes.includes('"studentEditedCode": "FD 50 RT 90"'));
  assert.ok(notes.includes('My prediction'));
  assert.ok(notes.includes('<script>not html</script>'));
});

test('turtle code extractor removes fences without silently changing a program', () => {
  const fenced = 'Here is the square:\n```logo\nCOLOR blue\nREPEAT 4 [ FD 60 RT 90 ]\n```\nEnjoy!';
  assert.equal(extractTurtleCode(fenced), 'COLOR blue\nREPEAT 4 [ FD 60 RT 90 ]');

  const inline = 'Assistant: COLOR red REPEAT 3 [ FD 70 RT 120 ]';
  assert.equal(extractTurtleCode(inline), 'COLOR red REPEAT 3 [ FD 70 RT 120 ]');

  const echoedPrompt = 'User: Draw a blue square with side 60.\nAssistant: CS PD SETPENCOLOR 1 REPEAT 4 [ FD 60 RT 90 ] User: Draw a star.';
  assert.equal(extractTurtleCode(echoedPrompt), 'CS PD SETPENCOLOR 1 REPEAT 4 [ FD 60 RT 90 ]');

  const cutOff = 'FD 60 RT 90\nFD 60 RT';
  assert.equal(extractTurtleCode(cutOff), cutOff);
});

test('turtle accepts Berkeley-style pen commands and full movement names', async () => {
  const square = await runTurtle('SETPENCOLOR 1 SETPENSIZE [3 3] REPEAT 4 [FORWARD 60 RIGHT 90]');
  assert.deepEqual(square.errors, []);
  assert.equal(square.segments.length, 4);
  assert.equal(square.segments[0].width, 3);
  assert.ok(Math.abs(square.turtle.x) < 1e-6 && Math.abs(square.turtle.y) < 1e-6);
});

test('turtle preserves procedures, repeated lines, unknown lines and truncated output', async () => {
  const program = 'TO SQUARE :SIZE\nREPEAT 4 [ FD :SIZE RT 360/4 ]\nEND\nSETPENCOLOR "gold\nSQUARE 40';
  const extracted = extractTurtleCode(`Here is your drawing:\n\`\`\`logo\n${program}\n\`\`\`\nExplanation.`);
  assert.equal(extracted, program);
  const square = await runTurtle(extracted);
  assert.deepEqual(square.errors, []);
  assert.equal(square.segments.length, 4);
  const repeated = Array(6).fill('FD 10').join('\n');
  assert.equal(extractTurtleCode(repeated), repeated);
  assert.equal((await runTurtle(repeated)).segments.length, 6);
  assert.equal(extractTurtleCode('FD 20\nUNKNOWN 3\nRT 90'), 'FD 20\nUNKNOWN 3\nRT 90');
  assert.ok((await runTurtle(extractTurtleCode('FD 20\nRT'))).errors.length);
  assert.equal(extractTurtleCode('```logo\nFD 10\n```\n```logo\nFD 20\n```'), 'FD 10');
});

test('turtle uses Logo coordinates, heading, HOME, CLEAN and CLEARSCREEN semantics', async () => {
  const position = await runTurtle('PU SETPOS [20 30] PD SETH 90 FD 10 HOME');
  assert.deepEqual(position.errors, []);
  assert.equal(position.segments.length, 2);
  assert.equal(position.segments[0].y1, -30);
  assert.equal(position.turtle.x, 0);
  assert.equal(position.turtle.y, 0);
  assert.equal(position.turtle.angle, 0);
  const clean = await runTurtle('FD 30 CLEAN RT 90 FD 20');
  assert.equal(clean.segments.length, 1);
  assert.equal(clean.segments[0].y1, -30);
  const cleared = await runTurtle('FD 30 CS RT 90 FD 20');
  assert.equal(cleared.segments.length, 1);
  assert.equal(cleared.segments[0].y1, 0);
});

test('turtle supports RGB lists, arithmetic, variables, nested repeats and arcs', async () => {
  const rays = await runTurtle('MAKE "rays 8 SETPC [99 0 0] SETPENSIZE 3 REPEAT :rays [ FD REPCOUNT * 10 BK REPCOUNT * 10 RT 360/:rays ] HT');
  assert.deepEqual(rays.errors, []);
  assert.equal(rays.segments.length, 16);
  assert.equal(rays.segments[0].color, '#ff0000');
  assert.equal(rays.turtle.visible, false);
  assert.equal((await runTurtle('REPEAT 3 [ REPEAT 4 [ FD 10 RT 90 ] RT 120 ]')).segments.length, 12);
  const arc = await runTurtle('ARC 90 40');
  assert.deepEqual(arc.errors, []);
  assert.equal(arc.segments.length, 18);
  assert.equal(arc.turtle.x, 0);
  assert.equal(arc.turtle.y, 0);
});

test('turtle bounds execution and rejects unsupported host access without silently clamping', async () => {
  for (const program of [
    'REPEAT 2.5 [ FD 10 ]', 'REPEAT 361 [ FD 10 ]',
    'REPEAT 360 [ REPEAT 360 [ RT 1 ] ]', 'TO LOOP LOOP END LOOP',
    'TO HUGE 100000000 FD 1 END', 'FD 100000', 'SETPENSIZE 100',
    'LOAD "https://example.com', 'SHELL "whoami', 'JS "alert',
    '['.repeat(33) + ']'.repeat(33), 'FD 1 '.repeat(2500),
  ]) {
    assert.ok((await runTurtle(program)).errors.length, program);
  }
  const deepCall = await runTurtle('TO DEEP :N IF :N > 0 [ DEEP :N - 1 ] END DEEP 70');
  assert.match(deepCall.errors[0] || '', /64 levels/);
  assert.deepEqual((await runTurtle('REPEAT 0 [ FD 10 ]')).errors, []);
});

test('turtle preset teaches executable standard Logo within the prompt budget', async () => {
  const settings = getExperiment('turtle').settings;
  assert.ok(settings.systemPrompt.length < 1000);
  assert.match(settings.systemPrompt, /UCBLogo/);
  assert.match(settings.systemPrompt, /SETPENCOLOR/);
  assert.match(settings.systemPrompt, /SETPENSIZE \[2 2\]/);
  assert.match(settings.systemPrompt, /No prose, Markdown, Python or JavaScript/);
  assert.equal(settings.maxTokens, 192);
  const examples = [...settings.systemPrompt.matchAll(/^Assistant:\s*(.+)$/gm)].map((match) => match[1]);
  assert.equal(examples.length, 4);
  for (const example of examples) {
    const res = await runTurtle(example);
    assert.deepEqual(res.errors, [], example);
    assert.ok(res.segments.length >= 3, example);
  }
});

test('turtle interpreter runs REPEAT loops, pen state, colors, and reports syntax errors', async () => {
  const square = await runTurtle('COLOR red REPEAT 4 [ FD 50 RT 90 ]');
  assert.equal(square.errors.length, 0);
  assert.equal(square.segments.length, 4);
  assert.ok(Math.abs(square.turtle.x) < 1e-6 && Math.abs(square.turtle.y) < 1e-6);
  assert.equal(square.turtle.angle, 0);

  const penUp = await runTurtle('PU FD 40 PD FD 30');
  assert.equal(penUp.errors.length, 0);
  assert.equal(penUp.segments.length, 1);

  assert.deepEqual(parseTurtle('(COLOR blue) (WIDTH 2)').errors, []);
  const bad = parseTurtle('DRAW 50\nREPEAT 4 [ FD 20');
  assert.ok(bad.errors.some((error) => error.includes("Expected ']'")));
  const unknown = await runTurtle('DRAW 50');
  assert.ok(unknown.errors.some((error) => error.includes('DRAW')));
});