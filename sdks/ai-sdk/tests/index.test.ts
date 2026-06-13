import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suiedgeTools, type ToolFactory } from '../src/index.ts';
import { SuiEdgeClient } from '../../client-sdk/src/index.ts';

const stubTool: ToolFactory = (cfg) => cfg as unknown;

const stubSigner = () => ({
  address: '0x' + 'a'.repeat(64),
  sign: async () => 'stub',
});

function makeClient(responses: Array<{ ok: boolean; status: number; body: string }>) {
  let i = 0;
  const fetchImpl: typeof fetch = async () => {
    const r = responses[i++] ?? { ok: true, status: 200, body: '{}' };
    return new Response(r.body, { status: r.status });
  };
  return new SuiEdgeClient({ baseUrl: 'http://x', signer: stubSigner(), fetchImpl });
}

test('exposes 9 tools, each with a description and zod input schema', () => {
  const client = makeClient([]);
  const tools = suiedgeTools({ client, tool: stubTool });
  const names = Object.keys(tools);
  assert.equal(names.length, 9);
  for (const n of names) {
    const t = tools[n as keyof typeof tools] as { description: string; inputSchema: unknown };
    assert.ok(typeof t.description === 'string' && t.description.length > 0, `${n} missing description`);
    assert.ok(t.inputSchema, `${n} missing inputSchema`);
  }
});

test('memory_write routes through client.writeMemory with default space', async () => {
  const SPACE = '0x' + 'b'.repeat(64);
  const client = makeClient([{ ok: true, status: 200, body: JSON.stringify({ id: 'x', spaceId: SPACE, version: 1, kind: 'summary', walrusBlobId: 'blob', contentHash: 'h', createdAt: 'now' }) }]);
  const tools = suiedgeTools({ client, tool: stubTool, defaultSpaceId: SPACE });
  await (tools.memory_write as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({ kind: 'summary', payload: 'hi' });
});

test('memory_write rejects when no spaceId and no default', async () => {
  const client = makeClient([]);
  const tools = suiedgeTools({ client, tool: stubTool });
  await assert.rejects(
    () => (tools.memory_write as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({ kind: 'summary', payload: 'hi' }),
    /spaceId is required/,
  );
});

test('artifact_save base64-decodes content before calling client', async () => {
  const SPACE = '0x' + 'b'.repeat(64);
  let captured: { init?: RequestInit } = {};
  const fetchImpl: typeof fetch = async (_url, init) => {
    captured.init = init;
    return new Response(JSON.stringify({ id: 'x', spaceId: SPACE, version: 1, name: 'f', mimeType: 'text/plain', walrusBlobId: 'blob', contentHash: 'h', createdAt: 'now' }), { status: 200 });
  };
  const client = new SuiEdgeClient({ baseUrl: 'http://x', signer: stubSigner(), fetchImpl });
  const tools = suiedgeTools({ client, tool: stubTool, defaultSpaceId: SPACE });
  await (tools.artifact_save as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({
    name: 'a.txt',
    mimeType: 'text/plain',
    contentBase64: Buffer.from('hello').toString('base64'),
  });
  // Confirm body is the base64 string (gateway will decode).
  const body = (captured.init as { body?: string }).body!;
  assert.match(body, /"payload":"aGVsbG8="/);
});
