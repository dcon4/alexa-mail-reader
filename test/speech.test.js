'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const sp = require('../src/speech');

test('escapeXml escapes markup characters', () => {
  assert.equal(
    sp.escapeXml(`a & b < c > d " e ' f`),
    'a &amp; b &lt; c &gt; d &quot; e &apos; f',
  );
});

test('clip shortens long text on a word boundary', () => {
  const out = sp.clip('one two three four five', 10);
  assert.ok(out.length <= 13);
  assert.match(out, /^one two/);
  assert.match(out, /\.\.\.$/);
});

test('senderName extracts the display name', () => {
  assert.equal(sp.senderName('Maya <maya@gmail.com>'), 'Maya');
  assert.equal(sp.senderName('"Maya Q" <maya@gmail.com>'), 'Maya Q');
  assert.equal(sp.senderName('maya@gmail.com'), 'maya');
  assert.equal(sp.senderName(''), 'someone');
});

test('relativeTime speaks friendly ages', () => {
  const twoHours = new Date(Date.now() - 2 * 3600 * 1000).toUTCString();
  const yesterday = new Date(Date.now() - 30 * 3600 * 1000).toUTCString();
  assert.equal(sp.relativeTime(twoHours), '2 hours ago');
  assert.equal(sp.relativeTime(yesterday), 'yesterday');
  assert.equal(sp.relativeTime('not a date'), '');
});

test('summaryLine builds a spoken line', () => {
  const line = sp.summaryLine({
    from: 'Maya <maya@gmail.com>',
    subject: 'Project update',
    date: new Date(Date.now() - 3600 * 1000).toUTCString(),
  });
  assert.match(line, /^From Maya, Project update, 1 hour ago\.$/);
});

test('summaryLine handles missing subject and escapes markup', () => {
  const line = sp.summaryLine({
    from: 'Bot <bot@x.com>',
    subject: '',
    date: '',
  });
  assert.match(line, /From Bot, no subject\.$/);
  const evil = sp.summaryLine({
    from: 'X <x@x.com>',
    subject: 'a & b <c>',
    date: '',
  });
  assert.match(evil, /a &amp; b &lt;c&gt;/);
});

test('countText pluralises and caps', () => {
  assert.equal(sp.countText(0, 25), 'no unread messages');
  assert.equal(sp.countText(1, 25), '1 unread message');
  assert.equal(sp.countText(3, 25), '3 unread messages');
  assert.equal(sp.countText(25, 25), '25 or more unread messages');
});

test('sanitize scrubs URLs and emoji from speech text', () => {
  assert.equal(
    sp.sanitize('Look 🎉 at https://shop.example.com/item/12345 now'),
    'Look at shop.example.com now',
  );
});

test('summaryLine scrubs emoji and URLs from the subject', () => {
  const line = sp.summaryLine({
    from: 'Bot <bot@x.com>',
    subject: 'Deal 🎁 https://store.example.com/sale/very-long-path',
    date: '',
  });
  assert.match(line, /From Bot, Deal store\.example\.com\.$/);
  assert.doesNotMatch(line, /🎁|https:\/\//);
});
