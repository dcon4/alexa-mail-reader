'use strict';

const Alexa = require('ask-sdk-core');
const gmail = require('./gmail');
const textx = require('./text');
const sp = require('./speech');

const SKILL_ID = 'amzn1.ask.skill.9c554724-207c-464e-a0e2-ae3158077bf5';
const LIST_CAP = 25;
const SUMMARY_CAP = 5;
const CHUNK_SIZE = 2500;

const NOT_LINKED =
  'This skill needs to be linked to your Gmail account first. ' +
  'Open the Alexa app and follow the link on the card I just sent.';
const MENU =
  'You can say read it, next, previous, reply, how many unread, or stop.';
const MENU_LIST = 'Say read it, next, or how many unread.';
const MENU_MSG = 'Say read it, next, previous, reply, or stop.';
const MENU_END = 'Reply, next, or stop.';
const MENU_CONTINUE = 'Say continue for more, or next for the next message.';
const NO_UNREAD =
  'You have no unread messages. ' +
  'You can still say read my latest email, or search email from a name.';
const RECONNECTED_401 =
  'Your Gmail connection has expired. ' +
  'Open the Alexa app and reconnect Mail reader.';

function isLinked(handlerInput) {
  const context = handlerInput.requestEnvelope.context || {};
  const system = context.System || {};
  const user = system.user || {};
  return Boolean(user.accessToken);
}

function getAccessToken(handlerInput) {
  const context = handlerInput.requestEnvelope.context || {};
  const system = context.System || {};
  const user = system.user || {};
  return user.accessToken;
}

function sessionState(handlerInput) {
  const attrs =
    handlerInput.attributesManager.getSessionAttributes() || {};
  return {
    msgIds: Array.isArray(attrs.msgIds) ? attrs.msgIds : [],
    metas: Array.isArray(attrs.metas) ? attrs.metas : [],
    msgIndex: typeof attrs.msgIndex === 'number' ? attrs.msgIndex : 0,
    chunkIndex: typeof attrs.chunkIndex === 'number' ? attrs.chunkIndex : -1,
    unreadCount:
      typeof attrs.unreadCount === 'number' ? attrs.unreadCount : 0,
    lastSpeech: typeof attrs.lastSpeech === 'string' ? attrs.lastSpeech : '',
    draft: attrs.draft || null,
  };
}

function saveState(handlerInput, state) {
  const { token, ...persisted } = state;
  handlerInput.attributesManager.setSessionAttributes(persisted);
  return handlerInput.responseBuilder;
}

function keepOpen(handlerInput, speech, repromptText, state) {
  if (!isLinked(handlerInput)) {
    return linkAccountResponse(handlerInput, state);
  }
  const st = state || sessionState(handlerInput);
  st.lastSpeech = speech;
  return saveState(handlerInput, st)
    .speak(speech)
    .reprompt(repromptText || MENU)
    .getResponse();
}

function linkAccountResponse(handlerInput, state) {
  saveState(handlerInput, state || sessionState(handlerInput));
  return handlerInput.responseBuilder
    .speak(NOT_LINKED)
    .withLinkAccountCard()
    .reprompt(NOT_LINKED)
    .getResponse();
}

function gmailErrorResponse(handlerInput, err, state) {
  if (err && err.status === 401) {
    saveState(handlerInput, state || sessionState(handlerInput));
    return handlerInput.responseBuilder
      .speak(RECONNECTED_401)
      .withLinkAccountCard()
      .reprompt('Say read my email after you reconnect.')
      .getResponse();
  }
  return keepOpen(
    handlerInput,
    'I could not reach your mail. Please try again. ' + MENU,
    'What would you like to do?',
    state,
  );
}

async function loadUnread(state) {
  const token = state.token;
  const ids = await gmail.listMessageIds(token, {
    q: 'is:unread',
    maxResults: LIST_CAP,
  });
  const metas = await gmail.getMessageMetas(token, ids);
  state.msgIds = ids;
  state.metas = metas;
  state.msgIndex = 0;
  state.chunkIndex = -1;
  state.unreadCount = ids.length;
  return state;
}

async function loadSearch(state, sender) {
  const token = state.token;
  const ids = await gmail.listMessageIds(token, {
    q: 'from:' + sender,
    maxResults: LIST_CAP,
  });
  const metas = await gmail.getMessageMetas(token, ids);
  state.msgIds = ids;
  state.metas = metas;
  state.msgIndex = 0;
  state.chunkIndex = -1;
  state.unreadCount = ids.length;
  return state;
}

