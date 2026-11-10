'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'skill-package', 'skill.json'), 'utf8'),
);
const model = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'skill-package',
      'interactionModels',
      'custom',
      'en-US.json',
    ),
    'utf8',
  ),
);

test('invocation name is exactly "mail reader"', () => {
  assert.equal(
    model.interactionModel.languageModel.invocationName,
    'mail reader',
  );
});

test('manifest name is Mail Reader', () => {
  assert.equal(
    manifest.manifest.publishingInformation.locales['en-US'].name,
    'Mail Reader',
  );
});

test('every example phrase uses the invocation name', () => {
  const phrases =
    manifest.manifest.publishingInformation.locales['en-US']
      .examplePhrases;
  assert.ok(phrases.length >= 1 && phrases.length <= 3);
  for (const phrase of phrases) {
    assert.match(phrase.toLowerCase(), /mail reader/);
  }
});

test('model has the required built-in intents', () => {
  const names = model.interactionModel.languageModel.intents.map(
    (i) => i.name,
  );
  for (const required of [
    'AMAZON.CancelIntent',
    'AMAZON.HelpIntent',
    'AMAZON.StopIntent',
    'AMAZON.FallbackIntent',
  ]) {
    assert.ok(names.includes(required), `missing ${required}`);
  }
});

test('model has the full browse and compose vocabulary', () => {
  const names = model.interactionModel.languageModel.intents.map(
    (i) => i.name,
  );
  for (const required of [
    'ReadUnreadIntent',
    'ReadLatestIntent',
    'ReadMessageIntent',
    'ReadCurrentIntent',
    'NextMessageIntent',
    'PreviousMessageIntent',
    'RepeatIntent',
    'ReplyIntent',
    'ComposeIntent',
    'AddBodyIntent',
    'ConfirmSendIntent',
    'DiscardIntent',
    'SearchIntent',
    'CountIntent',
  ]) {
    assert.ok(names.includes(required), `missing ${required}`);
  }
});

test('compose dialog elicits the recipient slot', () => {
  const dialog = model.interactionModel.dialog;
  const compose = dialog.intents.find(
    (i) => i.name === 'ComposeIntent',
  );
  assert.ok(compose, 'ComposeIntent missing from dialog');
  const recipient = compose.slots.find((s) => s.name === 'recipient');
  assert.equal(recipient.prompts.elicitation, 'Elicit.Slot.ComposeIntent.recipient');
  const prompt = model.interactionModel.prompts.find(
    (p) => p.id === 'Elicit.Slot.ComposeIntent.recipient',
  );
  assert.ok(prompt, 'elicitation prompt definition missing');
});

test('no reserved words appear as custom intent names', () => {
  const names = model.interactionModel.languageModel.intents.map(
    (i) => i.name,
  );
  for (const name of names) {
    if (name.startsWith('AMAZON.')) continue;
    assert.match(name, /^[A-Za-z]+Intent$/);
  }
});
