'use strict';

// Shared verbose flag for this request (Lambda runs one request at a
// time per container, so a module-level flag is safe).
// Plan section 10: verbose mode is a stored toggle, default on.

let verbose = true;

function setVerbose(value) {
  verbose = value !== false;
}

function isVerbose() {
  return verbose;
}

function vlog(...parts) {
  if (verbose) console.log('[verbose]', ...parts);
}

module.exports = { setVerbose, isVerbose, vlog };
