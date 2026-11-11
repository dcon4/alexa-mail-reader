'use strict';

const Alexa = require('ask-sdk-core');

const NOT_CONNECTED =
  'Gmail is not connected in this test build yet.';
const LINKED = 'Mail reader is linked and working.';
const MENU =
  'You can say read my email, next, previous, reply, compose, how many unread, or stop.';

function isLinked(handlerInput) {
  const context = handlerInput.requestEnvelope.context || {};
  const system = context.System || {};
  return Boolean(system.apiAccessToken);
}

function statusLine(handlerInput) {
  return isLinked(handlerInput) ? LINKED : NOT_CONNECTED;
}

function sessionState(handlerInput) {
  const attrs =
    handlerInput.attributesManager.getSessionAttributes() || {};
  return {
    msgIndex: typeof attrs.msgIndex === 'number' ? attrs.msgIndex : 0,
    draft: attrs.draft || null,
  };
}

function saveState(handlerInput, state) {
  handlerInput.attributesManager.setSessionAttributes(state);
  return handlerInput.responseBuilder;
}

function keepOpen(handlerInput, speech, repromptText, state) {
  return saveState(handlerInput, state || sessionState(handlerInput))
    .speak(speech)
    .reprompt(repromptText || MENU)
    .getResponse();
}

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === 'LaunchRequest'
    );
  },
  handle(handlerInput) {
    return keepOpen(
      handlerInput,
      `Mail reader. ${statusLine(handlerInput)} ${MENU}`,
      'Say read my email, or help.',
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
    if (req.dialogState === 'IN_PROGRESS') {
      return handlerInput.responseBuilder
        .addDirective({ type: 'Dialog.Delegate' })
        .getResponse();
    }
    const recipient =
      (req.intent.slots &&
        req.intent.slots.recipient &&
        req.intent.slots.recipient.value) ||
      'nobody yet';
    const state = sessionState(handlerInput);
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
    return saveState(handlerInput, state)
      .speak(
        `Composing an email to ${recipient}. ${statusLine(handlerInput)} ` +
          'When the connection is ready, you will hear the address ' +
          'read back before anything is sent. Say help for choices.',
      )
      .reprompt(MENU)
      .getResponse();
  },
};

const MenuIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest';
  },
  handle(handlerInput) {
    const req = handlerInput.requestEnvelope.request;
    const name = req.intent.name;
    const slots = req.intent.slots || {};
    const state = sessionState(handlerInput);
    let speech;

    switch (name) {
      case 'ReadUnreadIntent':
      case 'ReadLatestIntent':
      case 'ReadCurrentIntent':
        state.msgIndex = 0;
        speech = `Opening your mail. ${statusLine(handlerInput)} ${MENU}`;
        break;
      case 'ReadMessageIntent': {
        const n = slots.messageNumber && slots.messageNumber.value;
        speech = `Reading message ${n || 'one'}. ${statusLine(handlerInput)} ${MENU}`;
        break;
      }
      case 'NextMessageIntent':
        state.msgIndex += 1;
        speech = `Message ${state.msgIndex + 1}. ${statusLine(handlerInput)} Say next, previous, or reply.`;
        break;
      case 'PreviousMessageIntent':
        state.msgIndex = Math.max(0, state.msgIndex - 1);
        speech = `Message ${state.msgIndex + 1}. ${statusLine(handlerInput)} Say next, previous, or reply.`;
        break;
      case 'RepeatIntent':
        speech = `Repeating. ${statusLine(handlerInput)} Say next, previous, or reply.`;
        break;
      case 'ReplyIntent':
        speech =
          'Reply flow. ' +
          statusLine(handlerInput) +
          ' When it is connected, dictate your reply and you will hear it read back before sending.';
        break;
      case 'AddBodyIntent': {
        const added = slots.addedText && slots.addedText.value;
        if (state.draft) {
          state.draft.body = state.draft.body
            ? `${state.draft.body} ${added || ''}`
            : added || '';
        }
        speech = `Added: ${added || 'nothing'}. ${statusLine(handlerInput)} Say send it, or add more.`;
        break;
      }
      case 'ConfirmSendIntent':
        speech = `Send confirmed. ${statusLine(handlerInput)} Nothing has been sent in this test build.`;
        state.draft = null;
        break;
      case 'DiscardIntent':
        speech = 'Discarded. Nothing was sent.';
        state.draft = null;
        break;
      case 'SearchIntent': {
        const sender = slots.sender && slots.sender.value;
        speech = `Searching for mail from ${sender || 'that sender'}. ${statusLine(handlerInput)} ${MENU}`;
        break;
      }
      case 'CountIntent':
        speech = `Counting unread messages. ${statusLine(handlerInput)} ${MENU}`;
        break;
      case 'AMAZON.HelpIntent':
        speech = `Here is what you can say. ${MENU}`;
        break;
      default:
        speech = `I heard ${name}. ${statusLine(handlerInput)} ${MENU}`;
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

const handler = Alexa.SkillBuilders.custom()
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

module.exports = { handler };
