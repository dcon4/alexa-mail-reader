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
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '...', mdash: '—', ndash: '–',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  shy: '', zwj: '', zwnj: '',
  copy: '©', trade: '™', reg: '®', bull: '•', middot: '·',
};

function cp(code) {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch (e) {
    return '';
  }
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]{1,6});/gi, (m, h) => cp(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (m, d) => cp(parseInt(d, 10)))
    .replace(/&([a-z][a-z0-9]{1,9});/gi, (m, name) => {
      const key = name.toLowerCase();
      return key in ENTITIES ? ENTITIES[key] : ' ';
    });
}

function stripFormatChars(s) {
  return s.replace(/\p{Cf}/gu, ' ');
}

function htmlToText(html) {
  let s = String(html == null ? '' : html);
  for (let i = 0; i < 3; i++) {
    s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    s = s.replace(/<!--[\s\S]*?-->/gi, ' ');
    s = s.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, ' ');
    s = s.replace(
      /<\/(p|div|tr|td|th|li|h[1-6]|section|article|table)\s*>/gi,
      '\n',
    );
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<[^>]+>/g, ' ');
    s = decodeEntities(s);
  }
  s = s.replace(/<!--|-->/g, ' ');
  s = stripFormatChars(s);
  s = s.replace(/[ \t]+/g, ' ');
  return s;
}

function looksLikeBrokenPlain(s) {
  return /<!doctype|<html[\s>]|<table[\s>]|<style[\s>]|&lt;\/?(?:html|table|div|tr|td)\b|font-family\s*:/i.test(
    s,
  );
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

function scrubUrls(text) {
  return String(text == null ? '' : text).replace(
    /(?:https?:\/\/|www\.)[^\s<>"']+/gi,
    (match) => {
      const trailing = (match.match(/[.,;:!?)\]}'"]+$/) || [''])[0];
      const core = match.slice(0, match.length - trailing.length);
      let host = '';
      try {
        host = new URL(
          /^https?:\/\//i.test(core) ? core : 'https://' + core,
        ).hostname;
      } catch (e) {
        host = core
          .replace(/^(?:https?:\/\/|www\.)+/i, '')
          .split(/[/?#]/)[0];
      }
      host = host.replace(/^www\./i, '').replace(/\.+$/, '');
      return (host || 'weblink') + trailing;
    },
  );
}

function stripEmoji(s) {
  return String(s == null ? '' : s)
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\p{Regional_Indicator}/gu, ' ')
    .replace(/[\u{FE0F}\u{200D}]/gu, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function extractBody(fullMessage) {
  const payload = fullMessage.payload;
  const plain = findPart(payload, 'text/plain');
  const html = findPart(payload, 'text/html');
  const plainRaw = plain ? decodeB64Url(plain) : null;
  const htmlRaw = html ? decodeB64Url(html) : null;
  let raw = '';
  if (plainRaw && !(htmlRaw && looksLikeBrokenPlain(plainRaw))) {
    raw = stripFormatChars(decodeEntities(plainRaw));
  } else if (htmlRaw) {
    raw = htmlToText(htmlRaw);
  } else if (plainRaw) {
    raw = stripFormatChars(decodeEntities(plainRaw));
  }
  const cleaned = stripEmoji(scrubUrls(cleanText(raw)));
  return {
    text: cleaned,
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
  scrubUrls,
  stripEmoji,
};
