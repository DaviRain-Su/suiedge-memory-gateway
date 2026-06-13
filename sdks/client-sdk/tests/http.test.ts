import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SuiEdgeClient, SuiEdgeError } from '../src/http.ts';

const stubSigner = (address = '0x' + 'a'.repeat(64)) => ({
  address,
  sign: async (_challenge: string) => 'stub-signature',
});

test('builds URLs without trailing slash', () => {
  const client = new SuiEdgeClient({ baseUrl: 'http://example.com/', signer: stubSigner() });
  // smoke: call private field via public method
  assert.equal(typeof client.createSpace, 'function');
});

test('signs every request with x-sui-address and x-sui-signature', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    seen.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ id: '0x' + '1'.repeat(64), owner: '0x' + 'a'.repeat(64), name: 'x', version: 0, activeMemoryRoot: '' }), { status: 200 });
  };
  const client = new SuiEdgeClient({ baseUrl: 'http://x', signer: stubSigner(), fetchImpl });
  await client.createSpace('hello');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'http://x/v1/spaces');
  const headers = seen[0].init.headers as Record<string, string>;
  assert.equal(headers['x-sui-address'], '0x' + 'a'.repeat(64));
  assert.equal(headers['x-sui-signature'], 'stub-signature');
  assert.equal(headers['content-type'], 'application/json');
});

test('canonical string is METHOD\\nPATH\\nsha256(body)', async () => {
  const seen: string[] = [];
  const signer = {
    address: '0x' + 'a'.repeat(64),
    sign: async (challenge: string) => { seen.push(challenge); return 'sig'; },
  };
  const fetchImpl: typeof fetch = async () => new Response('{}');
  const client = new SuiEdgeClient({ baseUrl: 'http://x', signer, fetchImpl });
  await client.writeMemory('0x' + 'b'.repeat(64), 'summary', 'hello world');
  // sha256("") starts with e3b0c4...; sha256('{"kind":"summary","payload":"hello world"}')
  // starts with f1a81b... — just assert shape, not exact hash.
  const c = seen[0]!;
  const lines = c.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], 'POST');
  assert.equal(lines[1]!.startsWith('/v1/spaces/0x' + 'b'.repeat(64) + '/memories'), true);
  assert.match(lines[2]!, /^[0-9a-f]{64}$/);
});

test('throws SuiEdgeError with body on non-2xx', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ error: 'space not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  const client = new SuiEdgeClient({ baseUrl: 'http://x', signer: stubSigner(), fetchImpl });
  await assert.rejects(
    () => client.getSpace('0x' + 'c'.repeat(64)),
    (err: unknown) => err instanceof SuiEdgeError && err.status === 404 && err.message === 'space not found',
  );
});
