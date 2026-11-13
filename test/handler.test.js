'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.POSITION_STORE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'mail-reader-pos-')),
  'positions.json',
);

const { handler, SKILL_ID } = require('../src/index');
const gmail = require('../src/gmail');
const people = require('../src/people');

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
  gmail.sendMessage =
    overrides.sendMessage || (async () => ({ id: 'sent-1' }));
}

function stubPeople(overrides = {}) {
  people.searchContacts =
    overrides.searchContacts ||
    (async () => [
      { name: 'Dad Example', email: 'dad@example.com' },
      { name: 'Moonshine Jones', email: 'moon@shine.test' },
    ]);
}

stubPeople();

test.beforeEach(() => {
  stubGmail();
  stubPeople();
  try {
    fs.unlinkSync(process.env.POSITION_STORE_PATH);
  } catch (e) {
    // no store yet
  }
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
  assert.match(speech, /Email reader/);
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

test('ComposeIntent completed stores the draft and asks for the message', async () => {
  const res = await invoke(
    intentEvent('ComposeIntent', {
      linked: true,
      slots: {
        recipient: {
          name: 'recipient',
          value: 'maya@example.com',
          confirmationStatus: 'NONE',
        },
        subject: {
          name: 'subject',
          value: 'skip',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  const speech = speechOf(res.response);
  assert.match(speech, /What should the message say/);
  assert.equal(res.sessionAttributes.draft.to, 'maya@example.com');
  assert.equal(res.sessionAttributes.draft.mode, 'compose');
  assert.equal(res.sessionAttributes.draft.subject, '');
  assert.equal(res.response.directives[0].type, 'Dialog.ElicitSlot');
  assert.equal(res.response.shouldEndSession, false);
});

test('compose recipient is phonetically corrected before drafting', async () => {
  const res = await invoke(
    intentEvent('ComposeIntent', {
      linked: true,
      slots: {
        recipient: {
          name: 'recipient',
          value: 'decon2000@gmail.com',
          confirmationStatus: 'NONE',
        },
        subject: {
          name: 'subject',
          value: 'test',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  assert.equal(res.sessionAttributes.draft.to, 'dcon2000@gmail.com');
  assert.match(speechOf(res.response), /What should the message say/);
});

test('compose resolves a contact name to their address', async () => {
  const res = await invoke(
    intentEvent('ComposeIntent', {
      linked: true,
      slots: {
        recipient: {
          name: 'recipient',
          value: 'dad',
          confirmationStatus: 'NONE',
        },
        subject: {
          name: 'subject',
          value: 'test',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  assert.equal(res.sessionAttributes.draft.to, 'dad@example.com');
  assert.equal(res.sessionAttributes.draft.toName, 'Dad Example');
  assert.match(speechOf(res.response), /What should the message say/);
});

test('compose subject step spells the resolved contact address', async () => {
  const res = await invoke(
    intentEvent('ComposeIntent', {
      linked: true,
      dialogState: 'IN_PROGRESS',
      slots: {
        recipient: {
          name: 'recipient',
          value: 'moonshine',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  const speech = speechOf(res.response);
  assert.match(speech, /m o o n at shine dot test/);
  assert.match(speech, /subject/i);
  assert.equal(res.response.directives[0].type, 'Dialog.ElicitSlot');
});

test('compose re-elicits the recipient when nothing resolves', async () => {
  stubPeople({ searchContacts: async () => [] });
  const res = await invoke(
    intentEvent('ComposeIntent', {
      linked: true,
      slots: {
        recipient: {
          name: 'recipient',
          value: 'zzz nobody',
          confirmationStatus: 'NONE',
        },
        subject: {
          name: 'subject',
          value: 'test',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  const speech = speechOf(res.response);
  assert.match(speech, /could not turn that into an email address/);
  assert.equal(res.response.directives[0].slotToElicit, 'recipient');
  assert.ok(!res.sessionAttributes.draft);
});

test('search by contact name queries the resolved address', async () => {
  let seenQ = null;
  stubGmail({
    listMessageIds: async (token, opts) => {
      seenQ = opts.q;
      return [];
    },
  });
  const res = await invoke(
    intentEvent('SearchIntent', {
      linked: true,
      slots: {
        sender: {
          name: 'sender',
          value: 'dad',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  assert.equal(seenQ, 'from:dad@example.com');
  assert.match(speechOf(res.response), /no messages from/i);
});

test('compose dialog with a recipient spells the address and asks subject', async () => {
  const res = await invoke(
    intentEvent('ComposeIntent', {
      linked: true,
      dialogState: 'IN_PROGRESS',
      slots: {
        recipient: {
          name: 'recipient',
          value: 'bob@example.com',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  const speech = speechOf(res.response);
  assert.match(speech, /b o b at example dot com/);
  assert.match(speech, /subject/i);
  assert.match(speech, /skip/i);
  assert.equal(res.response.directives[0].type, 'Dialog.ElicitSlot');
});

test('ConfirmSendIntent sends the draft and clears it', async () => {
  let sent = null;
  stubGmail({
    sendMessage: async (token, opts) => {
      sent = opts;
      return { id: 'sent-1' };
    },
  });
  const res = await invoke(
    intentEvent('ConfirmSendIntent', {
      linked: true,
      attributes: {
        draft: {
          mode: 'compose',
          to: 'x@y.z',
          subject: 'Hi',
          body: 'hello',
        },
      },
    }),
  );
  assert.match(speechOf(res.response), /Sent to/);
  assert.equal(res.sessionAttributes.draft, null);
  assert.ok(sent);
  assert.equal(sent.to, 'x@y.z');
  assert.equal(sent.body, 'hello');
  assert.equal(sent.subject, 'Hi');
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

test('ExitIntent ends the session like stop', async () => {
  const res = await invoke(intentEvent('ExitIntent'));
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

test('body reading replaces long URLs with their domain', async () => {
  stubGmail({
    getMessageFull: async () =>
      fullMessage(
        'Full story here: https://news.example.com/article/2026/11/very-long-slug-that-should-not-be-spoken. The end.',
      ),
  });
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
  assert.match(speech, /news\.example\.com/);
  assert.doesNotMatch(speech, /very-long-slug/);
  assert.doesNotMatch(speech, /https:\/\//);
});

test('saying read it after the end restarts the message instead of looping', async () => {
  stubGmail({
    getMessageFull: async () => fullMessage('Only short body here.'),
  });
  const attrs = {
    msgIds: ['id1'],
    metas: [META_FIXTURE[0]],
    msgIndex: 0,
    chunkIndex: -1,
  };
  const first = await invoke(
    intentEvent('ReadCurrentIntent', { linked: true, attributes: attrs }),
  );
  const firstSpeech = speechOf(first.response);
  assert.match(firstSpeech, /Only short body here/);
  assert.match(firstSpeech, /That is the end of the message/);
  assert.equal(first.sessionAttributes.chunkIndex, 0);

  const second = await invoke(
    intentEvent('ReadCurrentIntent', {
      linked: true,
      attributes: first.sessionAttributes,
    }),
  );
  const secondSpeech = speechOf(second.response);
  assert.match(secondSpeech, /Only short body here/);
  assert.doesNotMatch(secondSpeech, /^<speak>That is the end/);
  assert.equal(second.sessionAttributes.chunkIndex, 0);
});

test('continue on the last chunk restarts from the first chunk', async () => {
  stubGmail({ getMessageFull: async () => fullMessage(LONG_BODY) });
  const textx = require('../src/text');
  const nChunks = textx.chunkText(LONG_BODY, 2500).length;
  let attrs = {
    msgIds: ['id1'],
    metas: [META_FIXTURE[0]],
    msgIndex: 0,
    chunkIndex: -1,
  };
  let last;
  for (let i = 0; i < nChunks + 2; i++) {
    last = await invoke(
      intentEvent('ReadCurrentIntent', { linked: true, attributes: attrs }),
    );
    attrs = last.sessionAttributes;
    if (i > 0 && attrs.chunkIndex === 0) break;
  }
  assert.equal(attrs.chunkIndex, 0);
  const speech = speechOf(last.response);
  assert.match(speech, /From Maya/);
  assert.match(speech, /Sentence number 0 /);
});

test('RepeatIntent on a read message re-reads it from the start', async () => {
  stubGmail({
    getMessageFull: async () => fullMessage('Relevant body text.'),
  });
  const res = await invoke(
    intentEvent('RepeatIntent', {
      linked: true,
      attributes: {
        msgIds: ['id1'],
        metas: [META_FIXTURE[0]],
        msgIndex: 0,
        chunkIndex: 2,
        lastSpeech: 'That is the end of the message. Reply, next, or stop.',
      },
    }),
  );
  const speech = speechOf(res.response);
  assert.match(speech, /Relevant body text/);
  assert.equal(res.sessionAttributes.chunkIndex, 0);
});

function seedPosition(rec) {
  fs.writeFileSync(
    process.env.POSITION_STORE_PATH,
    JSON.stringify({ 'amzn1.ask.account.test': rec }),
    { mode: 0o600 },
  );
}

test('launch saves the position and never stores the token', async () => {
  const res = await invoke(linkedLaunch());
  assert.ok(res.sessionAttributes.msgIds);
  const all = JSON.parse(
    fs.readFileSync(process.env.POSITION_STORE_PATH, 'utf8'),
  );
  const rec = all['amzn1.ask.account.test'];
  assert.ok(rec);
  assert.deepEqual(rec.msgIds, ['id1', 'id2']);
  assert.equal(rec.msgIndex, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(rec, 'token'), false);
  assert.doesNotMatch(rec.lastSpeech || '', /test-token/);
});

test('launch resumes with welcome back when a saved position exists', async () => {
  let listCalls = 0;
  stubGmail({
    listMessageIds: async () => {
      listCalls += 1;
      return ['id1', 'id2'];
    },
  });
  seedPosition({
    msgIds: ['id1', 'id2'],
    metas: META_FIXTURE,
    msgIndex: 1,
    chunkIndex: -1,
    unreadCount: 2,
    lastSpeech: '',
  });
  const res = await invoke(linkedLaunch());
  const speech = speechOf(res.response);
  assert.match(speech, /Welcome back/);
  assert.match(speech, /Fishing trip/);
  assert.equal(listCalls, 0);
  assert.equal(res.response.shouldEndSession, false);
  assert.ok(res.response.reprompt);
});

test('a fresh session read it resumes at the saved message', async () => {
  let fullId = null;
  stubGmail({
    getMessageFull: async (token, id) => {
      fullId = id;
      return fullMessage('Hello world. All fine.');
    },
  });
  seedPosition({
    msgIds: ['id1', 'id2'],
    metas: META_FIXTURE,
    msgIndex: 1,
    chunkIndex: -1,
    unreadCount: 2,
    lastSpeech: '',
  });
  const res = await invoke(
    intentEvent('ReadCurrentIntent', { linked: true, attributes: {} }),
  );
  assert.equal(fullId, 'id2');
  const speech = speechOf(res.response);
  assert.match(speech, /Welcome back/);
  assert.match(speech, /Fishing trip/);
  assert.equal(res.response.shouldEndSession, false);
});

test('cold how many unread adds the last-on line from the saved position', async () => {
  seedPosition({
    msgIds: ['id1', 'id2'],
    metas: META_FIXTURE,
    msgIndex: 1,
    chunkIndex: 2,
    unreadCount: 2,
    lastSpeech: '',
  });
  const res = await invoke(
    intentEvent('CountIntent', { linked: true, attributes: {} }),
  );
  const speech = speechOf(res.response);
  assert.match(speech, /2 unread messages/);
  assert.match(speech, /You were last on/);
  assert.match(speech, /Fishing trip/);
  assert.match(speech, /Say read it to continue/);
  assert.equal(res.sessionAttributes.msgIndex, 1);
  assert.equal(res.sessionAttributes.chunkIndex, 2);
});

test('cold how many unread without a store keeps the plain menu', async () => {
  const res = await invoke(
    intentEvent('CountIntent', { linked: true, attributes: {} }),
  );
  const speech = speechOf(res.response);
  assert.match(speech, /2 unread messages/);
  assert.doesNotMatch(speech, /You were last on/);
  assert.match(speech, /You can say read it/);
});

test('read my email still starts the list from the top with a saved position', async () => {
  seedPosition({
    msgIds: ['id1', 'id2'],
    metas: META_FIXTURE,
    msgIndex: 1,
    chunkIndex: -1,
    unreadCount: 2,
    lastSpeech: '',
  });
  const res = await invoke(
    intentEvent('ReadUnreadIntent', { linked: true, attributes: {} }),
  );
  const speech = speechOf(res.response);
  assert.doesNotMatch(speech, /Welcome back/);
  assert.match(speech, /Project update/);
  assert.equal(res.sessionAttributes.msgIndex, 0);
});

test('how many unread does not reset the place in the list', async () => {
  const res = await invoke(
    intentEvent('CountIntent', {
      linked: true,
      attributes: {
        msgIds: ['id1', 'id2'],
        metas: META_FIXTURE,
        msgIndex: 1,
        chunkIndex: 2,
      },
    }),
  );
  assert.match(speechOf(res.response), /2 unread messages/);
  assert.equal(res.sessionAttributes.msgIndex, 1);
  assert.equal(res.sessionAttributes.chunkIndex, 2);
});

test('reply opens dictation and stores a threaded draft', async () => {
  stubGmail({
    getMessageFull: async () => ({
      threadId: 'thread-1',
      payload: {
        headers: [{ name: 'Message-ID', value: '<abc@example.com>' }],
      },
    }),
  });
  const res = await invoke(
    intentEvent('ReplyIntent', {
      linked: true,
      attributes: {
        msgIds: ['id1', 'id2'],
        metas: META_FIXTURE,
        msgIndex: 0,
        chunkIndex: -1,
      },
    }),
  );
  assert.match(speechOf(res.response), /What should I say/);
  assert.equal(res.response.directives[0].type, 'Dialog.ElicitSlot');
  assert.equal(res.response.directives[0].slotToElicit, 'addedText');
  assert.equal(res.response.directives[0].updatedIntent.name, 'AddBodyIntent');
  assert.ok(res.response.directives[0].updatedIntent.slots.addedText);
  const d = res.sessionAttributes.draft;
  assert.equal(d.mode, 'reply');
  assert.equal(d.to, 'maya@gmail.com');
  assert.equal(d.toName, 'Maya');
  assert.equal(d.subject, 'Re: Project update');
  assert.equal(d.threadId, 'thread-1');
  assert.equal(d.inReplyTo, '<abc@example.com>');
});

test('dictating a reply reads it back and asks to send', async () => {
  const res = await invoke(
    intentEvent('AddBodyIntent', {
      linked: true,
      attributes: {
        draft: {
          mode: 'reply',
          to: 'maya@gmail.com',
          toName: 'Maya',
          subject: 'Re: Project update',
          body: '',
          threadId: 't',
          inReplyTo: '',
        },
      },
      slots: {
        addedText: {
          name: 'addedText',
          value: 'sounds good see you Thursday',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  const speech = speechOf(res.response);
  assert.match(speech, /To Maya at gmail dot com/);
  assert.match(speech, /Re: Project update/);
  assert.match(speech, /sounds good see you Thursday/);
  assert.match(speech, /Send it\?/);
  assert.equal(
    res.sessionAttributes.draft.body,
    'sounds good see you Thursday',
  );
  assert.equal(res.response.shouldEndSession, false);
});

test('compose read-back spells the address letter by letter', async () => {
  const res = await invoke(
    intentEvent('AddBodyIntent', {
      linked: true,
      attributes: {
        draft: {
          mode: 'compose',
          to: 'bob@example.com',
          subject: '',
          body: '',
          threadId: '',
          inReplyTo: '',
        },
      },
      slots: {
        addedText: {
          name: 'addedText',
          value: 'lunch tomorrow',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  const speech = speechOf(res.response);
  assert.match(speech, /b o b at example dot com/);
  assert.match(speech, /lunch tomorrow/);
  assert.match(speech, /Send it\?/);
});

test('add with no draft explains the next step', async () => {
  const res = await invoke(
    intentEvent('AddBodyIntent', {
      linked: true,
      slots: {
        addedText: {
          name: 'addedText',
          value: 'hi',
          confirmationStatus: 'NONE',
        },
      },
    }),
  );
  assert.match(speechOf(res.response), /nothing to add to/);
});

test('discard clears the reply draft with plan wording', async () => {
  const res = await invoke(
    intentEvent('DiscardIntent', {
      linked: true,
      attributes: { draft: { mode: 'reply', to: 'm@x.y', body: 'x' } },
    }),
  );
  assert.match(speechOf(res.response), /Reply discarded/);
  assert.equal(res.sessionAttributes.draft, null);
});

test('confirm with no draft says there is nothing to send', async () => {
  const res = await invoke(intentEvent('ConfirmSendIntent', { linked: true }));
  assert.match(speechOf(res.response), /nothing to send/);
});

test('reply with no messages says to read mail first', async () => {
  stubGmail({ listMessageIds: async () => [] });
  const res = await invoke(intentEvent('ReplyIntent', { linked: true }));
  assert.match(speechOf(res.response), /no message open/);
});
