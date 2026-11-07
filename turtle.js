import { LogoInterpreter } from './vendor/jslogo/logo.js?v=1.3';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STAGE_SIZE = 240;
const MAX_REPEAT = 360;
const MAX_STEPS = 5000;
const MAX_COORD = 5000;
const MAX_SOURCE = 12000;

export const TURTLE_COLORS = {
  blue: '#2f6fde', red: '#d63939', green: '#1a7a43', orange: '#d97706',
  purple: '#7c3aed', pink: '#db2777', teal: '#0d9488', gold: '#b45309',
  black: '#1c2430', gray: '#5d6b7c', grey: '#5d6b7c', white: '#ffffff',
  yellow: '#ffff00', cyan: '#00ffff', magenta: '#ff00ff', lime: '#1a7a43',
  brown: '#a52a2a', tan: '#d2b48c', aquamarine: '#7fffd4', salmon: '#fa8072',
};

const ALIASES = {
  color: 'setpencolor', colour: 'setpencolor', width: 'setpensize',
  clear: 'clearscreen', reset: 'clearscreen', backward: 'back',
  fw: 'forward', move: 'forward', bw: 'back', turn: 'right',
  up: 'penup', down: 'pendown', center: 'home', penwidth: 'setpensize',
};
const PRIMITIVES = new Set((
  'forward fd back bk left lt right rt penup pu pendown pd home clean clearscreen cs ' +
  'setpos setxy setx sety setheading seth pos xcor ycor heading towards arc ' +
  'showturtle st hideturtle ht shownp shown? setpencolor setpc setcolor ' +
  'setpensize setwidth setpw pencolor pc pensize setbackground setbg background bg ' +
  'to make local localmake thing repeat repcount if ifelse stop output op ' +
  'sum difference minus product quotient remainder modulo int round sqrt power abs sin cos arctan true false'
).split(' '));

