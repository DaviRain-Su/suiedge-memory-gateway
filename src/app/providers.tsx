'use client';

import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

const RPC = {
  testnet: 'https://fullnode.testnet.sui.io:443',
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  devnet: 'https://fullnode.devnet.sui.io:443',
  localnet: 'http://127.0.0.1:9000',
} as const;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const network = (process.env.NEXT_PUBLIC_SUI_NETWORK as keyof typeof RPC) ?? 'testnet';
  // dapp-kit's SuiClientProvider expects a specific NetworkConfig shape with
  // either a `transport` field or a SuiJsonRpcClient. Our `RPC` const above
  // provides the URL but the type doesn't expose that. Cast to satisfy the
  // generic at the call site.
  const networks = RPC as unknown as Parameters<typeof SuiClientProvider>[0]['networks'];
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork={network}>
        <WalletProvider>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
