/**
 * SuiEdge client SDK — pure HTTP client.
 * No AI framework dependency. Use this for any HTTP-only consumer
 * (curl scripts, serverless functions, custom agents).
 *
 * Auth: pass a Sui wallet signer that knows how to sign the canonical
 * challenge string `${method}\n${path}\n${sha256Hex(body)}`. The
 * gateway will verify with `verifyPersonalMessageSignature`.
 */
import type {
  AgentSpace,
  MemoryKind,
  MemoryRecord,
  MemoryWithBody,
  ArtifactRecord,
  ProofLogRecord,
  AccessPolicy,
  ContextLoadResult,
} from './types';

export interface Signer {
  address: string;
  /** Return the base64 signature over the canonical string. */
  sign: (challenge: string) => Promise<string>;
}

export interface ClientOptions {
  baseUrl: string;
  signer: Signer;
  fetchImpl?: typeof fetch;
}

export class SuiEdgeClient {
  private readonly baseUrl: string;
  private readonly signer: Signer;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ClientOptions) {
    if (!opts.baseUrl) throw new Error('baseUrl is required');
    if (!opts.signer) throw new Error('signer is required');
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.signer = opts.signer;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  // ---- spaces
  async createSpace(name: string): Promise<AgentSpace> {
    return this.call<AgentSpace>('POST', '/v1/spaces', { name });
  }
  async listSpaces(owner?: string): Promise<AgentSpace[]> {
    const qs = owner ? `?owner=${encodeURIComponent(owner)}` : '';
    return this.call<AgentSpace[]>('GET', `/v1/spaces${qs}`);
  }
  async getSpace(spaceId: string): Promise<AgentSpace> {
    return this.call<AgentSpace>('GET', `/v1/spaces/${spaceId}`);
  }

  // ---- memories
  async writeMemory(spaceId: string, kind: MemoryKind, payload: string): Promise<MemoryRecord> {
    return this.call<MemoryRecord>('POST', `/v1/spaces/${spaceId}/memories`, { kind, payload });
  }
  async searchMemories(spaceId: string, query: string, limit = 20): Promise<MemoryWithBody[]> {
    const qs = new URLSearchParams({ query, limit: String(limit) });
    return this.call<MemoryWithBody[]>('GET', `/v1/spaces/${spaceId}/memories?${qs}`);
  }
  async loadContext(spaceId: string, maxItems = 50): Promise<ContextLoadResult> {
    return this.call<ContextLoadResult>('GET', `/v1/spaces/${spaceId}/context?maxItems=${maxItems}`);
  }

  // ---- artifacts
  async writeArtifact(spaceId: string, name: string, mimeType: string, bytes: Uint8Array): Promise<ArtifactRecord> {
    const payload = Buffer.from(bytes).toString('base64');
    return this.call<ArtifactRecord>('POST', `/v1/spaces/${spaceId}/artifacts`, { name, mimeType, payload });
  }
  async listArtifacts(spaceId: string): Promise<ArtifactRecord[]> {
    return this.call<ArtifactRecord[]>('GET', `/v1/spaces/${spaceId}/artifacts`);
  }

  // ---- proof logs
  async writeProofLog(spaceId: string, runId: string, agentId: string, input: string, output: string): Promise<ProofLogRecord> {
    return this.call<ProofLogRecord>('POST', `/v1/spaces/${spaceId}/proof-logs`, { runId, agentId, input, output });
  }
  async listProofLogs(spaceId: string): Promise<ProofLogRecord[]> {
    return this.call<ProofLogRecord[]>('GET', `/v1/spaces/${spaceId}/proof-logs`);
  }

  // ---- policy
  async sharePolicy(spaceId: string, subject: string, canRead: boolean, canWrite: boolean, canShare: boolean): Promise<AccessPolicy> {
    return this.call<AccessPolicy>('POST', `/v1/spaces/${spaceId}/share`, { subject, canRead, canWrite, canShare });
  }
  async revokePolicy(spaceId: string, policyId: string): Promise<{ ok: true; policyId: string }> {
    return this.call<{ ok: true; policyId: string }>('POST', `/v1/spaces/${spaceId}/revoke`, { policyId });
  }
  async listPolicies(spaceId: string): Promise<AccessPolicy[]> {
    return this.call<AccessPolicy[]>('GET', `/v1/spaces/${spaceId}/policies`);
  }

  // ---- low-level signed call
  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const bodyStr = body === undefined ? '' : JSON.stringify(body);
    const bodyBytes = new TextEncoder().encode(bodyStr);
    const hash = await sha256Hex(bodyBytes);
    const challenge = `${method}\n${path}\n${hash}`;
    const signature = await this.signer.sign(challenge);
    const url = `${this.baseUrl}${path}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-sui-address': this.signer.address,
        'x-sui-signature': signature,
      },
      body: bodyStr || undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      const message = (parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error: unknown }).error === 'string')
        ? (parsed as { error: string }).error
        : `HTTP ${res.status}`;
      throw new SuiEdgeError(message, res.status, parsed);
    }
    return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
  }
}

export class SuiEdgeError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'SuiEdgeError';
    this.status = status;
    this.body = body;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis.crypto as { subtle?: SubtleCrypto }).subtle;
  if (subtle?.digest) {
    const hashBuf = await subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node fallback
  const nodeCrypto = await import('node:crypto');
  return nodeCrypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}
