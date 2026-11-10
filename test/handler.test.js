'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { handler, STUB_SPEECH } = require('../src/index');

function invoke(event) {
  return new Promise((resolve, reject) => {
    handler(event, {}, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

const launchEvent = {
  version: '1.0',
  session: {
    new: true,
    sessionId: 'amzn1.echo-api.session.test',
    application: { applicationId: 'amzn1.ask.skill.test' },
    user: { userId: 'amzn1.ask.account.test' },
    attributes: {},
  },
  context: {},
  request: {
    type: 'LaunchRequest',
    requestId: 'amzn1.echo-api.request.test',
    timestamp: '2026-11-09T00:00:00Z',
    locale: 'en-US',
  },
};

test('LaunchRequest returns a well-formed Alexa response', async () => {
  const res = await invoke(launchEvent);
  assert.equal(res.version, '1.0');
  assert.equal(res.response.outputSpeech.type, 'PlainText');
  assert.equal(res.response.outputSpeech.text, STUB_SPEECH);
  assert.equal(typeof res.response.shouldEndSession, 'boolean');
});

test('SessionEndedRequest closes the session', async () => {
  const res = await invoke({
    ...launchEvent,
    request: { ...launchEvent.request, type: 'SessionEndedRequest' },
  });
  assert.equal(res.response.shouldEndSession, true);
});

test('malformed event does not throw', async () => {
  const res = await invoke(null);
  assert.equal(res.version, '1.0');
});
