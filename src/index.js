'use strict';

// Phase 0 stub. Phase 2 replaces this with the ASK SDK handler and
// the real intent router. It exists now so CI can prove the packaging
// and test loop work end to end.

const STUB_SPEECH =
  'Mail reader is installed, but it is not built yet. ' +
  'Setup is still in progress.';

function handler(event, context, callback) {
  const requestType =
    event && event.request && event.request.type
      ? event.request.type
      : 'Unknown';

  const response = {
    version: '1.0',
    sessionAttributes: {},
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: STUB_SPEECH,
      },
      card: {
        type: 'Simple',
        title: 'Mail Reader',
        content: STUB_SPEECH,
      },
      reprompt: {
        outputSpeech: {
          type: 'PlainText',
          text: 'Say stop to exit.',
        },
      },
      shouldEndSession: false,
    },
  };

  if (requestType === 'SessionEndedRequest') {
    response.response = { shouldEndSession: true };
  }

  callback(null, response);
}

module.exports = { handler, STUB_SPEECH };
