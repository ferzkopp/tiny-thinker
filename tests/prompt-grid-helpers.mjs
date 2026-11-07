import assert from 'node:assert/strict';

/** Parses and validates command-line options used by the prompt-grid runner. */
export function parseGridOptions(argv) {
  const options = Object.fromEntries(argv.map((argument) => {
    const [name, value = 'true'] = argument.replace(/^--/, '').split('=');
    return [name, value];
  }));
  const engine = options.engine || 'webllm';
  const tiers = (options.tiers || 'tiny,small,balanced,medium,quality').split(',').filter(Boolean);
  const repetitions = Number(options.repetitions || 1);
  const phase = options.phase || 'baseline';
  const sampling = options.sampling === 'preset' ? 'preset' : 'temperature=0';

  assert.match(phase, /^[a-z0-9-]+$/);
  assert.ok(['webllm', 'wllama'].includes(engine));
  assert.ok(tiers.length && tiers.every((tier) => ['tiny', 'small', 'balanced', 'medium', 'quality'].includes(tier)));
  assert.ok(Number.isInteger(repetitions) && repetitions > 0);
  if (options.variant !== undefined) assert.ok(['f16', 'f32'].includes(options.variant));
  if (options.sampling !== undefined) assert.ok(['preset', 'temperature=0'].includes(options.sampling));
  return { ...options, engine, tiers, repetitions, phase, sampling };
}

/** Builds an activity-summary table for a prompt-grid result set. */
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

/** Validates and reads a JSON candidate-prompt file. */
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
