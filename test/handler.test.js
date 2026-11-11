'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { handler } = require('../src/index');

function launchEvent() {
  return {
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
      timestamp: '2026-11-10T00:00:00Z',
      locale: 'en-US',
    },
  };
}

function intentEvent(intentName, options = {}) {
  const event = launchEvent();
  event.session.new = false;
  event.session.attributes = options.attributes || {};
  if (options.linked) {
    event.context.System = {
      user: { userId: 'amzn1.ask.account.test', accessToken: 'test-token' },
    };
  }
  event.request = {
    type: 'IntentRequest',
    requestId: 'amzn1.echo-api.request.test',
    timestamp: '2026-11-10T00:00:00Z',
    locale: 'en-US',
    dialogState: options.dialogState || 'COMPLETED',
    intent: {
      name: intentName,
      confirmationStatus: 'NONE',
      slots: options.slots || {},
    },
  };
  return event;
}

function invoke(event) {
  return new Promise((resolve, reject) => {
    handler(event, {}, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function speechOf(response) {
  const out = response.outputSpeech;
  if (!out) return '';
  return out.ssml || out.text || '';
}

test('LaunchRequest welcomes and keeps the session open', async () => {
  const event = launchEvent();
  event.context.System = {
    user: { userId: 'amzn1.ask.account.test', accessToken: 'test-token' },
  };
  const res = await invoke(event);
  const speech = speechOf(res.response);
  assert.match(speech, /Mail reader/);
  assert.equal(res.response.shouldEndSession, false);
  assert.ok(res.response.reprompt);
});

test('unlinked launch sends link instructions and a LinkAccount card', async () => {
  const res = await invoke(launchEvent());
  const speech = speechOf(res.response);
  assert.match(speech, /linked to your Gmail account/);
  assert.equal(res.response.card.type, 'LinkAccount');
  assert.equal(res.response.shouldEndSession, false);
});

test('ReadUnreadIntent when unlinked asks for account link', async () => {
  const res = await invoke(intentEvent('ReadUnreadIntent'));
  assert.match(speechOf(res.response), /linked to your Gmail account/);
  assert.equal(res.response.card.type, 'LinkAccount');
});

test('ReadUnreadIntent when linked confirms the placeholder', async () => {
  const res = await invoke(intentEvent('ReadUnreadIntent', { linked: true }));
  assert.match(speechOf(res.response), /Opening your mail/);
  assert.match(speechOf(res.response), /linked and working/);
  assert.equal(res.response.card, undefined);
});

test('NextMessageIntent advances the index in session state', async () => {
  const res = await invoke(
    intentEvent('NextMessageIntent', {
      linked: true,
      attributes: { msgIndex: 0 },
    }),
  );
  assert.match(speechOf(res.response), /Message 2/);
  assert.equal(res.sessionAttributes.msgIndex, 1);
});

test('PreviousMessageIntent never goes below the first message', async () => {
  const res = await invoke(
    intentEvent('PreviousMessageIntent', {
      linked: true,
      attributes: { msgIndex: 0 },
    }),
  );
  assert.match(speechOf(res.response), /Message 1/);
  assert.equal(res.sessionAttributes.msgIndex, 0);
});

test('ReadMessageIntent echoes the requested number', async () => {
  const res = await invoke(
    intentEvent('ReadMessageIntent', {
      linked: true,
      slots: {
        messageNumber: {
          name: 'messageNumber',
          value: '4',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  assert.match(speechOf(res.response), /message 4/);
});

test('ComposeIntent dialog IN_PROGRESS returns a silent delegation response', async () => {
  const res = await invoke(
    intentEvent('ComposeIntent', { linked: true, dialogState: 'IN_PROGRESS' }),
  );
  assert.equal(res.response.outputSpeech, undefined);
  assert.equal(res.response.directives[0].type, 'Dialog.Delegate');
});

test('ComposeIntent completed stores the draft and echoes the recipient', async () => {
  const res = await invoke(
    intentEvent('ComposeIntent', {
      linked: true,
      slots: {
        recipient: {
          name: 'recipient',
          value: 'maya@example.com',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  assert.match(speechOf(res.response), /maya@example\.com/);
  assert.equal(
    res.sessionAttributes.draft.to,
    'maya@example.com',
  );
});

test('ConfirmSendIntent clears the draft', async () => {
  const res = await invoke(
    intentEvent('ConfirmSendIntent', {
      linked: true,
      attributes: { draft: { to: 'x@y.z', body: 'hello' } },
    }),
  );
  assert.equal(res.sessionAttributes.draft, null);
  assert.match(speechOf(res.response), /confirmed/);
});

test('FallbackIntent offers the real menu', async () => {
  const res = await invoke(
    intentEvent('AMAZON.FallbackIntent', { linked: true }),
  );
  assert.match(speechOf(res.response), /did not catch/);
  assert.ok(res.response.reprompt);
});

test('HelpIntent lists choices', async () => {
  const res = await invoke(intentEvent('AMAZON.HelpIntent', { linked: true }));
  assert.match(speechOf(res.response), /Here is what you can say/);
});

test('StopIntent ends the session with goodbye', async () => {
  const res = await invoke(intentEvent('AMAZON.StopIntent'));
  assert.match(speechOf(res.response), /Goodbye/);
  assert.equal(res.response.shouldEndSession, true);
});

test('SessionEndedRequest closes cleanly', async () => {
  const event = launchEvent();
  event.request = {
    type: 'SessionEndedRequest',
    requestId: 'amzn1.echo-api.request.test',
    timestamp: '2026-11-10T00:00:00Z',
    locale: 'en-US',
    reason: 'USER_INITIATED',
  };
  const res = await invoke(event);
  assert.equal(res.response.shouldEndSession, true);
});

test('linked launch says the Phase 3 placeholder', async () => {
  const event = launchEvent();
  event.context.System = {
    user: { userId: 'amzn1.ask.account.test', accessToken: 'test-token' },
  };
  const res = await invoke(event);
  assert.match(speechOf(res.response), /linked and working/);
  assert.doesNotMatch(speechOf(res.response), /Gmail account first/);
  assert.equal(res.response.card, undefined);
});

test('linked ReadUnreadIntent says the Phase 3 placeholder', async () => {
  const res = await invoke(intentEvent('ReadUnreadIntent', { linked: true }));
  assert.match(speechOf(res.response), /linked and working/);
});

test('unlinked ComposeIntent asks for account link instead of drafting', async () => {
  const res = await invoke(intentEvent('ComposeIntent'));
  assert.match(speechOf(res.response), /linked to your Gmail account/);
  assert.equal(res.response.card.type, 'LinkAccount');
});