async function loadLatest(state) {
  const token = state.token;
  const ids = await gmail.listMessageIds(token, {
    q: 'in:inbox',
    maxResults: 1,
  });
  if (!ids.length) {
    state.msgIds = [];
    state.metas = [];
    return state;
  }
  const metas = await gmail.getMessageMetas(token, ids);
  state.msgIds = ids;
  state.metas = metas;
  state.msgIndex = 0;
  state.chunkIndex = -1;
  return state;
}

function listSpeech(state, intro) {
  let speech = intro || 'You have ' + sp.countText(state.unreadCount, LIST_CAP) + '.';
  const shown = state.metas.slice(0, SUMMARY_CAP);
  for (const meta of shown) {
    speech += '<break time="300ms"/>' + sp.summaryLine(meta);
  }
  const rest = state.metas.length - shown.length;
  if (rest > 0) {
    speech +=
      '<break time="300ms"/>And ' +
      rest +
      ' more. Say read it for the first one.';
    return speech;
  }
  return speech + '<break time="500ms"/>' + MENU_LIST;
}

function summarySpeech(state) {
  const meta = state.metas[state.msgIndex];
  if (!meta) return 'That message is gone. ' + MENU;
  return (
    sp.summaryLine(meta) +
    '<break time="500ms"/>' +
    MENU_MSG
  );
}

async function bodyFor(state) {
  const id = state.msgIds[state.msgIndex];
  const full = await gmail.getMessageFull(state.token, id);
  return textx.extractBody(full);
}

function bodySpeech(state, body, chunkIdx) {
  const meta = state.metas[state.msgIndex] || {};
  const chunks = body.text ? textx.chunkText(body.text, CHUNK_SIZE) : [];
  let speech = '';
  if (chunkIdx === 0) {
    const from = sp.escapeXml(sp.senderName(meta.from));
    const subj = meta.subject && meta.subject.trim()
      ? sp.escapeXml(sp.clip(meta.subject.trim(), 80))
      : 'no subject';
    speech += `From ${from}. Subject: ${subj}.<break time="300ms"/>`;
    if (body.attachments.length) {
      const names = body.attachments
        .slice(0, 3)
        .map((n) => sp.escapeXml(sp.clip(n, 40)))
        .join(', ');
      const more = body.attachments.length > 3
        ? ' and ' + (body.attachments.length - 3) + ' more'
        : '';
      const pluralCount = body.attachments.length === 1 ? 'is' : 'are';
      const pluralWord =
        body.attachments.length === 1 ? 'attachment' : 'attachments';
      speech +=
        `There ${pluralCount} ${body.attachments.length} ${pluralWord}: ` +
        names +
        more +
        '.<break time="300ms"/>';
    }
  }
  if (!chunks.length) {
    speech += 'This message has no readable text.';
  } else {
    speech += sp.escapeXml(chunks[chunkIdx]);
  }
  const isLast = !chunks.length || chunkIdx >= chunks.length - 1;
  if (isLast) {
    speech += '<break time="500ms"/>' + MENU_END;
  } else {
    speech += '<break time="500ms"/>' + MENU_CONTINUE;
  }
  return speech;
}

async function readCurrentBody(handlerInput, state) {
  const body = await bodyFor(state);
  const chunks = body.text ? textx.chunkText(body.text, CHUNK_SIZE) : [];
  if (!chunks.length) {
    state.chunkIndex = 0;
    return bodySpeech(state, body, 0);
  }
  const idx = 0;
  state.chunkIndex = idx;
  return bodySpeech(state, body, idx);
}

async function continueBody(handlerInput, state) {
  const body = await bodyFor(state);
  const chunks = body.text ? textx.chunkText(body.text, CHUNK_SIZE) : [];
  if (!chunks.length) {
    state.chunkIndex = 0;
    return bodySpeech(state, body, 0);
  }
  if (state.chunkIndex >= chunks.length - 1) {
    return 'That is the end of the message. ' + MENU_END;
  }
  const idx = state.chunkIndex + 1;
  state.chunkIndex = idx;
  return bodySpeech(state, body, idx);
}

function withState(handlerInput) {
  const state = sessionState(handlerInput);
  state.token = getAccessToken(handlerInput);
  return state;
}

