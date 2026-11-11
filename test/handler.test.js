'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { handler, SKILL_ID } = require('../src/index');
const gmail = require('../src/gmail');

function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fullMessage(text) {
  return {
    payload: {
      mimeType: 'multipart/mixed',
      body: {},
      parts: [
        {
          mimeType: 'text/plain',
          body: { data: b64(text) },
        },
      ],
    },
  };
}

const META_FIXTURE = [
  {
    id: 'id1',
    from: 'Maya <maya@gmail.com>',
    subject: 'Project update',
    date: new Date(Date.now() - 2 * 3600 * 1000).toUTCString(),
  },
  {
    id: 'id2',
    from: 'Dad <dad@example.com>',
    subject: 'Fishing trip',
    date: new Date(Date.now() - 30 * 3600 * 1000).toUTCString(),
  },
];

const LONG_BODY =
  'Hello there. ' +
  Array.from({ length: 400 }, (_, i) => `Sentence number ${i} about the project.`).join(' ');

function stubGmail(overrides = {}) {
  gmail.listMessageIds =
    overrides.listMessageIds || (async () => ['id1', 'id2']);
  gmail.getMessageMetas =
    overrides.getMessageMetas ||
    (async (token, ids) =>
      ids.map((id) => META_FIXTURE.find((m) => m.id === id) || META_FIXTURE[0]));
  gmail.getMessageFull =
    overrides.getMessageFull || (async () => fullMessage('Hello world. All fine.'));
}

stubGmail();

test.beforeEach(() => {
  stubGmail();
});

