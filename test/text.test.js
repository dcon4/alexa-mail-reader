'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const textx = require('../src/text');

function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

test('chunkText keeps short text as one chunk', () => {
  assert.deepEqual(textx.chunkText('Short note.', 100), ['Short note.']);
});

test('chunkText splits long text at sentence boundaries under the size', () => {
  const sentence = 'This is a sentence about things. ';
  const text = sentence.repeat(200); // ~6000 chars
  const chunks = textx.chunkText(text, 2500);
  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 2500, 'chunk too long: ' + chunk.length);
  }
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(),
    text.replace(/\s+/g, ' ').trim());
});

test('chunkText hard-splits a single huge sentence', () => {
  const text = 'word '.repeat(2000); // no sentence enders, ~10000 chars
  const chunks = textx.chunkText(text, 2500);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 2500);
  }
});

test('cleanText drops quoted history and signatures', () => {
  const raw = [
    'Hello friend.',
    '',
    '> quoted line from before',
    'Second real line.',
    '-- ',
    'Signature that should be cut.',
  ].join('\n');
  const out = textx.cleanText(raw);
  assert.match(out, /Hello friend/);
  assert.match(out, /Second real line/);
  assert.doesNotMatch(out, /quoted line/);
  assert.doesNotMatch(out, /Signature/);
});

test('htmlToText strips tags and decodes entities', () => {
  const html =
    '<html><head><style>p{}</style></head><body>' +
    '<p>Hello &amp; welcome</p><br>Next line<script>bad()</script></body></html>';
  const out = textx.htmlToText(html);
  assert.match(out, /Hello & welcome/);
  assert.match(out, /Next line/);
  assert.doesNotMatch(out, /<p>/);
  assert.doesNotMatch(out, /bad\(\)/);
});

test('extractBody prefers the plain-text part', () => {
  const msg = {
    payload: {
      mimeType: 'multipart/alternative',
      body: {},
      parts: [
        { mimeType: 'text/html', body: { data: b64('<p>html version</p>') } },
        { mimeType: 'text/plain', body: { data: b64('plain version') } },
      ],
    },
  };
  const out = textx.extractBody(msg);
  assert.equal(out.text, 'plain version');
});

test('extractBody falls back to HTML and lists attachments', () => {
  const msg = {
    payload: {
      mimeType: 'multipart/mixed',
      body: {},
      parts: [
        { mimeType: 'text/html', body: { data: b64('<p>html only</p>') } },
        { mimeType: 'application/pdf', filename: 'report.pdf', body: {} },
      ],
    },
  };
  const out = textx.extractBody(msg);
  assert.equal(out.text, 'html only');
  assert.deepEqual(out.attachments, ['report.pdf']);
});
