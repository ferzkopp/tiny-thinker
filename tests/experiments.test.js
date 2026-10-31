// Unit tests for the mode catalog and its helpers (Node's built-in test runner, no browser needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPERIMENTS, getExperiment, withExperiment, settingsMatch, describeChange, formatNotes } from '../experiments.js';
import { extractTurtleCode, parseTurtle, runTurtle } from '../turtle.js';

test('all thirteen modes have valid presets and clickable step actions', () => {
  assert.equal(EXPERIMENTS.length, 13);
  assert.equal(new Set(EXPERIMENTS.map((item) => item.id)).size, 13);
  for (const activity of EXPERIMENTS) {
    assert.match(activity.id, /^[a-z-]+$/);
    for (const key of ['title', 'minutes', 'objective', 'notice', 'entry', 'stretch']) {
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
    assert.ok(activity.settings.maxTokens >= 16 && activity.settings.maxTokens <= 256);
    assert.equal(activity.settings.maxTokens % 16, 0);
    assert.ok(activity.settings.temperature >= 0 && activity.settings.temperature <= 1.5);
  }
});

test('setting changes are described in plain words', () => {
  assert.equal(describeChange({ temperature: 1.2 }), 'temperature 1.2');
  assert.equal(describeChange({ systemPrompt: 'x', maxTokens: 64 }), 'new system prompt, max reply tokens 64');
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
    turns: [{ prompt: '<script>not html</script>', settings: { temperature: 1 }, reply: 'Hello' }], reflection: 'My prediction' });
  assert.ok(notes.includes('Mode: 1. Shakespeare remix'));
  assert.ok(notes.includes('"temperature": 1'));
  assert.ok(notes.includes('My prediction'));
  assert.ok(notes.includes('<script>not html</script>'));
});

test('turtle code extractor strips fences, prose, and trailing incomplete tokens', () => {
  const fenced = 'Here is the square:\n```logo\nCOLOR blue\nREPEAT 4 [ FD 60 RT 90 ]\n```\nEnjoy!';
  assert.equal(extractTurtleCode(fenced), 'COLOR blue\nREPEAT 4 [ FD 60 RT 90 ]');

  const inline = 'Assistant: COLOR red REPEAT 3 [ FD 70 RT 120 ] in red';
  assert.equal(extractTurtleCode(inline), 'COLOR red REPEAT 3 [ FD 70 RT 120 ]');

  const cutOff = 'FD 60 RT 90\nFD 60 RT';
  assert.equal(extractTurtleCode(cutOff), 'FD 60 RT 90\nFD 60');
});

test('turtle interpreter runs REPEAT loops, pen state, colors, and reports syntax errors', () => {
  const square = runTurtle('COLOR red REPEAT 4 [ FD 50 RT 90 ]');
  assert.equal(square.errors.length, 0);
  assert.equal(square.segments.length, 4);
  assert.ok(Math.abs(square.turtle.x) < 1e-6 && Math.abs(square.turtle.y) < 1e-6);
  assert.equal(square.turtle.angle, 0);

  const penUp = runTurtle('PU FD 40 PD FD 30');
  assert.equal(penUp.errors.length, 0);
  assert.equal(penUp.segments.length, 1);

  const bad = parseTurtle('DRAW 50\nREPEAT 4 [ FD 20');
  assert.ok(bad.errors.some((e) => e.includes('unknown command "DRAW"')));
  assert.ok(bad.errors.some((e) => e.includes('missing closing "]"')));
});