'use strict';

// Google People API — otherContacts search (the Gmail autocomplete
// pool: people this account has emailed or saved). Scope:
// https://www.googleapis.com/auth/contacts.other.readonly

const API_BASE = 'https://people.googleapis.com/v1';
const TIMEOUT_MS = 4000;
const RETRY_DELAY_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(token, path, allowRetry = true) {
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
      return get(token, path, false);
    }
    throw Object.assign(new Error('people network error'), {
      name: 'PeopleError',
      status: 0,
    });
  }
  clearTimeout(timer);
  if (!res.ok) {
    if (allowRetry && (res.status >= 500 || res.status === 429)) {
      await sleep(RETRY_DELAY_MS);
      return get(token, path, false);
    }
    throw Object.assign(new Error('people http ' + res.status), {
      name: 'PeopleError',
      status: res.status,
    });
  }
  return res.json();
}

async function searchContacts(token, query) {
  const params = new URLSearchParams();
  params.set('query', String(query || '').trim());
  params.set('pageSize', '10');
  params.set('readMask', 'names,emailAddresses');
  const data = await get(
    token,
    API_BASE + '/otherContacts:search?' + params.toString(),
  );
  const list = (data.results || []).map((r) => (r && r.person) || r);
  return list
    .map((p) => ({
      name:
        (p.names &&
          (p.names[0].displayName || p.names[0].givenName || '')) ||
        '',
      email:
        (p.emailAddresses &&
          p.emailAddresses[0] &&
          p.emailAddresses[0].value) ||
        '',
    }))
    .filter((c) => c.email);
}

function bestMatch(query, contacts) {
  const q = String(query == null ? '' : query).toLowerCase().trim();
  if (!q) return null;
  let best = null;
  let bestScore = 0;
  for (const c of contacts || []) {
    const name = String(c.name || '').toLowerCase().trim();
    const local = String(c.email || '')
      .split('@')[0]
      .toLowerCase();
    let score = 0;
    if (name && name === q) score = 100;
    else if (local && local === q) score = 95;
    else if (name && name.startsWith(q)) score = 85;
    else if (name && name.split(/\s+/).some((w) => w.startsWith(q)))
      score = 80;
    else if (local && local.startsWith(q)) score = 75;
    else if (name && name.includes(q)) score = 70;
    else if (local && local.includes(q)) score = 60;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 60 ? best : null;
}

module.exports = { searchContacts, bestMatch };
