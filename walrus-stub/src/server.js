#!/usr/bin/env node
// SuiEdge Walrus local stub.
//
// Implements the surface the gateway's HttpWalrusPublisher calls:
//   PUT  /v1/blobs?epochs=N   body: octet-stream  -> 200 { newlyCreated: { blobObject: { blobId } } }
//   GET  /v1/blobs/{blobId}                      -> 200 octet-stream
//
// Storage:
//   - in-memory map for fast hits
//   - optional on-disk persistence under --data-dir
//   - blob ids are base64url(sha256(body)) so a PUT + GET round-trip is deterministic
//
// This is a dev/test stand-in for the real Walrus testnet publisher
// (https://publisher.walrus-testnet.walrus.space) and aggregator
// (https://aggregator.walrus-testnet.walrus.space). Real Walrus uses
// the same wire shape but is geographically distributed and signs
// the blob with a Sui object id; we just store bytes here.

import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseUrl(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  return { pathname: url.pathname, query: url.searchParams };
}

function send(res, status, body, contentType = 'application/json') {
  res.statusCode = status;
  res.setHeader('content-type', contentType);
  res.setHeader('content-length', String(Buffer.byteLength(body)));
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** PUT /v1/blobs?epochs=N */
async function handlePut(req, res, dataDir) {
  const { query } = parseUrl(req);
  const epochs = Number(query.get('epochs') ?? 1);
  if (!Number.isFinite(epochs) || epochs < 1) {
    return send(res, 400, JSON.stringify({ error: 'invalid epochs' }));
  }
  const body = await readBody(req);
  if (body.length === 0) return send(res, 400, JSON.stringify({ error: 'empty body' }));
  const sha = createHash('sha256').update(body).digest();
  const blobId = b64url(sha);
  if (dataDir) {
    mkdirSync(join(dataDir, 'blobs'), { recursive: true });
    writeFileSync(join(dataDir, 'blobs', `${blobId}.bin`), body);
    writeFileSync(join(dataDir, 'index.tsv'), `${blobId}\t${body.length}\t${Date.now()}\n`, { flag: 'a' });
  }
  // Match real Walrus response shape.
  send(res, 200, JSON.stringify({
    newlyCreated: { blobObject: { blobId, id: blobId, registeredEpoch: Date.now(), certifiedEpoch: Date.now() + 1, storage: { id: blobId }, size: body.length } },
    alreadyCertified: null,
  }));
}

/** GET /v1/blobs/{blobId} */
function handleGet(req, res, dataDir) {
  const { pathname } = parseUrl(req);
  const m = pathname.match(/^\/v1\/blobs\/([A-Za-z0-9_-]+)$/);
  if (!m) return send(res, 404, JSON.stringify({ error: 'not found' }));
  const blobId = m[1];
  let body;
  if (dataDir) {
    try {
      body = readFileSync(join(dataDir, 'blobs', `${blobId}.bin`));
    } catch {
      return send(res, 404, JSON.stringify({ error: 'blob not found' }));
    }
  } else {
    return send(res, 404, JSON.stringify({ error: 'blob not found (no on-disk store)' }));
  }
  send(res, 200, body, 'application/octet-stream');
}

/** GET /healthz */
function handleHealth(req, res) {
  send(res, 200, JSON.stringify({ ok: true, ts: Date.now() }));
}

/** GET /v1/blobs (list, optional ?prefix=) */
function handleList(req, res, dataDir) {
  if (!dataDir) return send(res, 200, JSON.stringify({ blobs: [] }));
  const { query } = parseUrl(req);
  const prefix = query.get('prefix') ?? '';
  let entries = [];
  try {
    entries = readdirSync(join(dataDir, 'blobs'))
      .filter((f) => f.endsWith('.bin'))
      .map((f) => f.replace(/\.bin$/, ''))
      .filter((id) => id.startsWith(prefix));
  } catch {
    entries = [];
  }
  send(res, 200, JSON.stringify({ blobs: entries.map((id) => ({ blobId: id })) }));
}

function main() {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? '0.0.0.0';
  const dataDir = process.env.WALRUS_DATA_DIR ?? null;
  if (dataDir) mkdirSync(dataDir, { recursive: true });

  const server = http.createServer(async (req, res) => {
    try {
      const { pathname } = parseUrl(req);
      if (req.method === 'PUT' && pathname === '/v1/blobs') return await handlePut(req, res, dataDir);
      if (req.method === 'GET' && pathname.startsWith('/v1/blobs/')) return handleGet(req, res, dataDir);
      if (req.method === 'GET' && pathname === '/v1/blobs') return handleList(req, res, dataDir);
      if (req.method === 'GET' && pathname === '/healthz') return handleHealth(req, res);
      send(res, 404, JSON.stringify({ error: 'not found', pathname }));
    } catch (err) {
      send(res, 500, JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });

  server.listen(port, host, () => {
    process.stdout.write(`walrus-stub listening on http://${host}:${port} (dataDir=${dataDir ?? 'in-memory'})\n`);
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      process.stdout.write(`\nwalrus-stub shutting down (${sig})\n`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 3000).unref();
    });
  }
}

main();