function launchEvent() {
  return {
    version: '1.0',
    session: {
      new: true,
      sessionId: 'amzn1.echo-api.session.test',
      application: { applicationId: SKILL_ID },
      user: { userId: 'amzn1.ask.account.test' },
      attributes: {},
    },
    context: {},
    request: {
      type: 'LaunchRequest',
      requestId: 'amzn1.echo-api.request.test',
      timestamp: '2026-11-11T00:00:00Z',
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
      application: { applicationId: SKILL_ID },
      user: { userId: 'amzn1.ask.account.test', accessToken: 'test-token' },
    };
  }
  event.request = {
    type: 'IntentRequest',
    requestId: 'amzn1.echo-api.request.test',
    timestamp: '2026-11-11T00:00:00Z',
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

function linkedLaunch() {
  const event = launchEvent();
  event.context.System = {
    application: { applicationId: SKILL_ID },
    user: { userId: 'amzn1.ask.account.test', accessToken: 'test-token' },
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

test('LaunchRequest lists unread mail and keeps the session open', async () => {
  const res = await invoke(linkedLaunch());
  const speech = speechOf(res.response);
  assert.match(speech, /Mail reader/);
  assert.match(speech, /2 unread messages/);
  assert.match(speech, /From Maya/);
  assert.match(speech, /Project update/);
  assert.equal(res.response.shouldEndSession, false);
  assert.ok(res.response.reprompt);
  assert.equal(res.response.card, undefined);
});

test('linked launch with no unread says so and offers alternatives', async () => {
  stubGmail({ listMessageIds: async () => [] });
  const res = await invoke(linkedLaunch());
  const speech = speechOf(res.response);
  assert.match(speech, /no unread messages/);
  assert.match(speech, /read my latest email/);
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

test('ReadUnreadIntent when linked lists unread mail', async () => {
  const res = await invoke(intentEvent('ReadUnreadIntent', { linked: true }));
  const speech = speechOf(res.response);
  assert.match(speech, /2 unread messages/);
  assert.match(speech, /From Maya/);
  assert.equal(res.response.card, undefined);
});

test('NextMessageIntent advances and speaks the next summary', async () => {
  const res = await invoke(
    intentEvent('NextMessageIntent', {
      linked: true,
      attributes: {
        msgIds: ['id1', 'id2'],
        metas: META_FIXTURE,
        msgIndex: 0,
        chunkIndex: -1,
      },
    }),
  );
  assert.match(speechOf(res.response), /From Dad/);
  assert.equal(res.sessionAttributes.msgIndex, 1);
});

test('PreviousMessageIntent never goes below the first message', async () => {
  const res = await invoke(
    intentEvent('PreviousMessageIntent', {
      linked: true,
      attributes: {
        msgIds: ['id1', 'id2'],
        metas: META_FIXTURE,
        msgIndex: 0,
        chunkIndex: -1,
      },
    }),
  );
  assert.match(speechOf(res.response), /first message/);
  assert.equal(res.sessionAttributes.msgIndex, 0);
});

test('ReadMessageIntent jumps to the message and reads its body', async () => {
  const res = await invoke(
    intentEvent('ReadMessageIntent', {
      linked: true,
      attributes: {
        msgIds: ['id1', 'id2', 'id3', 'id4'],
        metas: [
          ...META_FIXTURE,
          { id: 'id3', from: 'A <a@x.com>', subject: 'Three', date: '' },
          { id: 'id4', from: 'B <b@x.com>', subject: 'Four', date: '' },
        ],
        msgIndex: 0,
        chunkIndex: -1,
      },
      slots: {
        messageNumber: {
          name: 'messageNumber',
          value: '4',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  const speech = speechOf(res.response);
  assert.match(speech, /From B/);
  assert.match(speech, /Hello world/);
  assert.equal(res.sessionAttributes.msgIndex, 3);
});

test('ReadCurrentIntent reads the first body chunk', async () => {
  stubGmail({ getMessageFull: async () => fullMessage('Plain body text here.') });
  const res = await invoke(
    intentEvent('ReadCurrentIntent', {
      linked: true,
      attributes: {
        msgIds: ['id1'],
        metas: [META_FIXTURE[0]],
        msgIndex: 0,
        chunkIndex: -1,
      },
    }),
  );
  const speech = speechOf(res.response);
  assert.match(speech, /Plain body text here/);
  assert.match(speech, /From Maya/);
  assert.equal(res.sessionAttributes.chunkIndex, 0);
});

test('ReadCurrentIntent continues to the next chunk of a long message', async () => {
  stubGmail({ getMessageFull: async () => fullMessage(LONG_BODY) });
  const first = await invoke(
    intentEvent('ReadCurrentIntent', {
      linked: true,
      attributes: {
        msgIds: ['id1'],
        metas: [META_FIXTURE[0]],
        msgIndex: 0,
        chunkIndex: -1,
      },
    }),
  );
  const firstSpeech = speechOf(first.response);
  assert.match(firstSpeech, /say continue for more/i);
  assert.ok(first.sessionAttributes.chunkIndex === 0);

  const second = await invoke(
    intentEvent('ReadCurrentIntent', {
      linked: true,
      attributes: first.sessionAttributes,
    }),
  );
  assert.equal(second.sessionAttributes.chunkIndex, 1);
  const secondSpeech = speechOf(second.response);
  assert.doesNotMatch(secondSpeech, /Sentence number 0 /);
});

test('CountIntent reports the unread count', async () => {
  const res = await invoke(intentEvent('CountIntent', { linked: true }));
  assert.match(speechOf(res.response), /2 unread messages/);
});

test('SearchIntent lists messages from the sender', async () => {
  stubGmail({
    listMessageIds: async () => ['id1'],
    getMessageMetas: async () => [META_FIXTURE[0]],
  });
  const res = await invoke(
    intentEvent('SearchIntent', {
      linked: true,
      slots: {
        sender: {
          name: 'sender',
          value: 'maya@gmail.com',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  const speech = speechOf(res.response);
  assert.match(speech, /1 message from maya\b/);
  assert.match(speech, /From Maya/);
});

test('Gmail 401 asks the user to reconnect and sends a LinkAccount card', async () => {
  stubGmail({
    listMessageIds: async () => {
      throw new gmail.GmailError(401, 'unauthorized');
    },
  });
  const res = await invoke(intentEvent('CountIntent', { linked: true }));
  assert.match(speechOf(res.response), /reconnect/);
  assert.equal(res.response.card.type, 'LinkAccount');
});

test('Gmail 503 fails soft with a try-again message', async () => {
  stubGmail({
    listMessageIds: async () => {
      throw new gmail.GmailError(503, 'unavailable');
    },
  });
  const res = await invoke(intentEvent('CountIntent', { linked: true }));
  assert.match(speechOf(res.response), /could not reach your mail/i);
  assert.equal(res.response.card, undefined);
});

test('RepeatIntent re-speaks the last speech', async () => {
  const res = await invoke(
    intentEvent('RepeatIntent', {
      linked: true,
      attributes: { lastSpeech: 'Hear this again please.' },
    }),
  );
  assert.match(speechOf(res.response), /Hear this again please/);
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
  assert.equal(res.sessionAttributes.draft.to, 'maya@example.com');
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
    timestamp: '2026-11-11T00:00:00Z',
    locale: 'en-US',
    reason: 'USER_INITIATED',
  };
  const res = await invoke(event);
  assert.equal(res.response.shouldEndSession, true);
});

test('unlinked ComposeIntent asks for account link instead of drafting', async () => {
  const res = await invoke(intentEvent('ComposeIntent'));
  assert.match(speechOf(res.response), /linked to your Gmail account/);
  assert.equal(res.response.card.type, 'LinkAccount');
});

test('requests for a different skill id are rejected', async () => {
  const event = linkedLaunch();
  event.session.application.applicationId = 'amzn1.ask.skill.wrong';
  await assert.rejects(() => invoke(event), /mismatch/);
});
