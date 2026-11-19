'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function settingsPath() {
  return (
    process.env.SETTINGS_PATH ||
    path.join(os.homedir(), '.config', 'alexa-mail-reader', 'settings.json')
  );
}

function readAll() {
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch (e) {
    return {};
  }
}

function writeAll(data) {
  try {
    const p = settingsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    fs.writeFileSync(p, JSON.stringify(data), { mode: 0o600 });
  } catch (e) {
    console.log('[settings] write failed:', e.message);
  }
}

// Verbose logging toggle. Default is ON (plan section 10 and the
// global debug-log rules both require on-by-default). Persists across
// sessions until explicitly changed.
function getVerbose(userId) {
  if (!userId) return true;
  const rec = readAll()[userId];
  return !(rec && rec.verbose === false);
}

function setVerbose(userId, value) {
  if (!userId) return;
  const all = readAll();
  const rec = all[userId] || {};
  rec.verbose = value !== false;
  rec.updatedAt = new Date().toISOString();
  all[userId] = rec;
  writeAll(all);
}

module.exports = { getVerbose, setVerbose, settingsPath };
