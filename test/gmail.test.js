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

test('sendMessage POSTs base64url raw MIME with threading headers', async () => {
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return jsonResponse({ id: 'sent-1' });
  };
  const res = await gmail.sendMessage('tok', {
    to: 'maya@gmail.com',
    subject: 'Re: Project update',
    body: 'sounds good',
    threadId: 'thread-9',
    inReplyTo: '<abc@example.com>',
    references: '<abc@example.com>',
  });
  assert.equal(res.id, 'sent-1');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /messages\/send/);
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers['Content-Type'], 'application/json');
  const payload = JSON.parse(calls[0].opts.body);
  assert.equal(payload.threadId, 'thread-9');
  const mime = Buffer.from(payload.raw, 'base64url').toString('utf8');
  assert.match(mime, /To: maya@gmail\.com/);
  assert.match(mime, /Subject: Re: Project update/);
  assert.match(mime, /In-Reply-To: <abc@example\.com>/);
  assert.match(mime, /sounds good/);
});

test('sendMessage omits threading and subject for a plain new message', async () => {
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return jsonResponse({ id: 'sent-2' });
  };
  await gmail.sendMessage('tok', { to: 'bob@example.com', body: 'hello' });
  const payload = JSON.parse(calls[0].opts.body);
  assert.equal(payload.threadId, undefined);
  const mime = Buffer.from(payload.raw, 'base64url').toString('utf8');
  assert.doesNotMatch(mime, /In-Reply-To/);
  assert.doesNotMatch(mime, /^Subject:/m);
  assert.match(mime, /MIME-Version: 1\.0/);
  assert.match(mime, /Content-Type: text\/plain; charset="UTF-8"/);
});

test('buildRaw folds header newlines so no extra headers can appear', () => {
  const raw = gmail.buildRaw({
    to: 'a@b.c\r\nBcc: evil@x.y',
    subject: 'hi',
    body: 'x',
  });
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.doesNotMatch(mime, /^Bcc:/m);
  assert.match(mime, /^To: a@b\.c Bcc: evil@x\.y$/m);
});
