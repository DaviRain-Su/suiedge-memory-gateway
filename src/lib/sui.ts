/**
 * Sui client interface. The only file in the codebase allowed to import
 * @mysten/sui internals. Service layer and routes depend on this
 * interface, not on @mysten/sui directly.
 *
 * Two implementations:
 *   - MockSuiClient: deterministic in-memory, used by tests and dev mode.
 *   - LiveSuiClient: real testnet PTB calls via @mysten/sui 2.17. Uses
 *     a server-side signer (see ./signer.ts). The deployer's keypair
 *     acts as the space owner for the MVP — see README.md.
 */
import { SuiGrpcClient, type SuiGrpcClientOptions } from '@mysten/sui/grpc';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { bcs } from '@mysten/sui/bcs';
import { config } from './config';
import { GatewayError } from './errors';
import { sha256Hex } from './hash';
import { getSigner } from './signer';

export interface SuiMoveCallResult {
  spaceId: string;
  digest: string;
}

export interface SuiClientLike {
  createSpace(args: { name: string; sender: string }): Promise<SuiMoveCallResult>;
  addMemoryPointer(args: {
    spaceId: string;
    kind: 1 | 2 | 3;
    walrusBlobId: string;
    contentHash: string;
    sender: string;
  }): Promise<{ pointerId: string; version: number; digest: string }>;
  sharePolicy(args: {
    spaceId: string;
    subject: string;
    canRead: boolean;
    canWrite: boolean;
    canShare: boolean;
    sender: string;
  }): Promise<{ policyId: string; digest: string }>;
  revokePolicy(args: { spaceId: string; policyId: string; sender: string }): Promise<{ digest: string }>;
  verifySignature(args: {
    address: string;
    method: string;
    path: string;
    body: string;
    signature: string;
  }): Promise<boolean>;
}

const ID_OP_CREATED = 'Created';
const SPACE_ID_LEN = 64; // 0x + 64 hex

function packageId(): string {
  const id = config().suiPackageId;
  if (!id) {
    throw new GatewayError(
      'INTERNAL',
      'SUI_PACKAGE_ID is not set; publish the Move package with `sui client publish` and set the env var',
    );
  }
  return id;
}

function hexPad(n: number, prefix: string, width = SPACE_ID_LEN - prefix.length): string {
  return `0x${prefix}${n.toString(16).padStart(width, '0')}`;
}

/** Real Sui client. Uses SuiGrpcClient for testnet, EnvKeypairSigner for PTB signing. */
export class LiveSuiClient implements SuiClientLike {
  private client: SuiGrpcClient | null = null;
  constructor(client?: SuiGrpcClient) {
    this.client = client ?? null;
  }

  private ensureClient(): SuiGrpcClient {
    if (this.client) return this.client;
    const network = config().suiNetwork;
    const baseUrl =
      network === 'mainnet' ? 'https://fullnode.mainnet.sui.io:443'
      : network === 'devnet' ? 'https://fullnode.devnet.sui.io:443'
      : 'https://fullnode.testnet.sui.io:443';
    const opts = { network, baseUrl } as SuiGrpcClientOptions;
    this.client = new SuiGrpcClient(opts);
    return this.client;
  }

