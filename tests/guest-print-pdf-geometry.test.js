import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { inspectChromiumGuestFrames } from './e2e/fixtures/guest-print-pdf-geometry.js';

function fixture({ rectangle = '358.5 1032.5 345 695', clip = true, lineWidth = 1, inset = 0, ending = 'Q\nQ' } = {}) {
  const content = `.23999999 0 0 -.23999999 0 841.91998 cm\nq\n`
    + (clip ? '140.625 140.625 2196.9238 3224.4629 re\nW* n\n' : '')
    + `q\n3.125 0 0 3.125 ${140.625 - inset * 3.125} -3084.375 cm\n/G6 gs\n${rectangle} re\nS\n${ending}\n`;
  const compressed = deflateSync(content);
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj\n<</Type /Page /Resources <</ExtGState <</G6 6 0 R>>>> /Contents 2 0 R>>\nendobj\n'
      + `2 0 obj\n<</Filter /FlateDecode /Length ${compressed.length}>> stream\n`, 'latin1'),
    compressed,
    Buffer.from(`\nendstream\nendobj\n6 0 obj\n<</LW ${lineWidth}>>\nendobj\n%%EOF\n`, 'latin1'),
  ]);
}

test('Chromium guest PDF frame check rejects the observed right-edge page clip', () => {
  assert.throws(() => inspectChromiumGuestFrames(fixture(), 1), /entirely inside/);
});

test('Chromium guest PDF frame check retains full stroke width, not only its centerline', () => {
  assert.throws(() => inspectChromiumGuestFrames(fixture({ inset: 0.6 }), 1), /entirely inside/);
});

test('Chromium guest PDF frame check accepts an inset complete frame with the page-two transform', () => {
  const frames = inspectChromiumGuestFrames(fixture({ inset: 4 }), 1);
  assert.equal(frames.length, 1); assert.equal(frames[0].length, 1);
  assert.ok(frames[0][0].stroke.right < frames[0][0].clip.right);
});

test('Chromium guest PDF frame check rejects missing clip, omitted frames and malformed graphics state', () => {
  assert.throws(() => inspectChromiumGuestFrames(fixture({ inset: 4, clip: false }), 1), /clipped frame/);
  assert.throws(() => inspectChromiumGuestFrames(fixture({ inset: 4 }), 2), /every uniform guest card/);
  assert.throws(() => inspectChromiumGuestFrames(fixture({ inset: 4, ending: 'Q' }), 1), /balanced/);
  assert.throws(() => inspectChromiumGuestFrames(fixture({ inset: 4, lineWidth: 0 }), 1), /positive stroke/);
});

test('Chromium guest PDF frame check refuses truncated streams and an invalid expected count', () => {
  const pdf = fixture({ inset: 4 });
  assert.throws(() => inspectChromiumGuestFrames(pdf.subarray(0, pdf.indexOf('endstream')), 1));
  assert.throws(() => inspectChromiumGuestFrames(pdf, 0), /rendered card count/);
});
