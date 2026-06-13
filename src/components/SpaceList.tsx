'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { useEffect, useState } from 'react';
import type { AgentSpace } from '@/lib/types';
import { useSignedFetch } from '@/lib/dapp-kit/useSignedFetch';
import { SpaceCard } from './SpaceCard';

interface SpaceListProps {
  /**
   * Optional server-side pre-fetched list. When provided we render
   * immediately (useful for screenshots, demos, and the
   * `?owner=0x…` server-render path on the home page).
   */
  initial?: AgentSpace[] | null;
  ownerQuery?: string;
}

export function SpaceList({ initial = null, ownerQuery }: SpaceListProps) {
  const account = useCurrentAccount();
  const signedFetch = useSignedFetch();
  const [spaces, setSpaces] = useState<AgentSpace[] | null>(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) {
      if (initial !== null) return;
      setSpaces(null);
      return;
    }
    const path = `/v1/spaces?owner=${account.address}`;
    signedFetch(path)
      .then(async (r) => {
        if (!r.ok) {
          setError(`status ${r.status}`);
          return;
        }
        setSpaces(await r.json());
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [account, signedFetch, initial]);

  if (!account && initial === null) {
    return (
      <p>
        Connect a wallet to see your spaces
        {ownerQuery ? '' : ', or pass ?owner=0x… to view without one.'}.
      </p>
    );
  }
  if (error) return <p style={{ color: '#f88' }}>error: {error}</p>;
  if (spaces === null) return <p>loading…</p>;
  if (spaces.length === 0)
    return <p>No spaces yet. Create one with the dashboard or REST API.</p>;
  return (
    <div>
      {spaces.map((s) => (
        <SpaceCard key={s.id} space={s} />
      ))}
    </div>
  );
}
