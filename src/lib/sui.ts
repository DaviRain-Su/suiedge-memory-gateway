/**
 * Sui client interface. The only file in the codebase allowed to import
 * @mysten/sui internals. Service layer and routes depend on this interface,
 * not on @mysten/sui directly.
 */
import { type ClientWithCoreApi } from '@mysten/sui/client';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { config } from './config.js';
import { GatewayError } from './errors.js';
import { sha256Hex } from './hash.js';

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

/** Real Sui client. Day 6 supplies a concrete ClientWithCoreApi and a
 *  dev-wallet signer. Until then the Move-call methods throw INTERNAL; the
 *  signature-verification path is reachable if a caller passes a pre-built
 *  ClientWithCoreApi via the constructor.
 */
export class LiveSuiClient implements SuiClientLike {
  private client: ClientWithCoreApi | null;
  constructor(client?: ClientWithCoreApi) {
    this.client = client ?? null;
  }
  private network(): 'testnet' | 'mainnet' | 'devnet' {
    const n = config().suiNetwork;
    if (n === 'testnet' || n === 'mainnet' || n === 'devnet') return n;
    return 'testnet';
  }
  async createSpace(_args: { name: string; sender: string }): Promise<SuiMoveCallResult> {
    throw new GatewayError('INTERNAL', 'LiveSuiClient.createSpace requires the dev-wallet signer (Day 6)');
  }
  async addMemoryPointer(_args: {
    spaceId: string;
    kind: 1 | 2 | 3;
    walrusBlobId: string;
    contentHash: string;
    sender: string;
  }): Promise<{ pointerId: string; version: number; digest: string }> {
    throw new GatewayError('INTERNAL', 'LiveSuiClient.addMemoryPointer requires the dev-wallet signer (Day 6)');
  }
  async sharePolicy(_args: {
    spaceId: string;
    subject: string;
    canRead: boolean;
    canWrite: boolean;
    canShare: boolean;
    sender: string;
  }): Promise<{ policyId: string; digest: string }> {
    throw new GatewayError('INTERNAL', 'LiveSuiClient.sharePolicy requires the dev-wallet signer (Day 6)');
  }
  async revokePolicy(_args: { spaceId: string; policyId: string; sender: string }): Promise<{ digest: string }> {
    throw new GatewayError('INTERNAL', 'LiveSuiClient.revokePolicy requires the dev-wallet signer (Day 6)');
  }
  async verifySignature(args: {
    address: string;
    method: string;
    path: string;
    body: string;
    signature: string;
  }): Promise<boolean> {
    if (!this.client) return false;
    const message = canonicalString(args.method, args.path, args.body);
    try {
      const pub = await verifyPersonalMessageSignature(
        new TextEncoder().encode(message),
        args.signature,
        { address: args.address, client: this.client },
      );
      return Boolean(pub);
    } catch {
      return false;
    }
  }
}

/** Mock Sui client for tests + Day 2 dev. Generates deterministic object ids
 *  by hashing the inputs; never touches a real network. Each kind of call
 *  has its own counter so version numbers start at 1 for the first pointer
 *  in a fresh test (matching Move's `version = agent_space::version(space) + 1`
 *  from a freshly created space with version 0).
 */
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
  _singleton = process.env.SUI_CLIENT_LIVE === '1' ? new LiveSuiClient() : new MockSuiClient();
  return _singleton;
}

export function setSuiClient(c: SuiClientLike): void {
  _singleton = c;
}

export function resetSuiClientForTest(): void {
  _singleton = null;
}
