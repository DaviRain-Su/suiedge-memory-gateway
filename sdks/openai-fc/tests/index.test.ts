import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOpenAIAgent, toOpenAIFunctions, TOOL_REGISTRY, type OpenAILike, type OpenAIResponse } from '../src/index.ts';
import { SuiEdgeClient } from '../../client-sdk/src/index.ts';

const stubSigner = () => ({
  address: '0x' + 'a'.repeat(64),
  sign: async () => 'stub',
});

function makeClient() {
  const fetchImpl: typeof fetch = async () => new Response('{}', { status: 200 });
  return new SuiEdgeClient({ baseUrl: 'http://x', signer: stubSigner(), fetchImpl });
}

function scriptOpenAI(responses: OpenAIResponse[]): OpenAILike {
  let i = 0;
  return {
    chat: {
      create: async () => responses[i++] ?? {
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'done' } }],
      },
    },
  };
}

test('toOpenAIFunctions emits 9 functions with JSON Schema parameters', () => {
  const fns = toOpenAIFunctions();
  assert.equal(fns.length, 9);
  for (const f of fns) {
    assert.equal(typeof f.name, 'string');
    assert.equal(typeof f.description, 'string');
    assert.equal(f.parameters.type, 'object');
    assert.ok(f.parameters.properties, `${f.name} missing properties`);
  }
});

test('TOOL_REGISTRY covers the 9 gateway ops', () => {
  assert.equal(Object.keys(TOOL_REGISTRY).length, 9);
  for (const k of ['space_create', 'space_list', 'memory_write', 'memory_search', 'context_load', 'artifact_save', 'trace_log', 'policy_share', 'policy_revoke']) {
    assert.ok(TOOL_REGISTRY[k], `missing ${k}`);
  }
});

test('runOpenAIAgent: text-only response ends in 1 turn with no tool calls', async () => {
  const a = scriptOpenAI([
    { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'hi from gpt' } }] },
  ]);
  const r = await runOpenAIAgent({ client: makeClient(), openai: a, model: 'gpt-4o', prompt: 'say hi' });
  assert.equal(r.finishReason, 'stop');
  assert.equal(r.finalText, 'hi from gpt');
  assert.equal(r.toolCalls.length, 0);
  assert.equal(r.turns, 1);
});

test('runOpenAIAgent: drives function_call -> function message loop until stop', async () => {
  const spaceId = '0x' + 'b'.repeat(64);
  const a = scriptOpenAI([
    {
      choices: [{
        finish_reason: 'function_call',
        message: { role: 'assistant', content: null, function_call: { name: 'space_create', arguments: JSON.stringify({ name: 'agent-1' }) } },
      }],
    },
    {
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'created a space' } }],
    },
  ]);
  const fetchImpl: typeof fetch = async (url) => {
    if (String(url).endsWith('/v1/spaces')) {
      return new Response(JSON.stringify({ id: spaceId, owner: '0x' + 'a'.repeat(64), name: 'agent-1', version: 1 }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
  const client = new SuiEdgeClient({ baseUrl: 'http://x', signer: stubSigner(), fetchImpl });
  const r = await runOpenAIAgent({ client, openai: a, model: 'gpt-4o', prompt: 'create a space' });
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0]!.name, 'space_create');
  assert.deepEqual(r.toolCalls[0]!.input, { name: 'agent-1' });
  assert.equal(r.toolCalls[0]!.rawArguments, JSON.stringify({ name: 'agent-1' }));
  assert.equal(r.turns, 2);
  assert.equal(r.finalText, 'created a space');
});

test('runOpenAIAgent: records invalid-JSON arguments as a failed tool call', async () => {
  const a = scriptOpenAI([
    {
      choices: [{
        finish_reason: 'function_call',
        message: { role: 'assistant', content: null, function_call: { name: 'space_create', arguments: 'not json' } },
      }],
    },
    { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'told you' } }] },
  ]);
  const r = await runOpenAIAgent({ client: makeClient(), openai: a, model: 'gpt-4o', prompt: 'broken' });
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0]!.output, null);
  assert.equal(r.toolCalls[0]!.rawArguments, 'not json');
  assert.equal(r.turns, 2);
});

test('runOpenAIAgent: respects maxTurns even when model keeps calling', async () => {
  const a = scriptOpenAI(new Array(10).fill({
    choices: [{
      finish_reason: 'function_call',
      message: { role: 'assistant', content: null, function_call: { name: 'space_list', arguments: JSON.stringify({ owner: '0x' + 'a'.repeat(64) }) } },
    }],
  }));
  const r = await runOpenAIAgent({ client: makeClient(), openai: a, model: 'gpt-4o', prompt: 'loop', maxTurns: 4 });
  assert.equal(r.turns, 4);
  assert.equal(r.toolCalls.length, 4);
});
