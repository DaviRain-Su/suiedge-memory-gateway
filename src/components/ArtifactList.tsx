'use client';

import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { canonicalString } from '@/lib/sui';
import { useEffect, useState } from 'react';
import type { ArtifactRecord } from '@/lib/types';

export function ArtifactList({ spaceId }: { spaceId: string }) {
  const account = useCurrentAccount();
  const { mutate: sign } = useSignPersonalMessage();
  const [items, setItems] = useState<ArtifactRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!account) return;
    const path = `/v1/spaces/${spaceId}/artifacts`;
    const message = canonicalString('GET', path, '');
    sign(
      { message: new TextEncoder().encode(message) },
      {
        onSuccess: async (res) => {
          const r = await fetch(path, {
            headers: { 'X-Sui-Address': account.address, 'X-Sui-Signature': res.signature },
          });
          if (!r.ok) { setError(`status ${r.status}`); return; }
          setItems(await r.json());
        },
        onError: (e) => setError(String(e)),
      },
    );
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [account, spaceId]);

  if (!account) return null;
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
