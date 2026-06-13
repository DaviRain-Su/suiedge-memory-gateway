'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { useSignedFetch } from '@/lib/dapp-kit/useSignedFetch';
import { useEffect, useState } from 'react';
import type { ArtifactRecord } from '@/lib/types';

export function ArtifactList({ spaceId, initial }: { spaceId: string; initial?: ArtifactRecord[] | null }) {
  const account = useCurrentAccount();
  const signedFetch = useSignedFetch();
  const [items, setItems] = useState<ArtifactRecord[] | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!account) return;
    const path = `/v1/spaces/${spaceId}/artifacts`;
    try {
      const r = await signedFetch(path);
      if (!r.ok) { setError(`status ${r.status}`); return; }
      setItems(await r.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void load(); }, [account, spaceId, signedFetch]);

  if (!account && !items) return null;
  if (error) return <p style={{ color: '#f88' }}>{error}</p>;
  if (!items) return <p>loading…</p>;
  if (items.length === 0) return <p>No artifacts.</p>;

  return (
    <div>
      <h2>Artifacts</h2>
      <table>
        <thead><tr><th>Name</th><th>Mime</th><th>v</th><th>Hash</th><th>Blob</th></tr></thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td><code>{a.mimeType}</code></td>
              <td>{a.version}</td>
              <td><code>{a.contentHash.slice(0, 8)}</code></td>
              <td><code>{a.walrusBlobId.slice(0, 12)}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}