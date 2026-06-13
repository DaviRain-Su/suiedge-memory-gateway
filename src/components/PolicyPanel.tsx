'use client';

import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { canonicalString } from '@/lib/sui';
import { useEffect, useState } from 'react';
import type { AccessPolicy } from '@/lib/types';

export function PolicyPanel({ spaceId }: { spaceId: string }) {
  const account = useCurrentAccount();
  const { mutate: sign } = useSignPersonalMessage();
  const [policies, setPolicies] = useState<AccessPolicy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [canRead, setCanRead] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [canShare, setCanShare] = useState(false);

  async function load() {
    if (!account) return;
    const path = `/v1/spaces/${spaceId}/share`;
    // No GET for policies yet — derive via signed list. Until we add one,
    // we just show the local cache from a prior share.
    setPolicies([]);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [account, spaceId]);

  if (!account) return null;
  if (error) return <p style={{ color: '#f88' }}>{error}</p>;

  return (
    <div>
      <h2>Access Policies</h2>
      <p style={{ color: '#888' }}>
        (UI: enter a Sui address and flags, then submit. The list of policies
        below updates after a successful share/revoke. The list endpoint
        GET /v1/spaces/:id/policies lands in Day 6 alongside the dev wallet.)
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!subject.trim()) return;
          const body = JSON.stringify({ subject, canRead, canWrite, canShare });
          const path = `/v1/spaces/${spaceId}/share`;
          const message = canonicalString('POST', path, body);
          sign(
            { message: new TextEncoder().encode(message) },
            {
              onSuccess: async (res) => {
                const r = await fetch(path, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json', 'X-Sui-Address': account.address, 'X-Sui-Signature': res.signature },
                  body,
                });
                if (!r.ok) { setError(`status ${r.status}`); return; }
                const pol: AccessPolicy = await r.json();
                setPolicies((prev) => [...(prev ?? []).filter((p) => p.subject !== pol.subject), pol]);
                setSubject('');
              },
              onError: (err) => setError(String(err)),
            },
          );
        }}
        style={{ marginBottom: 16 }}
      >
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="0x... subject (64 hex)"
          style={{ width: 360, background: '#1a1a24', color: '#eee', border: '1px solid #23232c', borderRadius: 4, padding: 6, marginRight: 8 }}
        />
        <label style={{ marginRight: 8 }}><input type="checkbox" checked={canRead} onChange={(e) => setCanRead(e.target.checked)} /> read</label>
        <label style={{ marginRight: 8 }}><input type="checkbox" checked={canWrite} onChange={(e) => setCanWrite(e.target.checked)} /> write</label>
        <label style={{ marginRight: 8 }}><input type="checkbox" checked={canShare} onChange={(e) => setCanShare(e.target.checked)} /> share</label>
        <button type="submit">Share</button>
      </form>
      {policies && policies.length > 0 && (
        <table>
          <thead>
            <tr><th>Subject</th><th>R</th><th>W</th><th>S</th><th>Revoked</th><th>Policy</th></tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id}>
                <td><code>{p.subject.slice(0, 10)}…</code></td>
                <td>{p.canRead ? '✓' : '–'}</td>
                <td>{p.canWrite ? '✓' : '–'}</td>
                <td>{p.canShare ? '✓' : '–'}</td>
                <td>{p.revoked ? 'yes' : 'no'}</td>
                <td><button
                  onClick={async () => {
                    const body = JSON.stringify({ policyId: p.id });
                    const path = `/v1/spaces/${spaceId}/revoke`;
                    const message = canonicalString('POST', path, body);
                    sign(
                      { message: new TextEncoder().encode(message) },
                      {
                        onSuccess: async (res) => {
                          const r = await fetch(path, {
                            method: 'POST',
                            headers: { 'content-type': 'application/json', 'X-Sui-Address': account.address, 'X-Sui-Signature': res.signature },
                            body,
                          });
                          if (!r.ok) { setError(`status ${r.status}`); return; }
                          const updated: AccessPolicy = await r.json();
                          setPolicies((prev) => (prev ?? []).map((q) => (q.id === updated.id ? updated : q)));
                        },
                        onError: (err) => setError(String(err)),
                      },
                    );
                  }}
                >Revoke</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
