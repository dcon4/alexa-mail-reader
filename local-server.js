'use strict';
const http = require('http');
const { handler } = require('./src/index.js');

const PORT = Number(process.env.PORT || 8443);

function invoke(event) {
  return new Promise((resolve, reject) => {
    try {
      const ret = handler(event, {}, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
      if (ret && typeof ret.then === 'function') {
        ret.then(resolve, reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

function tokenClaims(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const json = Buffer.from(
      parts[1].replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8');
    const c = JSON.parse(json);
    return { iat: c.iat, exp: c.exp, aud: c.aud, scope: c.scope };
  } catch (e) {
    return null;
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const started = Date.now();
    let event;
    try {
      event = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad json' }));
      return;
    }
    const reqType = event && event.request && event.request.type;
    const intentName =
      event && event.request && event.request.intent && event.request.intent.name;
    const accessToken =
      event &&
      event.context &&
      event.context.System &&
      event.context.System.user &&
      event.context.System.user.accessToken;
    const claims = accessToken ? tokenClaims(accessToken) : null;
    console.log(
      new Date().toISOString(),
      'REQ',
      reqType,
      intentName ? 'intent=' + intentName : '',
      'locale=' + (event && event.request && event.request.locale),
      'linked=' + Boolean(accessToken),
      claims ? 'claims=' + JSON.stringify(claims) : ''
    );
    try {
      const out = await invoke(event);
      const body = JSON.stringify(out);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      const speech =
        out &&
        out.response &&
        out.response.outputSpeech &&
        out.response.outputSpeech.ssml;
      console.log(
        new Date().toISOString(),
        'RES',
        reqType,
        'ms=' + (Date.now() - started),
        'card=' +
          (out &&
            out.response &&
            out.response.card &&
            out.response.card.type),
        'speech=' + JSON.stringify(speech || null)
      );
    } catch (e) {
      console.log(new Date().toISOString(), 'ERR', reqType, e && e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e && e.message) }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('alexa-local-server listening on 127.0.0.1:' + PORT);
});
