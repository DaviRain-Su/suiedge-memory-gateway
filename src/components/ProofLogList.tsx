'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { useSignedFetch } from '@/lib/dapp-kit/useSignedFetch';
import { useEffect, useState } from 'react';
import type { ProofLog } from '@/lib/types';

export function ProofLogList({ spaceId, initial }: { spaceId: string; initial?: ProofLog[] | null }) {
  const account = useCurrentAccount();
  const signedFetch = useSignedFetch();
  const [items, setItems] = useState<ProofLog[] | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!account) return;
    const path = `/v1/spaces/${spaceId}/proof-logs`;
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
  if (items.length === 0) return <p>No proof logs.</p>;

  return (
    <div>
      <h2>Proof Logs</h2>
      <table>
        <thead><tr><th>Run</th><th>Agent</th><th>Input Hash</th><th>Output Hash</th><th>Created</th></tr></thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td><code>{p.runId}</code></td>
              <td><code>{p.agentId}</code></td>
              <td><code>{p.inputHash.slice(0, 8)}</code></td>
              <td><code>{p.outputHash.slice(0, 8)}</code></td>
              <td>{p.createdAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}