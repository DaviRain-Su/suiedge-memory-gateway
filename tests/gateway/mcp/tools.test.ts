/**
 * MCP tool tests: invoke the tool handlers directly (the stdio Server
 * wrapper would require a real MCP client). Verifies that the tool
 * definitions match DESIGN.detailed §8 and that the handlers route to
 * the right service functions.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetConfigForTest } from '@/lib/config';
import { resetStoreForTest } from '@/lib/store';
import { resetSuiClientForTest, setSuiClient, MockSuiClient } from '@/lib/sui';
import { resetWalrusForTest, setWalrus, MemoryWalrusPublisher } from '@/lib/walrus';
import { toolDefinitions } from '@/mcp/tools';

let path: string;
const OWNER = '0x' + 'a'.repeat(64);
const REVIEWER = '0x' + 'b'.repeat(64);

beforeEach(() => {
  path = join(mkdtempSync(join(tmpdir(), 'suiedge-mcp-')), 'test.db');
  process.env.DB_PATH = path;
  process.env.SUI_OWNER_ADDRESS = OWNER;
  resetConfigForTest();
  resetStoreForTest();
  resetSuiClientForTest();
  resetWalrusForTest();
  setSuiClient(new MockSuiClient());
  setWalrus(new MemoryWalrusPublisher());
});

describe('MCP tool definitions', () => {
  it('exposes the 9 expected tools', () => {
    const names = toolDefinitions.map((t) => t.name).sort();
    expect(names).toEqual([
      'artifact.save',
      'context.load',
      'memory.search',
      'memory.write',
      'policy.revoke',
      'policy.share',
      'space.create',
      'space.list',
      'trace.log',
    ]);
  });

  it('every tool has a name, description, and inputSchema', () => {
    for (const t of toolDefinitions) {
      expect(t.name).toMatch(/^[a-z]+\.[a-z]+$/);
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema.type).toBe('object');
      expect(typeof t.handler).toBe('function');
    }
  });
});

describe('MCP tool handlers', () => {
  it('space.create returns AgentSpace with id and version', async () => {
    const tool = toolDefinitions.find((t) => t.name === 'space.create')!;
    const out = await tool.handler({ name: 'demo' }) as { id: string; owner: string; name: string; version: number };
    expect(out.id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(out.owner).toBe(OWNER);
    expect(out.name).toBe('demo');
    expect(out.version).toBe(0);
  });

  it('memory.write returns a MemoryRecord with the on-chain pointer', async () => {
    const create = toolDefinitions.find((t) => t.name === 'space.create')!;
    const space = await create.handler({ name: 'demo' }) as { id: string };
    const write = toolDefinitions.find((t) => t.name === 'memory.write')!;
    const rec = await write.handler({ spaceId: space.id, kind: 'summary', payload: 'hi' }) as {
      id: string; walrusBlobId: string; version: number;
    };
    expect(rec.id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(rec.walrusBlobId).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.version).toBe(1);
  });

  it('context.load returns a bundle', async () => {
    const create = toolDefinitions.find((t) => t.name === 'space.create')!;
    const space = await create.handler({ name: 'demo' }) as { id: string };
    const write = toolDefinitions.find((t) => t.name === 'memory.write')!;
    await write.handler({ spaceId: space.id, kind: 'note', payload: 'a' });
    const load = toolDefinitions.find((t) => t.name === 'context.load')!;
    const bundle = await load.handler({ spaceId: space.id, maxItems: 10 }) as {
      spaceId: string; items: Array<{ content: string }>;
    };
    expect(bundle.spaceId).toBe(space.id);
    expect(bundle.items).toHaveLength(1);
    expect(bundle.items[0].content).toBe('a');
  });

  it('artifact.save + trace.log + policy.share + policy.revoke round-trip', async () => {
    const create = toolDefinitions.find((t) => t.name === 'space.create')!;
    const space = await create.handler({ name: 'demo' }) as { id: string };
    const save = toolDefinitions.find((t) => t.name === 'artifact.save')!;
    const buf = Buffer.from('hello').toString('base64');
    const art = await save.handler({ spaceId: space.id, name: 'a.txt', mimeType: 'text/plain', payload: buf }) as { id: string };
    expect(art.id).toMatch(/^0x[0-9a-f]{64}$/);
    const trace = toolDefinitions.find((t) => t.name === 'trace.log')!;
    const pl = await trace.handler({ spaceId: space.id, runId: 'r1', agentId: 'a', input: 'x', output: 'y' }) as { id: string };
    expect(pl.id).toMatch(/^0x[0-9a-f]{64}$/);
    const shareTool = toolDefinitions.find((t) => t.name === 'policy.share')!;
    const pol = await shareTool.handler({
      spaceId: space.id, subject: REVIEWER, canRead: true, canWrite: true, canShare: false,
    }) as { id: string };
    expect(pol.id).toMatch(/^0x[0-9a-f]{64}$/);
    const revokeTool = toolDefinitions.find((t) => t.name === 'policy.revoke')!;
    const after = await revokeTool.handler({ policyId: pol.id }) as { revoked: boolean };
    expect(after.revoked).toBe(true);
  });

  it('memory.search finds a substring match', async () => {
    const create = toolDefinitions.find((t) => t.name === 'space.create')!;
    const space = await create.handler({ name: 'demo' }) as { id: string };
    const write = toolDefinitions.find((t) => t.name === 'memory.write')!;
    await write.handler({ spaceId: space.id, kind: 'note', payload: 'walrus is great' });
    await write.handler({ spaceId: space.id, kind: 'note', payload: 'sui is fast' });
    const search = toolDefinitions.find((t) => t.name === 'memory.search')!;
    const out = await search.handler({ spaceId: space.id, query: 'walrus' }) as Array<{ content: string }>;
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe('walrus is great');
  });
});