function isGmailError(e) {
  return Boolean(e) && e.name === 'GmailError';
}

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'LaunchRequest'
    );
  },
  async handle(handlerInput) {
    if (!isLinked(handlerInput)) {
      return linkAccountResponse(handlerInput);
    }
    const state = withState(handlerInput);
    try {
      await loadUnread(state);
    } catch (e) {
      if (isGmailError(e)) return gmailErrorResponse(handlerInput, e, state);
      throw e;
    }
    const prefix = 'Mail reader. ';
    if (!state.metas.length) {
      return keepOpen(handlerInput, prefix + NO_UNREAD, MENU, state);
    }
    return keepOpen(
      handlerInput,
      prefix + listSpeech(state, ''),
      'Say read it, next, or how many unread.',
      state,
    );
  },
};

const ComposeIntentHandler = {
  canHandle(handlerInput) {
    const req = handlerInput.requestEnvelope.request;
    return (
      req.type === 'IntentRequest' &&
      req.intent.name === 'ComposeIntent'
    );
  },
  handle(handlerInput) {
    const req = handlerInput.requestEnvelope.request;
    if (!isLinked(handlerInput)) {
      return linkAccountResponse(handlerInput);
    }
    if (req.dialogState === 'IN_PROGRESS') {
      return handlerInput.responseBuilder
        .addDirective({ type: 'Dialog.Delegate' })
        .getResponse();
    }
    const state = withState(handlerInput);
    const recipient =
      (req.intent.slots &&
        req.intent.slots.recipient &&
        req.intent.slots.recipient.value) ||
      'nobody yet';
    state.draft = {
      to: recipient,
      subject:
        (req.intent.slots &&
          req.intent.slots.subject &&
          req.intent.slots.subject.value) ||
        '',
      body:
        (req.intent.slots &&
          req.intent.slots.body &&
          req.intent.slots.body.value) ||
        '',
    };
    return keepOpen(
      handlerInput,
      `Composing an email to ${sp.escapeXml(recipient)}. ` +
        'When the connection is ready, you will hear the address ' +
        'read back before anything is sent. Say help for choices.',
      MENU,
      state,
    );
  },
};

const MenuIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest';
  },
  async handle(handlerInput) {
    const req = handlerInput.requestEnvelope.request;
    if (!isLinked(handlerInput)) {
      return linkAccountResponse(handlerInput);
    }
    const name = req.intent.name;
    const slots = req.intent.slots || {};
    const state = withState(handlerInput);
    let speech;

    try {
      switch (name) {
        case 'ReadUnreadIntent':
          await loadUnread(state);
          if (!state.metas.length) {
            speech = NO_UNREAD;
          } else {
            speech = listSpeech(state, '');
          }
          break;
        case 'ReadLatestIntent': {
          await loadLatest(state);
          if (!state.metas.length) {
            speech = 'I could not find any messages. ' + MENU;
            break;
          }
          speech = await readCurrentBody(handlerInput, state);
          break;
        }
        case 'ReadMessageIntent': {
          const n = Number(
            slots.messageNumber && slots.messageNumber.value,
          );
          if (!state.msgIds.length) await loadUnread(state);
          if (!state.msgIds.length) {
            speech = NO_UNREAD;
            break;
          }
          if (!Number.isFinite(n) || n < 1) {
            speech = summarySpeech(state);
            break;
          }
          const idx = Math.min(Math.floor(n), state.msgIds.length) - 1;
          state.msgIndex = Math.max(0, idx);
          state.chunkIndex = -1;
          speech = await readCurrentBody(handlerInput, state);
          break;
        }
        case 'ReadCurrentIntent': {
          if (!state.msgIds.length) await loadUnread(state);
          if (!state.msgIds.length) {
            speech = NO_UNREAD;
            break;
          }
          if (state.chunkIndex < 0) {
            speech = await readCurrentBody(handlerInput, state);
          } else {
            speech = await continueBody(handlerInput, state);
          }
          break;
        }
        case 'NextMessageIntent': {
          if (!state.msgIds.length) await loadUnread(state);
          if (!state.msgIds.length) {
            speech = NO_UNREAD;
            break;
          }
          if (state.msgIndex >= state.msgIds.length - 1) {
            speech =
              'That is the last message. ' +
              (state.metas[state.msgIndex]
                ? sp.summaryLine(state.metas[state.msgIndex])
                : '') +
              '<break time="500ms"/>' +
              MENU_MSG;
            break;
          }
          state.msgIndex += 1;
          state.chunkIndex = -1;
          speech = summarySpeech(state);
          break;
        }
        case 'PreviousMessageIntent': {
          if (!state.msgIds.length) await loadUnread(state);
          if (!state.msgIds.length) {
            speech = NO_UNREAD;
            break;
          }
          if (state.msgIndex <= 0) {
            speech =
              'You are at the first message. ' +
              (state.metas[0] ? sp.summaryLine(state.metas[0]) : '') +
              '<break time="500ms"/>' +
              MENU_MSG;
            break;
          }
          state.msgIndex -= 1;
          state.chunkIndex = -1;
          speech = summarySpeech(state);
          break;
        }
        case 'RepeatIntent':
          speech =
            state.lastSpeech ||
            (state.metas[state.msgIndex]
              ? summarySpeech(state)
              : MENU);
          break;
        case 'ReplyIntent':
          speech =
            'Reply flow. ' +
            'When it is connected, dictate your reply and you will ' +
            'hear it read back before sending.';
          break;
        case 'AddBodyIntent': {
          const added = slots.addedText && slots.addedText.value;
          if (state.draft) {
            state.draft.body = state.draft.body
              ? `${state.draft.body} ${added || ''}`
              : added || '';
          }
          speech = `Added: ${sp.escapeXml(added || 'nothing')}. Say send it, or add more.`;
          break;
        }
        case 'ConfirmSendIntent':
          speech = 'Send confirmed. Nothing has been sent in this test build.';
          state.draft = null;
          break;
        case 'DiscardIntent':
          speech = 'Discarded. Nothing was sent.';
          state.draft = null;
          break;
        case 'SearchIntent': {
          const sender = slots.sender && slots.sender.value;
          if (!sender) {
            speech = 'Who should I search for? ' + MENU;
            break;
          }
          await loadSearch(state, sender);
          if (!state.metas.length) {
            speech = `I found no messages from ${sp.escapeXml(sender)}. ` + MENU;
            break;
          }
          speech = listSpeech(
            state,
            `${state.metas.length} ${
              state.metas.length === 1 ? 'message' : 'messages'
            } from ${sp.escapeXml(sp.senderName(sender))}. `,
          );
          break;
        }
        case 'CountIntent':
          await loadUnread(state);
          speech =
            'You have ' +
            sp.countText(state.unreadCount, LIST_CAP) +
            '.<break time="500ms"/>' +
            MENU;
          break;
        case 'AMAZON.HelpIntent':
          speech = `Here is what you can say. ${MENU}`;
          break;
        default:
          speech = `I heard ${sp.escapeXml(name)}. ${MENU}`;
      }
    } catch (e) {
      if (isGmailError(e)) return gmailErrorResponse(handlerInput, e, state);
      throw e;
    }

    return keepOpen(handlerInput, speech, MENU, state);
  },
};

const StopCancelIntentHandler = {
  canHandle(handlerInput) {
    const req = handlerInput.requestEnvelope.request;
    return (
      req.type === 'IntentRequest' &&
      (req.intent.name === 'AMAZON.StopIntent' ||
        req.intent.name === 'AMAZON.CancelIntent')
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Goodbye.')
      .withShouldEndSession(true)
      .getResponse();
  },
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name ===
        'AMAZON.FallbackIntent'
    );
  },
  handle(handlerInput) {
    return keepOpen(
      handlerInput,
      `I did not catch that. ${MENU}`,
      'What would you like to do?',
    );
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'SessionEndedRequest'
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .withShouldEndSession(true)
      .getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log('Error handled:', error.message);
    return keepOpen(
      handlerInput,
      `Sorry, I had a problem. ${MENU}`,
      'What would you like to do?',
    );
  },
};

const coreHandler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    StopCancelIntentHandler,
    ComposeIntentHandler,
    FallbackIntentHandler,
    MenuIntentHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();

function handler(event, context, callback) {
  const session = event && event.session;
  const system = event && event.context && event.context.System;
  const appId =
    (session && session.application && session.application.applicationId) ||
    (system && system.application && system.application.applicationId);
  if (appId && appId !== SKILL_ID) {
    const err = new Error('application id mismatch');
    if (typeof callback === 'function') return callback(err);
    return Promise.reject(err);
  }
  return coreHandler(event, context, callback);
}

module.exports = { handler, SKILL_ID };
