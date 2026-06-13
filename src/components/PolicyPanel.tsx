'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { useSignedFetch } from '@/lib/dapp-kit/useSignedFetch';
import { useEffect, useState } from 'react';
import type { AccessPolicy } from '@/lib/types';

export function PolicyPanel({ spaceId, initial }: { spaceId: string; initial?: AccessPolicy[] | null }) {
  const account = useCurrentAccount();
  const signedFetch = useSignedFetch();
  const [policies, setPolicies] = useState<AccessPolicy[] | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [canRead, setCanRead] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => { /* nothing to refetch — the share/revoke handlers below update state directly */ }, [account, spaceId]);

  if (!account && !policies) return null;
  if (error) return <p style={{ color: '#f88' }}>{error}</p>;

  return (
    <div>
      <h2>Access Policies</h2>
      {account && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!subject.trim() || !account) return;
            const body = JSON.stringify({ subject, canRead, canWrite, canShare });
            const path = `/v1/spaces/${spaceId}/share`;
            try {
              const r = await signedFetch(path, { method: 'POST', body });
              if (!r.ok) { setError(`status ${r.status}`); return; }
              const rec = await r.json();
              setPolicies((prev) => [...(prev ?? []), rec]);
              setSubject('');
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
          style={{ marginBottom: 16 }}
        >
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="0x… subject (Sui address)"
            style={{ width: 480, marginRight: 8, background: '#1a1a24', color: '#eee', border: '1px solid #23232c', borderRadius: 6, padding: 6 }}
          />
          <label style={{ marginRight: 8 }}><input type="checkbox" checked={canRead} onChange={(e) => setCanRead(e.target.checked)} /> read</label>
          <label style={{ marginRight: 8 }}><input type="checkbox" checked={canWrite} onChange={(e) => setCanWrite(e.target.checked)} /> write</label>
          <label style={{ marginRight: 8 }}><input type="checkbox" checked={canShare} onChange={(e) => setCanShare(e.target.checked)} /> share</label>
          <button type="submit">Share</button>
        </form>
      )}
      {policies && policies.length > 0 && (
        <table>
          <thead><tr><th>Subject</th><th>R</th><th>W</th><th>S</th><th>Revoked</th><th>Policy</th></tr></thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id}>
                <td><code>{p.subject.slice(0, 10)}…{p.subject.slice(-6)}</code></td>
                <td>{p.canRead ? '✓' : ''}</td>
                <td>{p.canWrite ? '✓' : ''}</td>
                <td>{p.canShare ? '✓' : ''}</td>
                <td>{p.revoked ? 'yes' : 'no'}</td>
                <td><code>{p.id.slice(0, 12)}…</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}