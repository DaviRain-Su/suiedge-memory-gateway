// Walrus stub — end-to-end test: start the server on a random port,
// PUT a blob, GET it back, verify round-trip, then list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

function startStub(env = {}) {
  return new Promise((resolve, reject) => {
    const dataDir = env.WALRUS_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'walrus-stub-'));
    const port = 18000 + Math.floor(Math.random() * 1000);
    const child = spawn('node', [new URL('../src/server.js', import.meta.url).pathname], {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', WALRUS_DATA_DIR: dataDir, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
      if (out.includes('listening on')) resolve({ child, port, dataDir });
    });
    child.stderr.on('data', (d) => process.stderr.write(`stub: ${d}`));
    child.on('error', reject);
    setTimeout(() => reject(new Error('stub boot timeout: ' + out)), 5000);
  });
}

function stopStub(child) {
  return new Promise((resolve) => {
    child.on('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => { try { child.kill('SIGKILL'); } catch {} resolve(); }, 1000);
  });
}

test('healthz returns ok', async () => {
  const { child, port } = await startStub();
  try {
    const r = await fetch(`http://127.0.0.1:${port}/healthz`);
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.ok, true);
  } finally {
    await stopStub(child);
  }
});

test('PUT then GET round-trips a blob with a base64url sha256 blobId', async () => {
  const { child, port, dataDir } = await startStub();
  try {
    const body = Buffer.from('hello walrus stub');
    const put = await fetch(`http://127.0.0.1:${port}/v1/blobs?epochs=2`, {
      method: 'PUT',
      body,
      headers: { 'content-type': 'application/octet-stream' },
    });
    assert.equal(put.status, 200);
    const j = await put.json();
    const blobId = j.newlyCreated?.blobObject?.blobId;
    assert.ok(typeof blobId === 'string' && blobId.length > 0, 'blobId missing');
    assert.ok(/^[A-Za-z0-9_-]+$/.test(blobId), `blobId should be base64url: got ${blobId}`);

    const get = await fetch(`http://127.0.0.1:${port}/v1/blobs/${blobId}`);
    assert.equal(get.status, 200);
    const back = Buffer.from(await get.arrayBuffer());
    assert.equal(back.toString('utf8'), 'hello walrus stub');

    // On-disk file present.
    assert.ok(existsSync(join(dataDir, 'blobs', `${blobId}.bin`)));
  } finally {
    await stopStub(child);
  }
});

test('PUT rejects empty body with 400', async () => {
  const { child, port } = await startStub();
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/blobs?epochs=1`, {
      method: 'PUT', body: Buffer.alloc(0), headers: { 'content-type': 'application/octet-stream' },
    });
    assert.equal(r.status, 400);
  } finally {
    await stopStub(child);
  }
});

test('GET unknown blob returns 404', async () => {
  const { child, port } = await startStub();
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/blobs/nonexistent`);
    assert.equal(r.status, 404);
  } finally {
    await stopStub(child);
  }
});

test('PUT same bytes twice returns the same blobId (content-addressed)', async () => {
  const { child, port } = await startStub();
  try {
    const body = Buffer.from('deterministic');
    const a = await (await fetch(`http://127.0.0.1:${port}/v1/blobs?epochs=1`, { method: 'PUT', body })).json();
    const b = await (await fetch(`http://127.0.0.1:${port}/v1/blobs?epochs=1`, { method: 'PUT', body })).json();
    assert.equal(a.newlyCreated.blobObject.blobId, b.newlyCreated.blobObject.blobId);
  } finally {
    await stopStub(child);
  }
});

test('list endpoint returns stored blob ids', async () => {
  const { child, port } = await startStub();
  try {
    const body = Buffer.from('listed blob');
    await fetch(`http://127.0.0.1:${port}/v1/blobs?epochs=1`, { method: 'PUT', body });
    const r = await fetch(`http://127.0.0.1:${port}/v1/blobs`);
    const j = await r.json();
    assert.equal(j.blobs.length, 1);
  } finally {
    await stopStub(child);
  }
});
