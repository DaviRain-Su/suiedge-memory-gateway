/**
 * App-wide configuration. Reads from process.env at module load time.
 * All defaults are safe-for-dev (in-memory store, no Sui network).
 */
export interface AppConfig {
  suiNetwork: 'testnet' | 'mainnet' | 'devnet' | 'localnet';
  suiPackageId: string | null;
  walrusPublisherUrl: string;
  walrusAggregatorUrl: string;
  dbPath: string;
  port: number;
}

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (cached) return cached;
  const dbPath = process.env.DB_PATH ?? ':memory:';
  cached = {
    suiNetwork: (process.env.NEXT_PUBLIC_SUI_NETWORK as AppConfig['suiNetwork']) ?? 'testnet',
    suiPackageId: process.env.SUI_PACKAGE_ID ?? null,
    walrusPublisherUrl:
      process.env.WALRUS_PUBLISHER_URL ?? 'https://publisher.walrus-testnet.walrus.space',
    walrusAggregatorUrl:
      process.env.WALRUS_AGGREGATOR_URL ?? 'https://aggregator.walrus-testnet.walrus.space',
    dbPath,
    port: Number(process.env.PORT ?? 3000),
  };
  return cached;
}

export function resetConfigForTest(): void {
  cached = null;
}
