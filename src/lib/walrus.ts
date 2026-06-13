/**
 * Walrus publisher/aggregator HTTP client. Live implementation does PUT to
 * the publisher and GET from the aggregator. The test double writes to an
 * in-memory map so the gateway can be smoke-tested offline.
 */
import { config } from './config.js';
import { GatewayError } from './errors.js';
import { sha256Hex } from './hash.js';

export interface WalrusPublisher {
  /** PUT a blob. Returns the blob id (publisher-issued). */
  put(args: { key: string; data: Buffer; epochs?: number }): Promise<{ blobId: string }>;
  /** GET a blob by id. */
  get(args: { blobId: string }): Promise<Buffer>;
}

/** HTTP-backed Walrus client. Walrus's standard interface is:
 *  PUT  {publisher}/v1/blobs?epochs={n}  body: blob bytes  → 200 with newly-certified blob id
 *  GET  {aggregator}/v1/{blobId}           → 200 with blob bytes
 */
export class HttpWalrusPublisher implements WalrusPublisher {
  constructor(
    private publisherUrl: string = config().walrusPublisherUrl,
    private aggregatorUrl: string = config().walrusAggregatorUrl,
  ) {}
  async put({ data, epochs = 1 }: { key: string; data: Buffer; epochs?: number }): Promise<{ blobId: string }> {
    const url = `${this.publisherUrl}/v1/blobs?epochs=${epochs}`;
    const res = await fetch(url, {
      method: 'PUT',
      body: data as unknown as BodyInit,
      headers: { 'content-type': 'application/octet-stream' },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new GatewayError('WALRUS_WRITE_FAILED', `Walrus PUT ${res.status}: ${text}`);
    }
    const json = (await res.json()) as {
      newlyCreated?: { blobObject?: { blobId?: string } };
      alreadyCertified?: { blobId?: string };
    };
    const blobId = json.newlyCreated?.blobObject?.blobId ?? json.alreadyCertified?.blobId;
    if (!blobId) {
      throw new GatewayError('WALRUS_WRITE_FAILED', 'Walrus response missing blobId');
    }
    return { blobId };
  }
  async get({ blobId }: { blobId: string }): Promise<Buffer> {
    const url = `${this.aggregatorUrl}/v1/blobs/${blobId}`;
    // Walrus aggregator may take a few seconds to propagate a freshly
    // certified blob. Retry up to 3x with 1s, 2s, 4s backoff.
    for (let i = 0; i < 3; i++) {
      const res = await fetch(url);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
      }
      if (res.status === 404 && i < 2) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
        continue;
      }
      throw new GatewayError('NOT_FOUND', `Walrus GET ${blobId}: ${res.status}`);
    }
    throw new GatewayError('NOT_FOUND', `Walrus GET ${blobId} after 3 retries`);
  }
}

/** In-memory publisher for tests + Day 2 dev. Keyed by SHA-256 of the data. */
export class MemoryWalrusPublisher implements WalrusPublisher {
  private store = new Map<string, { blobId: string; data: Buffer }>();
  async put({ data }: { key: string; data: Buffer }): Promise<{ blobId: string }> {
    const blobId = sha256Hex(data);
    this.store.set(blobId, { blobId, data });
    return { blobId };
  }
  async get({ blobId }: { blobId: string }): Promise<Buffer> {
    const entry = this.store.get(blobId);
    if (!entry) {
      throw new GatewayError('NOT_FOUND', `Walrus memory store: blob ${blobId} not found`);
    }
    return entry.data;
  }
  size(): number {
    return this.store.size;
  }
}

let _singleton: WalrusPublisher | null = null;

export function getWalrus(): WalrusPublisher {
  if (_singleton) return _singleton;
  _singleton = process.env.WALRUS_PUBLISHER_URL && process.env.WALRUS_PUBLISHER_URL !== 'memory'
    ? new HttpWalrusPublisher()
    : new MemoryWalrusPublisher();
  return _singleton;
}

export function setWalrus(w: WalrusPublisher): void {
  _singleton = w;
}

export function resetWalrusForTest(): void {
  _singleton = null;
}
