'use client';

import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { canonicalString } from '@/lib/sui';
import { useEffect, useState } from 'react';
import type { AgentSpace } from '@/lib/types';
import { SpaceCard } from './SpaceCard';

export function SpaceList() {
  const account = useCurrentAccount();
  const { mutate: sign } = useSignPersonalMessage();
  const [spaces, setSpaces] = useState<AgentSpace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) {
      setSpaces(null);
      return;
    }
    const path = `/v1/spaces?owner=${account.address}`;
    const message = canonicalString('GET', path, '');
    sign(
      { message: new TextEncoder().encode(message) },
      {
        onSuccess: async (res) => {
          const r = await fetch(path, {
            headers: {
              'X-Sui-Address': account.address,
              'X-Sui-Signature': res.signature,
            },
          });
          if (!r.ok) {
            setError(`status ${r.status}`);
            return;
          }
          setSpaces(await r.json());
        },
        onError: (e) => setError(String(e)),
      },
    );
  }, [account, sign]);

  if (!account) return <p>Connect a wallet to see your spaces.</p>;
  if (error) return <p style={{ color: '#f88' }}>error: {error}</p>;
  if (spaces === null) return <p>loading…</p>;
  if (spaces.length === 0) return <p>No spaces yet. Create one with the dashboard or REST API.</p>;
  return (
    <div>
      {spaces.map((s) => <SpaceCard key={s.id} space={s} />)}
    </div>
  );
}
