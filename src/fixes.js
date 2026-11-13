'use strict';

// Phonetic address fixes ported from VoiceGmail ContactMatcher.kt
// (2026-11-13): recover from common ASR confusions in dictated
// addresses. Only the user-curated dcon-family rules, NATO letters
// and verbal punctuation are applied directly — the generic
// letter-sound swaps (see->c, bea->b, ...) were contact-match
// variants in VoiceGmail and would mangle real words if applied
// blind. The read-back gate remains the safety net.

const DCON_RULES = [
  ['decon', 'dcon'],
  ['deakon', 'dcon'],
  ['deekon', 'dcon'],
  ['deacon', 'dcon'],
  ['dakon', 'dcon'],
  ['deekan', 'dcon'],
  ['ekon', 'kon'],
];

const NATO = {
  alpha: 'a', bravo: 'b', charlie: 'c', delta: 'd', echo: 'e',
  foxtrot: 'f', golf: 'g', hotel: 'h', india: 'i',
  juliett: 'j', juliet: 'j', kilo: 'k', lima: 'l', mike: 'm',
  november: 'n', oscar: 'o', papa: 'p', quebec: 'q', romeo: 'r',
  sierra: 's', tango: 't', uniform: 'u', victor: 'v',
  whiskey: 'w', whisky: 'w', xray: 'x', 'x-ray': 'x',
  yankee: 'y', zulu: 'z',
};

function parseDictatedEmail(raw) {
  let s = String(raw == null ? '' : raw).toLowerCase().trim();
  if (!s) return null;
  s = s
    .replace(/^(?:my\s+(?:email|address)\s+is|send\s+to|email\s+to|email|to)\s+/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((t) => NATO[t] || t)
    .join(' ');
  s = s
    .replace(/\s+at\s+/g, '@')
    .replace(/\s+dotcom\b/g, ' dot com')
    .replace(/\s+dot\s+/g, '.')
    .replace(/\s+period\s+/g, '.')
    .replace(/\s+point\s+/g, '.')
    .replace(/\s+underscore\s+/g, '_')
    .replace(/\s+(?:dash|hyphen)\s+/g, '-');
  if (!s.includes('@')) return null;
  const at = s.indexOf('@');
  const local = s.slice(0, at).replace(/\s+/g, '');
  const domain = s.slice(at + 1).replace(/\s+/g, '');
  if (!local || !domain.includes('.')) return null;
  return local + '@' + domain;
}

function fixAddress(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return s;
  let addr = s;
  if (!addr.includes('@')) {
    const parsed = parseDictatedEmail(addr);
    if (!parsed) return s;
    addr = parsed;
  }
  addr = addr.toLowerCase();
  const at = addr.indexOf('@');
  let local = addr.slice(0, at);
  const domain = addr.slice(at + 1);
  for (const [from, to] of DCON_RULES) {
    local = local.split(from).join(to);
  }
  return local + '@' + domain;
}

module.exports = { fixAddress, parseDictatedEmail };
