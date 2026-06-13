'use client';

import Link from 'next/link';
import type { AgentSpace } from '@/lib/types';

export function SpaceCard({ space }: { space: AgentSpace }) {
  return (
    <Link href={`/spaces/${space.id}`} className="space-card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>{space.name}</strong>
        <span className="kind">v{space.version}</span>
      </div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
        <code>{space.id.slice(0, 10)}…{space.id.slice(-6)}</code>
      </div>
    </Link>
  );
}
