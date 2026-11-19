'use strict';

const crypto = require('crypto');

const LOG_GROUP = process.env.LOG_GROUP || '/aws/lambda/email-reader-skill';
const WINDOW_MS = 24 * 3600 * 1000;
const MAX_LINES = 300;

function text(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body,
  };
}

function tokenMatches(provided) {
  const expected = process.env.LOG_SHARE_TOKEN;
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

async function fetchLines() {
  const {
    CloudWatchLogsClient,
    FilterLogEventsCommand,
  } = require('@aws-sdk/client-cloudwatch-logs');
  const client = new CloudWatchLogsClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });
  const out = await client.send(
    new FilterLogEventsCommand({
      logGroupName: LOG_GROUP,
      startTime: Date.now() - WINDOW_MS,
      limit: 1000,
      interleaved: true,
    }),
  );
  const events = (out.events || []).slice().sort((x, y) => x.timestamp - y.timestamp);
  return events
    .slice(-MAX_LINES)
    .map((e) =>
      new Date(e.timestamp).toISOString().replace('T', ' ').slice(0, 23) +
      ' ' +
      String(e.message || '').replace(/\s+$/, ''),
    )
    .filter((l) => l.trim().length > 0);
}

// GET /logs/<token> -> last few hundred log lines as plain text.
// Any other shape -> 404 (never confirm that a token exists).
async function handle(rawPath) {
  const m = /^\/logs\/([A-Za-z0-9_-]+)\/?$/.exec(rawPath || '');
  if (!m) return text(404, 'Not found.');
  if (!process.env.LOG_SHARE_TOKEN) {
    return text(503, 'Log sharing is not configured.');
  }
  if (!tokenMatches(m[1])) return text(404, 'Not found.');
  try {
    const lines = await fetchLines();
    console.log('[logs] served lines=' + lines.length);
    return text(
      200,
      'Email reader log excerpt (' +
        lines.length +
        ' lines, last 24h window)\n\n' +
        lines.join('\n') +
        '\n',
    );
  } catch (e) {
    console.log('[logs] fetch failed:', e.name || e.message);
    return text(502, 'Log fetch failed: ' + (e.name || 'error'));
  }
}

module.exports = { handle };
