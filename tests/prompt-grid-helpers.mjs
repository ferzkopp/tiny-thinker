import assert from 'node:assert/strict';
import { EXPERIMENTS } from '../experiments.js';

/** Parses CLI options, rejecting unknown names and normalizing boolean flags.
 * @param {string[]} argv Command-line arguments excluding the executable and script.
 * @returns {object} Validated options, including the engine's model precision.
 */
export function parseGridOptions(argv) {
  const allowed = new Set(['engine', 'tiers', 'repetitions', 'phase', 'sampling', 'variant',
    'experiments', 'variants', 'reference', 'prompts', 'holdout', 'rescore']);
  const options = Object.fromEntries(argv.map((argument) => {
    assert.match(argument, /^--[a-z][a-z-]*(?:=.*)?$/, `Invalid option: ${argument}`);
    const separator = argument.indexOf('=');
    const name = argument.slice(2, separator < 0 ? undefined : separator);
    const value = separator < 0 ? 'true' : argument.slice(separator + 1);
    assert.ok(allowed.has(name), `Unknown option: --${name}`);
    assert.ok(value.length, `Empty value for --${name}`);
    return [name, value];
  }));
  for (const flag of ['holdout', 'rescore']) {
    if (options[flag] !== undefined) {
      assert.ok(['true', 'false'].includes(options[flag]), `--${flag} must be true or false`);
      options[flag] = options[flag] === 'true';
    }
  }
  const engine = options.engine ?? 'webllm';
  const tiers = (options.tiers ?? 'tiny,small,balanced,medium,quality').split(',');
  const repetitions = Number(options.repetitions ?? 1);
  const phase = options.phase ?? 'baseline';
  const sampling = options.sampling ?? 'temperature=0';
  const variant = engine === 'webllm' ? (options.variant ?? 'f16') : '';

  assert.match(phase, /^[a-z0-9-]+$/);
  assert.ok(['webllm', 'wllama'].includes(engine));
  assert.ok(tiers.length && tiers.every((tier) => ['tiny', 'small', 'balanced', 'medium', 'quality'].includes(tier)));
  assert.equal(new Set(tiers).size, tiers.length, 'Model tiers must not be repeated');
  assert.ok(Number.isInteger(repetitions) && repetitions > 0);
  assert.ok(['preset', 'temperature=0'].includes(sampling));
  if (engine === 'webllm') assert.ok(['f16', 'f32'].includes(variant));
  else assert.equal(options.variant, undefined, 'CPU inference does not accept --variant');
  if (options.reference !== undefined) assert.match(options.reference, /^[a-z0-9-]+$/);
  if (options.experiments !== undefined) {
    const knownIds = new Set(EXPERIMENTS.map((experiment) => experiment.id));
    for (const id of options.experiments.split(',')) {
      assert.ok(knownIds.has(id), `Unknown experiment: ${id}`);
    }
  }
  return { ...options, engine, tiers, repetitions, phase, sampling, variant };
}

/** Builds an activity-summary table for a prompt-grid result set.
 * @param {Array<object>} results Grid records.
 * @param {Array<{id: string}>} experiments Experiment catalog entries.
 * @returns {Array<{experiment: string, passed: number, total: number}>} Sorted summary rows.
 */
export function summarizeGrid(results, experiments) {
  return experiments.map(({ id }) => {
    const rows = results.filter((result) => result.experiment === id);
    return { experiment: id, passed: rows.filter((result) => result.passed).length, total: rows.length };
  }).filter((row) => row.total).sort((left, right) => left.passed / left.total - right.passed / right.total);
}

/** Validates and reads a JSON candidate-prompt file.
 * @param {string} filePath Candidate JSON path.
 * @param {(path: string, encoding: string) => Promise<string>} readFile File reader.
 * @returns {Promise<object|null>} Candidate map or null.
 */
export async function readJsonCandidates(filePath, readFile) {
  if (!filePath) return null;
  const candidates = JSON.parse(await readFile(filePath, 'utf8'));
  assert.ok(candidates && typeof candidates === 'object' && !Array.isArray(candidates));
  return candidates;
}
