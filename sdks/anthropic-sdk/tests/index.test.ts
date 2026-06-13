import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent, toAnthropicTools, TOOL_REGISTRY, type AnthropicLike, type AnthropicResponse } from '../src/index.ts';
import { SuiEdgeClient } from '../../client-sdk/src/index.ts';

const stubSigner = () => ({
  address: '0x' + 'a'.repeat(64),
  sign: async () => 'stub',
});

function makeClient() {
  const fetchImpl: typeof fetch = async () =>
    new Response('{}', { status: 200 });
  return new SuiEdgeClient({ baseUrl: 'http://x', signer: stubSigner(), fetchImpl });
}

function scriptAnthropic(responses: AnthropicResponse[]): AnthropicLike {
  let i = 0;
  const calls: AnthropicResponse[] = [];
  return {
    messages: {
      create: async (req) => {
        calls.push({
          stop_reason: responses[i]?.stop_reason ?? 'end_turn',
          content: responses[i]?.content ?? [{ type: 'text', text: 'done' }],
        });
        return responses[i++] ?? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] };
      },
    },
  };
}

test('toAnthropicTools emits 9 tools with JSON Schema input_schema', () => {
  const tools = toAnthropicTools();
  assert.equal(tools.length, 9);
  for (const t of tools) {
    assert.equal(typeof t.name, 'string');
    assert.equal(typeof t.description, 'string');
    assert.equal(t.input_schema.type, 'object');
    assert.ok(t.input_schema.properties, `${t.name} missing properties`);
  }
});

test('TOOL_REGISTRY covers the same 9 ops as the gateway MCP server', () => {
  const expected = new Set([
    'space_create', 'space_list',
    'memory_write', 'memory_search', 'context_load',
    'artifact_save', 'trace_log',
    'policy_share', 'policy_revoke',
  ]);
  for (const k of expected) {
    assert.ok(TOOL_REGISTRY[k], `missing ${k}`);
  }
  assert.equal(Object.keys(TOOL_REGISTRY).length, 9);
});

test('runAgent: pure text response returns finalText and ends in 1 turn', async () => {
  const a = scriptAnthropic([{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hello world' }] }]);
  const r = await runAgent({ client: makeClient(), anthropic: a, model: 'm', prompt: 'say hi' });
  assert.equal(r.stopReason, 'end_turn');
  assert.equal(r.finalText, 'hello world');
  assert.equal(r.toolCalls.length, 0);
  assert.equal(r.turns, 1);
});

test('runAgent: drives tool_use -> tool_result loop until end_turn', async () => {
  const spaceId = '0x' + 'b'.repeat(64);
  const a = scriptAnthropic([
    {
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'tu1', name: 'space_create', input: { name: 'agent-1' } },
      ],
    },
    {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'created a space' }],
    },
  ]);
  const fetchImpl: typeof fetch = async (url) => {
    if (String(url).endsWith('/v1/spaces')) {
      return new Response(JSON.stringify({ id: spaceId, owner: '0x' + 'a'.repeat(64), name: 'agent-1', version: 1 }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
  const client = new SuiEdgeClient({ baseUrl: 'http://x', signer: stubSigner(), fetchImpl });
  const r = await runAgent({ client, anthropic: a, model: 'm', prompt: 'create a space' });
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0]!.name, 'space_create');
  assert.deepEqual(r.toolCalls[0]!.input, { name: 'agent-1' });
  assert.equal(r.turns, 2);
  assert.equal(r.finalText, 'created a space');
});

test('runAgent: tool use without defaultSpaceId is rejected when no spaceId is passed', async () => {
  const a = scriptAnthropic([
    {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu1', name: 'memory_write', input: { kind: 'note', payload: 'x' } }],
    },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'failed' }] },
  ]);
  const r = await runAgent({ client: makeClient(), anthropic: a, model: 'm', prompt: 'write' });
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0]!.output, null, 'should record a failed tool call');
});

test('runAgent: stops after maxTurns even if model still wants more tools', async () => {
  const a = scriptAnthropic(new Array(10).fill({
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'tu', name: 'space_list', input: { owner: '0x' + 'a'.repeat(64) } }],
  }));
  const r = await runAgent({ client: makeClient(), anthropic: a, model: 'm', prompt: 'loop', maxTurns: 3 });
  assert.equal(r.turns, 3);
  assert.equal(r.toolCalls.length, 3);
});