  private async execute(tx: Transaction, label: string): Promise<{
    digest: string;
    changedObjects: Array<{ idOperation?: string; objectId?: string }>;
  }> {
    const client = this.ensureClient();
    const signer = getSigner().signer;
    tx.setGasBudget(BigInt(config().suiGasBudget));
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer,
      include: { effects: true },
    });
    const txBlock = (result as {
      $kind?: string;
      Transaction?: {
        digest?: string;
        status?: { success?: boolean; error?: string };
        effects?: { changedObjects?: Array<{ idOperation?: string; objectId?: string }> };
      };
    }).Transaction;
    if (!txBlock || txBlock.status?.success === false) {
      const msg = txBlock?.status?.error ?? 'unknown error';
      throw new GatewayError('INTERNAL', `Move call ${label} failed: ${msg}`);
    }
    return { digest: txBlock.digest ?? 'unknown', changedObjects: txBlock.effects?.changedObjects ?? [] };
  }

  private firstCreatedObjectId(
    changed: Array<{ idOperation?: string; objectId?: string }>,
    kind: string,
  ): string {
    const created = changed.filter((c) => c.idOperation === ID_OP_CREATED && c.objectId);
    if (created.length === 0) {
      throw new GatewayError('INTERNAL', `no CREATED object in effects for ${kind}`);
    }
    return created[0].objectId!;
  }

  async createSpace(args: { name: string; sender: string }): Promise<SuiMoveCallResult> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId()}::agent_space::create_space`,
      arguments: [tx.pure.string(args.name)],
    });
    const { digest, changedObjects } = await this.execute(tx, 'agent_space::create_space');
    return { spaceId: this.firstCreatedObjectId(changedObjects, 'AgentSpace'), digest };
  }

  async addMemoryPointer(args: {
    spaceId: string;
    kind: 1 | 2 | 3;
    walrusBlobId: string;
    contentHash: string;
    sender: string;
  }): Promise<{ pointerId: string; version: number; digest: string }> {
    const tx = new Transaction();
    const spaceArg: TransactionObjectArgument = tx.object(args.spaceId);
    const blobBytes = Array.from(Buffer.from(args.walrusBlobId, 'utf8'));
    const hashBytes = Array.from(Buffer.from(args.contentHash, 'hex'));
    tx.moveCall({
      target: `${packageId()}::memory_pointer::add_memory_pointer`,
      arguments: [
        spaceArg,
        tx.pure.u8(args.kind),
        tx.pure(bcs.vector(bcs.u8()).serialize(blobBytes)),
        tx.pure(bcs.vector(bcs.u8()).serialize(hashBytes)),
      ],
    });
    const { digest, changedObjects } = await this.execute(tx, 'memory_pointer::add_memory_pointer');
    return {
      pointerId: this.firstCreatedObjectId(changedObjects, 'MemoryPointer'),
      version: 0, // parsed from AgentSpace.bump_after_pointer on the read side
      digest,
    };
  }

  async sharePolicy(args: {
    spaceId: string;
    subject: string;
    canRead: boolean;
    canWrite: boolean;
    canShare: boolean;
    sender: string;
  }): Promise<{ policyId: string; digest: string }> {
    const tx = new Transaction();
    const spaceArg: TransactionObjectArgument = tx.object(args.spaceId);
    tx.moveCall({
      target: `${packageId()}::access_policy::share`,
      arguments: [
        spaceArg,
        tx.pure.address(args.subject),
        tx.pure.bool(args.canRead),
        tx.pure.bool(args.canWrite),
        tx.pure.bool(args.canShare),
      ],
    });
    const { digest, changedObjects } = await this.execute(tx, 'access_policy::share');
    return { policyId: this.firstCreatedObjectId(changedObjects, 'AccessPolicy'), digest };
  }

  async revokePolicy(args: { spaceId: string; policyId: string; sender: string }): Promise<{ digest: string }> {
    const tx = new Transaction();
    const spaceArg: TransactionObjectArgument = tx.object(args.spaceId);
    const policyArg: TransactionObjectArgument = tx.object(args.policyId);
    tx.moveCall({
      target: `${packageId()}::access_policy::revoke`,
      arguments: [spaceArg, policyArg],
    });
    const { digest } = await this.execute(tx, 'access_policy::revoke');
    return { digest };
  }

  async verifySignature(args: {
    address: string;
    method: string;
    path: string;
    body: string;
    signature: string;
  }): Promise<boolean> {
    const message = new TextEncoder().encode(canonicalString(args.method, args.path, args.body));
    try {
      await verifyPersonalMessageSignature(message, args.signature, { address: args.address });
      return true;
    } catch {
      return false;
    }
  }
}

/** Canonical signing string: "<METHOD>\n<PATH>\n<sha256-hex-of-body>". */
export function canonicalString(method: string, path: string, body: string): string {
  return `${method.toUpperCase()}\n${path}\n${sha256Hex(body)}`;
}

// ---------------------------------------------------------------------------
// MockSuiClient — used by tests and dev (when SUI_CLIENT_LIVE=0).
// Per-op counters drive deterministic ids so first addMemoryPointer
// returns version=1.
// ---------------------------------------------------------------------------

export class MockSuiClient implements SuiClientLike {
  private spaces = new Map<string, { id: string; name: string; owner: string; version: number }>();
  private policies = new Map<string, { id: string; spaceId: string; subject: string; canRead: boolean; canWrite: boolean; canShare: boolean; revoked: boolean }>();
  private pointers = new Map<string, { id: string; spaceId: string; kind: 1 | 2 | 3; walrusBlobId: string; contentHash: string; version: number }>();
  private spaceCounter = 0;
  private pointerCounter = 0;
  private policyCounter = 0;
  private revokeCounter = 0;
  private digestCounter = 0;

  async createSpace(args: { name: string; sender: string }): Promise<SuiMoveCallResult> {
    this.spaceCounter += 1;
    const id = hexPad(this.spaceCounter, '');
    this.spaces.set(id, { id, name: args.name, owner: args.sender, version: 0 });
    this.digestCounter += 1;
    return { spaceId: id, digest: `mockdigest${this.digestCounter.toString(16).padStart(40, '0')}` };
  }

  async addMemoryPointer(args: {
    spaceId: string;
    kind: 1 | 2 | 3;
    walrusBlobId: string;
    contentHash: string;
    sender: string;
  }): Promise<{ pointerId: string; version: number; digest: string }> {
    const space = this.spaces.get(args.spaceId);
    if (!space) throw new GatewayError('NOT_FOUND', `space ${args.spaceId} not found`);
    this.pointerCounter += 1;
    const version = this.pointerCounter;
    const id = hexPad(this.pointerCounter, '');
    this.pointers.set(id, { ...args, id, version });
    space.version = version;
    this.digestCounter += 1;
    return { pointerId: id, version, digest: `mockdigest${this.digestCounter.toString(16).padStart(40, '0')}` };
  }

  async sharePolicy(args: {
    spaceId: string;
    subject: string;
    canRead: boolean;
    canWrite: boolean;
    canShare: boolean;
    sender: string;
  }): Promise<{ policyId: string; digest: string }> {
    const space = this.spaces.get(args.spaceId);
    if (!space) throw new GatewayError('NOT_FOUND', `space ${args.spaceId} not found`);
    if (space.owner !== args.sender) throw new GatewayError('FORBIDDEN', 'only owner can share');
    this.policyCounter += 1;
    const id = hexPad(this.policyCounter, '');
    this.policies.set(id, { id, spaceId: args.spaceId, subject: args.subject, canRead: args.canRead, canWrite: args.canWrite, canShare: args.canShare, revoked: false });
    this.digestCounter += 1;
    return { policyId: id, digest: `mockdigest${this.digestCounter.toString(16).padStart(40, '0')}` };
  }

  async revokePolicy(args: { spaceId: string; policyId: string; sender: string }): Promise<{ digest: string }> {
    const space = this.spaces.get(args.spaceId);
    if (!space) throw new GatewayError('NOT_FOUND', `space ${args.spaceId} not found`);
    if (space.owner !== args.sender) throw new GatewayError('FORBIDDEN', 'only owner can revoke');
    const pol = this.policies.get(args.policyId);
    if (!pol) throw new GatewayError('NOT_FOUND', `policy ${args.policyId} not found`);
    if (pol.revoked) throw new GatewayError('CONFLICT', `policy ${args.policyId} already revoked`);
    pol.revoked = true;
    this.revokeCounter += 1;
    this.digestCounter += 1;
    return { digest: `mockdigest${this.digestCounter.toString(16).padStart(40, '0')}` };
  }

  async verifySignature(): Promise<boolean> {
    return true;
  }

  // Test helpers -----------------------------------------------------------
  _seedSpace(space: { id: string; name: string; owner: string; version: number }): void {
    this.spaces.set(space.id, space);
    const idNum = Number.parseInt(space.id.slice(2), 16) || 0;
    if (idNum > this.spaceCounter) this.spaceCounter = idNum;
  }
}

let _singleton: SuiClientLike | null = null;

export function getSuiClient(): SuiClientLike {
  if (_singleton) return _singleton;
  _singleton = process.env.SUI_CLIENT_LIVE === '1'
    ? new LiveSuiClient()
    : new MockSuiClient();
  return _singleton;
}

export function setSuiClient(c: SuiClientLike): void {
  _singleton = c;
}

export function resetSuiClientForTest(): void {
  _singleton = null;
}
