'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fixes = require('../src/fixes');

test('fixAddress recovers the dcon family of confusions', () => {
  assert.equal(fixes.fixAddress('decon2000@gmail.com'), 'dcon2000@gmail.com');
  assert.equal(fixes.fixAddress('deacon2000@gmail.com'), 'dcon2000@gmail.com');
  assert.equal(fixes.fixAddress('deekon2000@gmail.com'), 'dcon2000@gmail.com');
  assert.equal(fixes.fixAddress('dakon2000@gmail.com'), 'dcon2000@gmail.com');
});

test('fixAddress leaves correct and unrelated addresses alone', () => {
  assert.equal(fixes.fixAddress('dcon2000@gmail.com'), 'dcon2000@gmail.com');
  assert.equal(fixes.fixAddress('seattle@example.com'), 'seattle@example.com');
  assert.equal(fixes.fixAddress('beacon@example.com'), 'beacon@example.com');
  assert.equal(fixes.fixAddress('Bob Smith'), 'Bob Smith');
  assert.equal(fixes.fixAddress(''), '');
});

test('fixAddress parses verbalized addresses', () => {
  assert.equal(
    fixes.fixAddress('decon2000 at gmail dot com'),
    'dcon2000@gmail.com',
  );
  assert.equal(
    fixes.fixAddress('alpha bravo at gmail dot com'),
    'ab@gmail.com',
  );
});

test('parseDictatedEmail normalizes separators and rejects non-addresses', () => {
  assert.equal(fixes.parseDictatedEmail('a.b_c@example.com'), 'a.b_c@example.com');
  assert.equal(fixes.parseDictatedEmail('my address is x at y dot com'), 'x@y.com');
  assert.equal(fixes.parseDictatedEmail('just some words'), null);
  assert.equal(fixes.parseDictatedEmail(''), null);
});
