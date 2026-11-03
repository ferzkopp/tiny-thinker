// Unit tests for the mode catalog and its helpers (Node's built-in test runner, no browser needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { EXPERIMENTS, getExperiment, withExperiment, settingsMatch, describeChange, formatNotes, experimentBadgeLevel, recordExperimentInteraction, resetExperimentProgress } from '../experiments.js';
import { extractTurtleCode, parseTurtle, runTurtle } from '../turtle.js';

test('release labels and the entire local module graph use the same cache version', () => {
  const version = '1.1';
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

test('all thirteen modes have valid presets and clickable step actions', () => {
  assert.equal(EXPERIMENTS.length, 13);
  assert.equal(new Set(EXPERIMENTS.map((item) => item.id)).size, 13);
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
  assert.match(prompt, /Always begin every reply with "Hark!" to get the reader's attention\./);
  assert.match(prompt, /Keep this voice throughout/);
  assert.match(prompt, /"thou art"[\s\S]*"doth"[\s\S]*"hath"/);
  assert.match(prompt, /answer the actual question clearly and accurately/);
  assert.match(prompt, /Example - User:[\s\S]*Assistant: Hark![\s\S]*doth[\s\S]*thy/);
  assert.equal(restore.settings.systemPrompt, prompt);
});

test('pirate voice supplies explicit style rules and an example without changing generation settings', () => {
  const action = getExperiment('shakespeare').steps.flatMap((step) => step.actions || [])
    .find((item) => item.label === 'Pirate voice');
  assert.deepEqual(Object.keys(action.settings), ['systemPrompt']);
  assert.match(action.settings.systemPrompt, /Always start every reply with "Arrr, matey!"/);
  assert.match(action.settings.systemPrompt, /"ye" instead of "you"/);
  assert.match(action.settings.systemPrompt, /"yer" instead of "your"/);
  assert.match(action.settings.systemPrompt, /Answer the actual question clearly and accurately/);
  assert.match(action.settings.systemPrompt, /Example - User:[\s\S]*Assistant: Arrr, matey!/);
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