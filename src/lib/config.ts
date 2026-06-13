/**
 * App-wide configuration. Reads from process.env at module load time.
 * All defaults are safe-for-dev (in-memory store, no Sui network).
 */
export interface AppConfig {
  suiNetwork: 'testnet' | 'mainnet' | 'devnet' | 'localnet';
  suiPackageId: string | null;
  /** Bech32-encoded Sui private key (suiprivkey1...). Server-side signer. */
  suiPrivateKey: string | null;
  /** Gas budget per PTB in MIST (1 SUI = 1e9 MIST). */
  suiGasBudget: number;
  walrusPublisherUrl: string;
  walrusAggregatorUrl: string;
  /** Number of epochs to store Walrus blobs for. */
  walrusEpochs: number;
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
    suiPrivateKey: process.env.SUI_PRIVATE_KEY ?? null,
    suiGasBudget: Number(process.env.SUI_GAS_BUDGET ?? '50_000_000'),
    walrusPublisherUrl:
      process.env.WALRUS_PUBLISHER_URL ?? 'https://publisher.walrus-testnet.walrus.space',
    walrusAggregatorUrl:
      process.env.WALRUS_AGGREGATOR_URL ?? 'https://aggregator.walrus-testnet.walrus.space',
    walrusEpochs: Number(process.env.WALRUS_EPOCHS ?? '1'),
    dbPath,
    port: Number(process.env.PORT ?? 3000),
  };
  return cached;
}

export function resetConfigForTest(): void {
  cached = null;
}
