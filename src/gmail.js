'use strict';

const API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TIMEOUT_MS = 4000;
const RETRY_DELAY_MS = 250;

class GmailError extends Error {
  constructor(status, message) {
    super(message || 'gmail error ' + status);
    this.name = 'GmailError';
    this.status = status; // 0 = network failure or timeout
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(token, path, allowRetry = true) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(path, {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
      },
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (allowRetry) {
      await sleep(RETRY_DELAY_MS);
      return request(token, path, false);
    }
    throw new GmailError(0, 'network error');
  }
  clearTimeout(timer);
  if (!res.ok) {
    if (allowRetry && (res.status >= 500 || res.status === 429)) {
      await sleep(RETRY_DELAY_MS);
      return request(token, path, false);
    }
    let detail = '';
    try {
      const body = await res.json();
      const err = body && body.error;
      if (typeof err === 'string') {
        detail = err;
        if (body.error_description) {
          detail += ': ' + String(body.error_description).slice(0, 200);
        }
      } else if (err && (err.message || err.status)) {
        detail = String(err.message || err.status).slice(0, 200);
      }
    } catch (e) {
      // non-JSON error body
    }
    console.log('[gmail]', res.status, detail || 'no error body');
    throw new GmailError(res.status, detail || 'http ' + res.status);
  }
  return res.json();
}

async function listMessageIds(token, { q, maxResults = 25 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('maxResults', String(maxResults));
  const data = await request(token, API_BASE + '/messages?' + params);
  return (data.messages || []).map((m) => m.id);
}

async function getMessageMeta(token, id) {
  const data = await request(
    token,
    API_BASE + '/messages/' + encodeURIComponent(id) + '?format=metadata',
  );
  const headers = {};
  for (const h of (data.payload && data.payload.headers) || []) {
    headers[h.name.toLowerCase()] = h.value;
  }
  return {
    id,
    from: headers.from || '',
    subject: headers.subject || '',
    date: headers.date || '',
  };
}

async function getMessageMetas(token, ids) {
  return Promise.all(ids.map((id) => getMessageMeta(token, id)));
}

async function getMessageFull(token, id) {
  return request(
    token,
    API_BASE + '/messages/' + encodeURIComponent(id) + '?format=full',
  );
}

module.exports = {
  GmailError,
  listMessageIds,
  getMessageMeta,
  getMessageMetas,
  getMessageFull,
};
