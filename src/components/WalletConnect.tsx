'use client';

import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';

export function WalletConnect() {
  const account = useCurrentAccount();
  if (account) {
    return (
      <span style={{ fontFamily: 'monospace', fontSize: 13 }}>
        {account.address.slice(0, 8)}…{account.address.slice(-6)}
      </span>
    );
  }
  return <ConnectButton connectText="Connect Wallet" />;
}
