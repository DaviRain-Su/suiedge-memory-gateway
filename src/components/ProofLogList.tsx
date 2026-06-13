'use client';

import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { canonicalString } from '@/lib/sui';
import { useEffect, useState } from 'react';
import type { ProofLog } from '@/lib/types';

export function ProofLogList({ spaceId }: { spaceId: string }) {
  const account = useCurrentAccount();
  const { mutate: sign } = useSignPersonalMessage();
  const [items, setItems] = useState<ProofLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!account) return;
    const path = `/v1/spaces/${spaceId}/proof-logs`;
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
