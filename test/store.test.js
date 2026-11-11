'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.POSITION_STORE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-')),
  'positions.json',
);

const store = require('../src/store');

test('save and load roundtrip without the token', () => {
  store.savePosition('user-a', {
    msgIds: ['x'],
    metas: [{ id: 'x' }],
    msgIndex: 0,
    chunkIndex: -1,
    unreadCount: 1,
    lastSpeech: 'hello',
    token: 'SECRET-MUST-NOT-SAVE',
  });
  const rec = store.loadPosition('user-a');
  assert.ok(rec);
  assert.deepEqual(rec.msgIds, ['x']);
  assert.equal(rec.lastSpeech, 'hello');
  assert.equal('token' in rec, false);
});

test('load returns null for unknown users and empty lists', () => {
  assert.equal(store.loadPosition('nobody'), null);
  store.savePosition('user-b', { msgIds: [], metas: [] });
  assert.equal(store.loadPosition('user-b'), null);
});

test('mismatched ids and metas are rejected', () => {
  store.savePosition('user-c', { msgIds: ['a', 'b'], metas: [{ id: 'a' }] });
  assert.equal(store.loadPosition('user-c'), null);
});

test('out of range msgIndex is clamped', () => {
  store.savePosition('user-d', {
    msgIds: ['a', 'b'],
    metas: [{ id: 'a' }, { id: 'b' }],
    msgIndex: 99,
    chunkIndex: -1,
    unreadCount: 2,
    lastSpeech: '',
  });
  const rec = store.loadPosition('user-d');
  assert.equal(rec.msgIndex, 1);
});

test('store file is created with owner-only permissions', () => {
  store.savePosition('user-e', {
    msgIds: ['a'],
    metas: [{ id: 'a' }],
    msgIndex: 0,
    chunkIndex: -1,
    unreadCount: 1,
    lastSpeech: '',
  });
  const mode = fs.statSync(process.env.POSITION_STORE_PATH).mode & 0o777;
  assert.equal(mode, 0o600);
});
