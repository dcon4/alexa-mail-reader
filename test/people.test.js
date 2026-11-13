'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const people = require('../src/people');

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
    return jsonResponse({
      results: [
        {
          person: {
            names: [{ displayName: 'Dad Example' }],
            emailAddresses: [{ value: 'dad@example.com' }],
          },
        },
      ],
    });
  };
});

test.afterEach(() => {
  global.fetch = realFetch;
});

test('searchContacts calls otherContacts:search and maps results', async () => {
  const found = await people.searchContacts('tok', 'dad');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /people\.googleapis\.com\/v1\/otherContacts:search/);
  assert.match(calls[0].url, /query=dad/);
  assert.match(calls[0].url, /readMask=names%2CemailAddresses|readMask=names,emailAddresses/);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
  assert.deepEqual(found, [{ name: 'Dad Example', email: 'dad@example.com' }]);
});

test('searchContacts handles results without the person wrapper', async () => {
  global.fetch = async () =>
    jsonResponse({
      results: [
        { names: [{ displayName: 'Moon' }], emailAddresses: [{ value: 'm@x.y' }] },
      ],
    });
  const found = await people.searchContacts('tok', 'moon');
  assert.deepEqual(found, [{ name: 'Moon', email: 'm@x.y' }]);
});

test('searchContacts maps 403 to PeopleError status 403 without retry', async () => {
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return jsonResponse({}, 403);
  };
  await assert.rejects(
    () => people.searchContacts('tok', 'dad'),
    (err) => err.name === 'PeopleError' && err.status === 403,
  );
  assert.equal(calls.length, 1);
});

test('bestMatch scores exact names highest and rejects weak matches', () => {
  const contacts = [
    { name: 'Dad Example', email: 'dad@example.com' },
    { name: 'Donald Jeffries', email: 'dj@mail.test' },
    { name: 'Moonshine Jones', email: 'moon@shine.test' },
  ];
  assert.equal(people.bestMatch('dad example', contacts).email, 'dad@example.com');
  assert.equal(people.bestMatch('dad', contacts).email, 'dad@example.com');
  assert.equal(people.bestMatch('moonshine', contacts).email, 'moon@shine.test');
  assert.equal(people.bestMatch('dj', contacts).email, 'dj@mail.test');
  assert.equal(people.bestMatch('zzz nobody', contacts), null);
  assert.equal(people.bestMatch('', contacts), null);
});
