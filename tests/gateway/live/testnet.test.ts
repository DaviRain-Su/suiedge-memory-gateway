/**
 * Live testnet integration test for HttpWalrusPublisher + LiveSuiClient.
 *
 * Skipped by default. To run against Sui testnet + Walrus testnet:
 *
 *   SUI_CLIENT_LIVE=1 \
 *   SUI_PRIVATE_KEY=suiprivkey1... \
 *   SUI_PACKAGE_ID=0x... \
 *   SUI_GAS_BUDGET=50000000 \
 *   WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space \
 *   WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space \
 *   pnpm test -- tests/gateway/live/testnet.test.ts
 *
 * Requires the signer key to be funded with testnet SUI and the
 * package to be published with `sui client publish`.
 */
import { describe, it, expect } from 'vitest';
import { HttpWalrusPublisher, getWalrus } from '@/lib/walrus';
import { LiveSuiClient, getSuiClient } from '@/lib/sui';

const LIVE =
  process.env.SUI_CLIENT_LIVE === '1' &&
  !!process.env.SUI_PACKAGE_ID &&
  !!process.env.SUI_PRIVATE_KEY;
const describeIf = LIVE ? describe : describe.skip;

describeIf('live testnet', () => {
  it('publishes a blob to Walrus and reads it back', async () => {
    const pub = getWalrus();
    expect(pub).toBeInstanceOf(HttpWalrusPublisher);
    const data = Buffer.from(`suiedge-smoke-${Date.now()}`);
    const { blobId } = await pub.put({ key: 'smoke', data, epochs: 1 });
    // Walrus returns base64url-encoded blob ids.
    expect(blobId).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await pub.get({ blobId });
    expect(Buffer.compare(back, data)).toBe(0);
  }, 60_000);

  it('creates a real AgentSpace on Sui', async () => {
    const sui = getSuiClient();
    expect(sui).toBeInstanceOf(LiveSuiClient);
    const { spaceId, digest } = await sui.createSpace({
      name: `smoke-${Date.now().toString(36)}`,
      sender: '',
    });
    expect(spaceId).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(digest).toMatch(/^[A-Za-z0-9]{20,}$/);
  }, 60_000);
});
