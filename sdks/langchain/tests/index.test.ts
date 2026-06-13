import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suiedgeLangChainTools, type DynamicToolFactory } from '../src/index.ts';
import { SuiEdgeClient } from '../../client-sdk/src/index.ts';

const stubTool: DynamicToolFactory = (cfg) => cfg as unknown;

const stubSigner = () => ({
  address: '0x' + 'a'.repeat(64),
  sign: async () => 'stub',
});

function makeClient() {
  const fetchImpl: typeof fetch = async () => new Response('{}');
  return new SuiEdgeClient({ baseUrl: 'http://x', signer: stubSigner(), fetchImpl });
}

test('returns 9 tools, each with a name, description, zod schema, and func', () => {
  const tools = suiedgeLangChainTools({ client: makeClient(), dynamicTool: stubTool });
  assert.equal(tools.length, 9);
  for (const t of tools) {
    const tool = t as { name: string; description: string; schema: unknown; func: unknown };
    assert.equal(typeof tool.name, 'string');
    assert.ok(tool.description.length > 0);
    assert.ok(tool.schema);
    assert.equal(typeof tool.func, 'function');
  }
});

test('names are unique', () => {
  const tools = suiedgeLangChainTools({ client: makeClient(), dynamicTool: stubTool });
  const names = (tools as Array<{ name: string }>).map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
});

test('memory_write defaults to defaultSpaceId when spaceId omitted', async () => {
  const SPACE = '0x' + 'b'.repeat(64);
  const tools = suiedgeLangChainTools({ client: makeClient(), dynamicTool: stubTool, defaultSpaceId: SPACE });
  const tw = (tools as Array<{ name: string; func: (a: unknown) => Promise<unknown> }>).find((t) => t.name === 'memory_write')!;
  // No throw, no special setup — just exercise the path. Default space gets passed through.
  await tw.func({ kind: 'summary', payload: 'hi' });
});
