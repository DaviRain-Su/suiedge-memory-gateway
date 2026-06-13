'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { useSignedFetch } from '@/lib/dapp-kit/useSignedFetch';
import { useEffect, useState } from 'react';
import type { ContextBundle } from '@/lib/types';

export function MemoryTimeline({ spaceId, initial }: { spaceId: string; initial?: ContextBundle | null }) {
  const account = useCurrentAccount();
  const signedFetch = useSignedFetch();
  const [bundle, setBundle] = useState<ContextBundle | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');

  async function load() {
    if (!account) return;
    const path = `/v1/spaces/${spaceId}/context?maxItems=50`;
    try {
      const r = await signedFetch(path);
      if (!r.ok) {
        setError(`status ${r.status}`);
        return;
      }
      setBundle(await r.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void load(); }, [account, spaceId, signedFetch]);

  if (!account && !bundle) return <p>Connect a wallet to view this space's memory.</p>;
  if (error) return <p style={{ color: '#f88' }}>error: {error}</p>;
  if (!bundle) return <p>loading…</p>;

  return (
    <div>
      <h2>Memory Timeline</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.trim() || !account) return;
          setWriting(true);
          const body = JSON.stringify({ kind: 'note', payload: draft });
          const path = `/v1/spaces/${spaceId}/memories`;
          try {
            const r = await signedFetch(path, { method: 'POST', body });
            setWriting(false);
            if (!r.ok) { setError(`status ${r.status}`); return; }
            setDraft('');
            await load();
          } catch (err: unknown) {
            setWriting(false);
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
        style={{ marginBottom: 16 }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Write a memory…"
          style={{ width: '100%', background: '#1a1a24', color: '#eee', border: '1px solid #23232c', borderRadius: 6, padding: 8 }}
        />
        <button type="submit" disabled={writing} style={{ marginTop: 8 }}>
          {writing ? 'writing…' : 'Write'}
        </button>
      </form>
      {bundle.items.length === 0 && <p>No memories yet.</p>}
      {bundle.items.map((item) => (
        <div key={item.version} className="timeline-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="kind">{item.kind}</span>
            <span style={{ fontSize: 11, color: '#888' }}>v{item.version} · {item.contentHash.slice(0, 8)}</span>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{item.content}</pre>
        </div>
      ))}
    </div>
  );
}