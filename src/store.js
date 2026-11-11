'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function storePath() {
  return (
    process.env.POSITION_STORE_PATH ||
    path.join(os.homedir(), '.config', 'alexa-mail-reader', 'positions.json')
  );
}

function readAll() {
  try {
    const data = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch (e) {
    return {};
  }
}

function writeAll(data) {
  try {
    const p = storePath();
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    fs.writeFileSync(p, JSON.stringify(data), { mode: 0o600 });
  } catch (e) {
    console.log('[store] write failed:', e.message);
  }
}

function savePosition(userId, attrs) {
  if (!userId || !attrs) return;
  if (!Array.isArray(attrs.msgIds) || !attrs.msgIds.length) return;
  if (!Array.isArray(attrs.metas) || attrs.metas.length !== attrs.msgIds.length)
    return;
  const all = readAll();
  all[userId] = {
    msgIds: attrs.msgIds,
    metas: attrs.metas,
    msgIndex: typeof attrs.msgIndex === 'number' ? attrs.msgIndex : 0,
    chunkIndex: typeof attrs.chunkIndex === 'number' ? attrs.chunkIndex : -1,
    unreadCount: typeof attrs.unreadCount === 'number' ? attrs.unreadCount : 0,
    lastSpeech: typeof attrs.lastSpeech === 'string' ? attrs.lastSpeech : '',
    updatedAt: new Date().toISOString(),
  };
  writeAll(all);
}

function loadPosition(userId) {
  if (!userId) return null;
  const rec = readAll()[userId];
  if (!rec) return null;
  if (!Array.isArray(rec.msgIds) || !rec.msgIds.length) return null;
  if (!Array.isArray(rec.metas) || rec.metas.length !== rec.msgIds.length)
    return null;
  if (typeof rec.msgIndex === 'number') {
    rec.msgIndex = Math.max(
      0,
      Math.min(rec.msgIndex, rec.msgIds.length - 1),
    );
  } else {
    rec.msgIndex = 0;
  }
  return rec;
}

module.exports = { savePosition, loadPosition, storePath };
