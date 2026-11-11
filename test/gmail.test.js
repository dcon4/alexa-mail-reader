'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const gmail = require('../src/gmail');

const realFetch = global.fetch;
let calls;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test.beforeEach(() => {
  calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return jsonResponse({ messages: [{ id: 'a' }, { id: 'b' }] });
  };
});

test.afterEach(() => {
  global.fetch = realFetch;
});

test('listMessageIds calls the messages endpoint with q and parses ids', async () => {
  const ids = await gmail.listMessageIds('tok', {
    q: 'is:unread',
    maxResults: 10,
  });
  assert.deepEqual(ids, ['a', 'b']);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /gmail\.googleapis\.com/);
  assert.match(calls[0].url, /q=is%3Aunread/);
  assert.match(calls[0].url, /maxResults=10/);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
});

test('getMessageMeta parses headers', async () => {
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return jsonResponse({
      id: 'a',
      payload: {
        headers: [
          { name: 'From', value: 'Maya <maya@gmail.com>' },
          { name: 'Subject', value: 'Hi' },
          { name: 'Date', value: 'Mon, 9 Nov 2026 10:00:00 +0000' },
        ],
      },
    });
  };
  const meta = await gmail.getMessageMeta('tok', 'a');
  assert.equal(meta.from, 'Maya <maya@gmail.com>');
  assert.equal(meta.subject, 'Hi');
  assert.match(calls[0].url, /messages\/a\?format=metadata/);
});

test('a 401 raises GmailError with status 401 and does not retry', async () => {
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return jsonResponse({}, 401);
  };
  await assert.rejects(
    () => gmail.listMessageIds('tok', {}),
    (err) => err.name === 'GmailError' && err.status === 401,
  );
  assert.equal(calls.length, 1);
});

test('a 503 retries once then raises GmailError with status 503', async () => {
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return jsonResponse({}, 503);
  };
  await assert.rejects(
    () => gmail.listMessageIds('tok', {}),
    (err) => err.name === 'GmailError' && err.status === 503,
  );
  assert.equal(calls.length, 2);
});

test('a network failure retries once then raises status 0', async () => {
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    throw new Error('ECONNRESET');
  };
  await assert.rejects(
    () => gmail.listMessageIds('tok', {}),
    (err) => err.name === 'GmailError' && err.status === 0,
  );
  assert.equal(calls.length, 2);
});
