import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

const NUMBER = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const operation = (count, name) => new RegExp(`^(${Array(count).fill(NUMBER).join(' ')}) ${name}$`, 'u');
const matrixOperation = operation(6, 'cm');
const rectangleOperation = operation(4, 're');

function concatenate([a, b, c, d, e, f], [g, h, i, j, k, l]) {
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j,
    a * k + c * l + e, b * k + d * l + f];
}

function rectangle([a, b, c, d, e, f], [x, y, width, height]) {
  assert.ok(b === 0 && c === 0 && a !== 0 && d !== 0, 'Expected axis-aligned Chromium print geometry');
  return { left: Math.min(a * x + e, a * (x + width) + e),
    right: Math.max(a * x + e, a * (x + width) + e),
    bottom: Math.min(d * y + f, d * (y + height) + f),
    top: Math.max(d * y + f, d * (y + height) + f) };
}

function contentStream(object) {
  assert.equal(typeof object, 'string', 'Expected the referenced page content object');
  const start = object.match(/stream\r?\n/u);
  assert.ok(start, 'Expected a Chromium content stream');
  const header = object.slice(0, start.index);
  assert.match(header, /\/Filter\s*\/FlateDecode\b/u, 'Expected the qualified Chromium stream encoding');
  const length = Number(header.match(/\/Length\s+(\d+)\s*>>/u)?.[1]);
  assert.ok(Number.isSafeInteger(length) && length > 0 && length < 1_048_576, 'Expected bounded direct stream length');
  const offset = start.index + start[0].length;
  assert.match(object.slice(offset + length), /^\r?\nendstream\s*$/u, 'Expected complete page stream bytes');
  return inflateSync(Buffer.from(object.slice(offset, offset + length), 'latin1'),
    { maxOutputLength: 1_048_576 }).toString('latin1');
}

function pageFrames(page, objects) {
  const contentId = page.match(/\/Contents\s+(\d+) 0 R/u)?.[1];
  assert.ok(contentId, 'Expected one direct Chromium page content reference');
  const stack = []; const frames = [];
  let state = { matrix: [1, 0, 0, 1, 0, 0], clip: null, unknownClip: false, lineWidth: 1 };
  let pending = null;
  for (const line of contentStream(objects.get(contentId)).split(/\r?\n/u)) {
    const previous = pending; pending = null;
    if (line === 'q') stack.push({ ...state });
    else if (line === 'Q') {
      assert.ok(stack.length, 'Expected balanced print graphics state'); state = stack.pop();
    } else if (line.endsWith(' cm')) {
      const match = line.match(matrixOperation); assert.ok(match, 'Unsupported print transform');
      state.matrix = concatenate(state.matrix, match[1].split(' ').map(Number));
    } else if (line.endsWith(' re')) {
      const match = line.match(rectangleOperation); assert.ok(match, 'Unsupported print rectangle');
      pending = rectangle(state.matrix, match[1].split(' ').map(Number));
    } else if (/^W\*? n$/u.test(line)) {
      // Skia isolates nonrectangular link-decoration clips with q/Q. They must
      // never qualify a card frame; rectangular clips can only narrow the page.
      if (!previous) state.unknownClip = true;
      else state.clip = state.clip ? {
        left: Math.max(state.clip.left, previous.left), right: Math.min(state.clip.right, previous.right),
        bottom: Math.max(state.clip.bottom, previous.bottom), top: Math.min(state.clip.top, previous.top),
      } : previous;
    } else if (/^\/G\d+ gs$/u.test(line)) {
      const name = line.split(' ')[0];
      const ref = page.match(new RegExp(`${name}\\s+(\\d+) 0 R`, 'u'))?.[1];
      assert.ok(ref && objects.has(ref), 'Expected the referenced Chromium graphics state');
      const width = objects.get(ref).match(new RegExp(`/LW\\s+(${NUMBER})`, 'u'));
      if (width) state.lineWidth = Number(width[1]);
    } else if (line === 'S' && previous) {
      assert.ok(!state.unknownClip, 'Cannot qualify a guest card frame under an unsupported clip');
      assert.ok(state.clip && state.lineWidth > 0, 'Expected a clipped frame with a positive stroke');
      const horizontal = Math.abs(state.matrix[0]) * state.lineWidth / 2;
      const vertical = Math.abs(state.matrix[3]) * state.lineWidth / 2;
      const stroke = { left: previous.left - horizontal, right: previous.right + horizontal,
        bottom: previous.bottom - vertical, top: previous.top + vertical };
      // Allow only serialized-coordinate rounding, well below a one-pixel border.
      assert.ok(stroke.left >= state.clip.left - 0.01 && stroke.right <= state.clip.right + 0.01
        && stroke.bottom >= state.clip.bottom - 0.01 && stroke.top <= state.clip.top + 0.01,
      'Printed guest card frame must remain entirely inside the actual PDF page clip');
      frames.push({ stroke, clip: { ...state.clip } });
    }
  }
  assert.equal(stack.length, 0, 'Expected balanced print graphics state');
  return frames;
}

// Deliberately limited to the trusted Chromium/Skia guest artifact: direct page
// streams, rectangular clips and stroked card frames. Not a general PDF reader,
// text-completeness check or validator for uploaded documents.
export function inspectChromiumGuestFrames(pdf, expectedFrames) {
  assert.ok(Buffer.isBuffer(pdf) && pdf.length > 0 && pdf.length < 1_048_576, 'Expected a bounded PDF artifact');
  assert.ok(Number.isSafeInteger(expectedFrames) && expectedFrames > 0, 'Expected the rendered card count');
  const objects = new Map([...pdf.toString('latin1').matchAll(/(?:^|\n)(\d+) 0 obj\r?\n([\s\S]*?)\r?\nendobj/g)]
    .map(match => [match[1], match[2]]));
  const pages = [...objects.values()].filter(value => /\/Type\s*\/Page\b/u.test(value));
  assert.ok(pages.length > 0 && pages.length <= 4, 'Expected bounded guest PDF pages');
  const frames = pages.map(page => pageFrames(page, objects));
  assert.equal(frames.flat().length, expectedFrames, 'PDF must preserve every uniform guest card frame');
  return frames;
}
