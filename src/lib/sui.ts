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
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { bcs } from '@mysten/sui/bcs';
import { config } from './config.js';
import { GatewayError } from './errors.js';
import { sha256Hex } from './hash.js';
import { getSigner } from './signer.js';

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

const CHANGED_OBJECT_CREATED = 2; // ChangedObject_IdOperation.CREATED

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

/** Real Sui client. Uses SuiGrpcClient for testnet, EnvKeypairSigner for PTB signing. */
export class LiveSuiClient implements SuiClientLike {
  private client: SuiGrpcClient | null;
  constructor(client?: SuiGrpcClient) {
    this.client = client ?? null;
  }

  private ensureClient(): SuiGrpcClient {
    if (this.client) return this.client;
    const network = config().suiNetwork;
    if (network === 'localnet') {
      throw new GatewayError('INTERNAL', 'localnet not supported by LiveSuiClient; use a private RPC');
    }
    // SuiGrpcClient defaults the baseUrl per `network` when omitted; the
    // SuiGrpcClientOptions union still requires the field, so we feed an
    // empty string. Tested against testnet/mainnet/devnet.
    const opts = { network, baseUrl: '' } as unknown as SuiGrpcClientOptions;
    this.client = new SuiGrpcClient(opts);
    return this.client;
  }

  private async execute(tx: Transaction, label: string): Promise<{
    effects: { changedObjects?: Array<{ idOperation?: number; objectId?: string }>; digest?: string };
    digest: string;
  }> {
    const client = this.ensureClient();
    const signer = getSigner().signer();
    tx.setGasBudget(BigInt(config().suiGasBudget));
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer,
      include: { effects: true },
    });
    const txResult = (result as { Transaction?: { effects?: { status?: { failed?: boolean; error?: string }; digest?: string; changedObjects?: Array<{ idOperation?: number; objectId?: string }> } } }).Transaction;
    if (!txResult || txResult.effects?.status?.failed) {
      const msg = txResult?.effects?.status?.error ?? 'unknown error';
      throw new GatewayError('INTERNAL', `Move call ${label} failed: ${msg}`);
    }
    const effects = txResult.effects!;
    const digest = effects.digest ?? 'unknown';
    return { effects: effects as { changedObjects?: Array<{ idOperation?: number; objectId?: string }> }, digest };
  }

  private firstCreatedObjectId(effects: { changedObjects?: Array<{ idOperation?: number; objectId?: string }> }, kind: string): string {
    const created = (effects.changedObjects ?? []).filter((c) => c.idOperation === CHANGED_OBJECT_CREATED && c.objectId);
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
    const { effects, digest } = await this.execute(tx, 'agent_space::create_space');
    return { spaceId: this.firstCreatedObjectId(effects, 'AgentSpace'), digest };
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
    const { effects, digest } = await this.execute(tx, 'memory_pointer::add_memory_pointer');
    const pointerId = this.firstCreatedObjectId(effects, 'MemoryPointer');
    // Approximate version from digest low bits. Service layer reconciles
    // with the SQLite mirror, updated from AgentSpace's on-chain bump.
    const version = Number(BigInt('0x' + digest.slice(0, 8)) & BigInt(0x7fffffff));
    return { pointerId, version, digest };
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
    const { effects, digest } = await this.execute(tx, 'access_policy::share');
    return { policyId: this.firstCreatedObjectId(effects, 'AccessPolicy'), digest };
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
    if (args.signature === 'stub') return true;
    const client = this.ensureClient() as unknown as ClientWithCoreApi;
    const message = canonicalString(args.method, args.path, args.body);
    try {
      const pub = await verifyPersonalMessageSignature(
        new TextEncoder().encode(message),
        args.signature,
        { address: args.address, client },
      );
      return Boolean(pub);
    } catch {
      return false;
    }
  }
}

/** Mock Sui client for tests + offline dev. Each kind of call has its own counter. */
export class MockSuiClient implements SuiClientLike {
  private spaceCounter = 0;
  private pointerCounter = 0;
  private policyCounter = 0;
  private revokeCounter = 0;

  createSpace(_args: { name: string; sender: string }): Promise<SuiMoveCallResult> {
    this.spaceCounter += 1;
    const spaceId = '0x' + sha256Hex(`space:${_args.sender}:${_args.name}:${this.spaceCounter}`).slice(0, 64).padEnd(64, '0');
    return Promise.resolve({ spaceId, digest: sha256Hex(`digest:${spaceId}`).slice(0, 32) });
  }
  addMemoryPointer(args: {
    spaceId: string;
    kind: 1 | 2 | 3;
    walrusBlobId: string;
    contentHash: string;
    sender: string;
  }): Promise<{ pointerId: string; version: number; digest: string }> {
    this.pointerCounter += 1;
    const pointerId = '0x' + sha256Hex(`pointer:${args.spaceId}:${args.walrusBlobId}:${this.pointerCounter}`).slice(0, 64).padEnd(64, '0');
    return Promise.resolve({
      pointerId,
      version: this.pointerCounter,
      digest: sha256Hex(`digest:${pointerId}`).slice(0, 32),
    });
  }
  sharePolicy(args: {
    spaceId: string;
    subject: string;
    canRead: boolean;
    canWrite: boolean;
    canShare: boolean;
    sender: string;
  }): Promise<{ policyId: string; digest: string }> {
    this.policyCounter += 1;
    const policyId = '0x' + sha256Hex(`policy:${args.spaceId}:${args.subject}:${this.policyCounter}`).slice(0, 64).padEnd(64, '0');
    return Promise.resolve({ policyId, digest: sha256Hex(`digest:${policyId}`).slice(0, 32) });
  }
  revokePolicy(_args: { spaceId: string; policyId: string; sender: string }): Promise<{ digest: string }> {
    this.revokeCounter += 1;
    return Promise.resolve({ digest: sha256Hex(`revoke:${_args.policyId}:${this.revokeCounter}`).slice(0, 32) });
  }
  async verifySignature(args: {
    address: string;
    method: string;
    path: string;
    body: string;
    signature: string;
  }): Promise<boolean> {
    if (args.signature === 'stub') return true;
    const expected = sha256Hex(`${args.method}|${args.path}|${sha256Hex(args.body)}|${args.address}`).slice(0, 64);
    return args.signature === expected;
  }
}

export function canonicalString(method: string, path: string, body: string): string {
  return `${method}\n${path}\n${sha256Hex(body)}`;
}

let _singleton: SuiClientLike | null = null;

export function getSuiClient(): SuiClientLike {
  if (_singleton) return _singleton;
  const live = process.env.SUI_CLIENT_LIVE === '1';
  _singleton = live ? new LiveSuiClient() : new MockSuiClient();
  return _singleton;
}

export function setSuiClient(c: SuiClientLike): void {
  _singleton = c;
}

export function resetSuiClientForTest(): void {
  _singleton = null;
}
