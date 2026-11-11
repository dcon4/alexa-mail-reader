'use strict';

function decodeB64Url(data) {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}

function findPart(payload, mimeType) {
  if (!payload) return null;
  if (payload.mimeType === mimeType && payload.body && payload.body.data) {
    return payload.body.data;
  }
  for (const part of payload.parts || []) {
    const found = findPart(part, mimeType);
    if (found) return found;
  }
  return null;
}

function attachmentNames(payload, out = []) {
  if (!payload) return out;
  if (payload.filename) out.push(payload.filename);
  for (const part of payload.parts || []) attachmentNames(part, out);
  return out;
}

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(s) {
  return s.replace(/&(?:amp|lt|gt|quot|nbsp|#39|#x27);/g, (m) => ENTITIES[m] || m);
}

function htmlToText(html) {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<\/(p|div|tr|li|h[1-6])\s*>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s;
}

function cleanText(raw) {
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/[ \t]+/g, ' ').trim());
  const out = [];
  for (const line of lines) {
    if (/^--\s*$/.test(line)) break;
    if (line.startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function chunkText(text, size = 2500) {
  if (text.length <= size) return [text];
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*|\n+/g) || [text];
  const chunks = [];
  let cur = '';
  for (const sentence of sentences) {
    if (cur && cur.length + sentence.length > size) {
      chunks.push(cur.trim());
      cur = '';
    }
    if (sentence.length > size) {
      if (cur) {
        chunks.push(cur.trim());
        cur = '';
      }
      let rest = sentence;
      while (rest.length > size) {
        let cut = rest.lastIndexOf(' ', size);
        if (cut < size * 0.5) cut = size;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      cur = rest;
    } else {
      cur += sentence;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length ? chunks : [text];
}

function extractBody(fullMessage) {
  const payload = fullMessage.payload;
  const plain = findPart(payload, 'text/plain');
  const html = findPart(payload, 'text/html');
  let raw = '';
  if (plain) raw = decodeB64Url(plain);
  else if (html) raw = htmlToText(decodeB64Url(html));
  return {
    text: cleanText(raw),
    attachments: attachmentNames(payload),
  };
}

module.exports = {
  decodeB64Url,
  extractBody,
  chunkText,
  cleanText,
  htmlToText,
  attachmentNames,
};