export function extractTurtleCode(text) {
  const source = String(text || '').replace(/\r\n?/g, '\n')
    .replace(/^\s*(?:(?:User|Human|Question|Prompt):[^\n]*\n\s*)+(?=Assistant:)/i, '')
    .replace(/^\s*Assistant:\s*/i, '')
    .split(/(?:\n|\s+)(?:User|Human|Question|Prompt):/i)[0];
  const blocks = [...source.matchAll(/```([^\n`]*)\n([\s\S]*?)(?:```|$)/g)];
  const block = blocks.find((match) => /^(?:logo|turtle|text|txt|plaintext)?\s*$/i.test(match[1])) || blocks[0];
  return (block ? block[2] : source).trim();
}

/** Validates source length and structural nesting before Logo interpretation.
 * @param {string} code Logo source.
 * @returns {string} Trimmed, bounded source.
 */
function checkedSource(code) {
  const source = String(code || '').trim();
  if (!source) throw new Error('No Logo commands found. Try REPEAT 4 [ FD 60 RT 90 ].');
  if (source.length > MAX_SOURCE) throw new Error(`Logo programs are limited to ${MAX_SOURCE} characters.`);
  let depth = 0;
  for (const symbol of source.replace(/;[^\n]*/g, '')) {
    if ('[({'.includes(symbol)) depth += 1;
    if ('])}'.includes(symbol)) depth = Math.max(0, depth - 1);
    if (depth > 32) throw new Error('Logo lists and expressions may nest at most 32 levels.');
  }
  return source;
}

/** Creates a sandboxed jslogo interpreter with resource limits and an optional dispatch callback.
 * @param {object} adapter Adapter exposing the allowed turtle operations.
 * @param {((operation: object) => void)|null} onDispatch Optional operation callback.
 * @returns {object} Configured Logo interpreter.
 */
function createInterpreter(adapter = {}, onDispatch = null) {
  const interpreter = new LogoInterpreter(adapter, {});
  for (const name of interpreter.routines.keys()) {
    if (!PRIMITIVES.has(name.toLowerCase())) interpreter.routines.delete(name);
  }
  for (const [alias, original] of Object.entries(ALIASES)) interpreter.copydef(alias, original);
  for (const name of Object.keys(TURTLE_COLORS)) {
    interpreter.routines.set(name, Object.assign(() => name, { minimum: 0, default: 0, maximum: 0, primitive: true }));
  }
  const repeat = interpreter.routines.get('repeat');
  interpreter.routines.set('repeat', Object.assign((count, statements) => {
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_REPEAT) {
      throw new Error(`REPEAT needs a whole number from 0 to ${MAX_REPEAT}.`);
    }
    return repeat.call(interpreter, count, statements);
  }, repeat));
  const dispatch = interpreter.dispatch;
  interpreter.dispatch = (name, tokens, natural) => {
    if (name.toLowerCase() === 'to') {
      let input = 1;
      while (typeof tokens[input] === 'string' && tokens[input].startsWith(':')) input += 1;
      if (input > 9 || Array.isArray(tokens[input]) || /^\d/.test(String(tokens[input]))) {
        throw new Error('TO supports up to eight required inputs, without optional inputs or custom arity.');
      }
    }
    const evaluate = dispatch(name, tokens, natural);
    return () => {
      if (interpreter.stack.length > 64) throw new Error('Logo procedure calls may nest at most 64 levels.');
      onDispatch?.();
      return evaluate();
    };
  };
  return interpreter;
}

export function parseTurtle(code) {
  try {
    return { ast: createInterpreter().parse(checkedSource(code)), errors: [] };
  } catch (error) {
    return { ast: [], errors: [error.message] };
  }
}

export async function runTurtle(code) {
  const result = {
    code: String(code || '').trim(), ast: [], segments: [], steps: 0, errors: [],
    turtle: { x: 0, y: 0, angle: 0, penDown: true, color: TURTLE_COLORS.blue, width: 2.5, visible: true },
  };
  const turtle = result.turtle;
  const started = Date.now();
  const number = (value) => {
    if (!Number.isFinite(value)) throw new Error('Logo drawing inputs must be finite numbers.');
    return value;
  };
  const color = (value) => {
    const name = String(value).toLowerCase();
    if (Object.hasOwn(TURTLE_COLORS, name)) return TURTLE_COLORS[name];
    if (/^#(?:[\da-f]{3}|[\da-f]{6})$/.test(name)) return name;
    throw new Error(`Unknown pen colour "${name}". Use a colour number, quoted name or RGB list.`);
  };
  const moveTo = (nextX, nextY) => {
    number(nextX);
    number(nextY);
    if (Math.abs(nextX) > MAX_COORD || Math.abs(nextY) > MAX_COORD) {
      throw new Error(`Drawing coordinates must stay within ${MAX_COORD} turtle steps.`);
    }
    if (turtle.penDown && Math.hypot(nextX - turtle.x, nextY - turtle.y) > 1e-9) {
      if (result.segments.length >= MAX_STEPS) throw new Error('Too many drawing segments. Use a smaller repeat.');
      result.segments.push({ x1: turtle.x, y1: turtle.y, x2: nextX, y2: nextY, color: turtle.color, width: turtle.width });
    }
    turtle.x = nextX;
    turtle.y = nextY;
  };
  const adapter = {
    move(distance) {
      const radians = turtle.angle * Math.PI / 180;
      moveTo(turtle.x + Math.sin(radians) * number(distance), turtle.y - Math.cos(radians) * distance);
    },
    turn(degrees) { this.heading = turtle.angle + number(degrees); },
    get position() { return [turtle.x, -turtle.y]; },
    set position(point) { moveTo(point[0] ?? turtle.x, point[1] === undefined ? turtle.y : -point[1]); },
    get heading() { return turtle.angle; },
    set heading(degrees) { turtle.angle = ((number(degrees) % 360) + 360) % 360; },
    get pendown() { return turtle.penDown; },
    set pendown(down) { turtle.penDown = down; },
    get color() { return turtle.color; },
    set color(value) { turtle.color = color(value); },
    get penwidth() { return turtle.width; },
    set penwidth(value) {
      if (number(value) <= 0 || value > 12) throw new Error('Pen size must be greater than 0 and at most 12.');
      turtle.width = value;
    },
    get visible() { return turtle.visible; },
    set visible(visible) { turtle.visible = visible; },
    get bgcolor() { return result.background || '#ffffff'; },
    set bgcolor(value) { result.background = color(value); },
    home() { moveTo(0, 0); turtle.angle = 0; },
    clear() { result.segments = []; },
    clearscreen() { this.clear(); turtle.x = 0; turtle.y = 0; turtle.angle = 0; },
    towards(nextX, nextY) { return ((Math.atan2(nextX - turtle.x, nextY + turtle.y) * 180 / Math.PI) + 360) % 360; },
    arc(degrees, radius) {
      if (Math.abs(number(degrees)) > 3600 || Math.abs(number(radius)) > MAX_COORD) throw new Error('ARC angle or radius is too large.');
      const count = Math.max(1, Math.ceil(Math.abs(degrees) / 5));
      let previous = null;
      for (let index = 0; index <= count; index += 1) {
        const radians = (turtle.angle + degrees * index / count) * Math.PI / 180;
        const point = [turtle.x + radius * Math.sin(radians), turtle.y - radius * Math.cos(radians)];
        if (point.some((value) => !Number.isFinite(value) || Math.abs(value) > MAX_COORD)) throw new Error('ARC exceeds drawing bounds.');
        if (previous && turtle.penDown) {
          if (result.segments.length >= MAX_STEPS) throw new Error('Too many drawing segments.');
          result.segments.push({ x1: previous[0], y1: previous[1], x2: point[0], y2: point[1], color: turtle.color, width: turtle.width });
        }
        previous = point;
      }
    },
  };
  try {
    const source = checkedSource(code);
    const interpreter = createInterpreter(adapter, () => {
      result.steps += 1;
      if (result.steps > MAX_STEPS || Date.now() - started > 1000) {
        throw new Error(`Stopped at the Logo execution limit (${MAX_STEPS} operations / 1 second).`);
      }
    });
    result.ast = interpreter.parse(source);
    await interpreter.execute(result.ast);
  } catch (error) {
    result.errors.push(error.message || String(error));
  }
  return result;
}

/** Creates an SVG element with attributes.
 * @param {string} tag SVG tag name.
 * @param {Record<string, string|number>} attrs Element attributes.
 * @returns {SVGElement} Configured SVG element.
 */
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/**
 * Renders the result of runTurtle() as a 240x240 SVG element, auto-fitting large drawings into view.
 * @param {Awaited<ReturnType<typeof runTurtle>>} result
 * @returns {SVGSVGElement}
 */
export function renderTurtleSvg(result) {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (const seg of result.segments) {
    minX = Math.min(minX, seg.x1, seg.x2);
    maxX = Math.max(maxX, seg.x1, seg.x2);
    minY = Math.min(minY, seg.y1, seg.y2);
    maxY = Math.max(maxY, seg.y1, seg.y2);
  }
  minX = Math.min(minX, result.turtle.x);
  maxX = Math.max(maxX, result.turtle.x);
  minY = Math.min(minY, result.turtle.y);
  maxY = Math.max(maxY, result.turtle.y);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfSpan = Math.max(80, (maxX - minX) / 2, (maxY - minY) / 2) * 1.15 + 14;
  const viewMinX = Math.round(cx - halfSpan);
  const viewMinY = Math.round(cy - halfSpan);
  const viewSize = Math.round(halfSpan * 2);
  const strokeScale = viewSize / STAGE_SIZE;

  const svg = svgEl('svg', {
    class: 'turtle-canvas',
    viewBox: `${viewMinX} ${viewMinY} ${viewSize} ${viewSize}`,
    width: STAGE_SIZE,
    height: STAGE_SIZE,
    role: 'img',
    'aria-label': result.segments.length
      ? `Turtle drawing with ${result.segments.length} line segments`
      : 'Empty turtle stage',
  });
  if (result.background) svg.style.backgroundColor = result.background;

  // Subtle axes and start dot so students can see (0, 0) and heading direction.
  svg.append(
    svgEl('line', {
      x1: viewMinX, y1: 0, x2: viewMinX + viewSize, y2: 0,
      class: 'turtle-axis',
      'stroke-width': (1 * strokeScale).toFixed(2),
      'stroke-dasharray': `${(3 * strokeScale).toFixed(1)} ${(3 * strokeScale).toFixed(1)}`,
    }),
    svgEl('line', {
      x1: 0, y1: viewMinY, x2: 0, y2: viewMinY + viewSize,
      class: 'turtle-axis',
      'stroke-width': (1 * strokeScale).toFixed(2),
      'stroke-dasharray': `${(3 * strokeScale).toFixed(1)} ${(3 * strokeScale).toFixed(1)}`,
    }),
    svgEl('circle', { cx: 0, cy: 0, r: (3 * strokeScale).toFixed(2), class: 'turtle-origin' }),
  );

  for (const seg of result.segments) {
    svg.append(svgEl('line', {
      x1: seg.x1.toFixed(2),
      y1: seg.y1.toFixed(2),
      x2: seg.x2.toFixed(2),
      y2: seg.y2.toFixed(2),
      stroke: seg.color,
      'stroke-width': (seg.width * strokeScale).toFixed(2),
      'stroke-linecap': 'round',
    }));
  }

  // Turtle cursor triangle pointing in `turtle.angle` direction.
  const size = 6.5 * strokeScale;
  const { x, y, angle, color } = result.turtle;
  const cursor = svgEl('polygon', {
    points: `0,${-size} ${size * 0.65},${size * 0.75} 0,${size * 0.35} ${-size * 0.65},${size * 0.75}`,
    transform: `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle.toFixed(1)})`,
    fill: color,
    'stroke-width': (1.2 * strokeScale).toFixed(2),
    class: 'turtle-cursor',
  });
  if (result.turtle.visible !== false) svg.append(cursor);
  return svg;
}
