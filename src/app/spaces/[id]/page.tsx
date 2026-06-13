import { MemoryTimeline } from '@/components/MemoryTimeline';
import { PolicyPanel } from '@/components/PolicyPanel';
import { ArtifactList } from '@/components/ArtifactList';
import { ProofLogList } from '@/components/ProofLogList';
import { getSpace } from '@/lib/service/spaces';
import { loadContext } from '@/lib/service/context';
import { listArtifacts } from '@/lib/service/artifacts';
import { listProofLogs } from '@/lib/service/proofLogs';
import { listPolicies } from '@/lib/service/policy';

export const dynamic = 'force-dynamic';

export default async function SpaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ owner?: string }>;
}) {
  const { id } = await params;
  const { owner } = await searchParams;
  const space = getSpace(id);
  if (!space) {
    return <p>Space <code>{id}</code> not found.</p>;
  }

  // Demo affordance: when the visitor supplies ?owner=0x... we render
  // the data server-side using the SQLite index (no wallet required).
  const caller = owner ?? space.owner;
  const [bundle, artifacts, proofs, policies] = await Promise.all([
    loadContext({ spaceId: id, caller, maxItems: 50 }).catch(() => ({ spaceId: id, items: [] })),
    Promise.resolve(listArtifacts({ spaceId: id, caller })),
    Promise.resolve(listProofLogs({ spaceId: id, caller })),
    Promise.resolve(listPolicies({ spaceId: id })),
  ]);

  return (
    <div>
      <h1>{space.name}</h1>
      <p style={{ color: '#888' }}>
        owner <code>{space.owner.slice(0, 10)}…{space.owner.slice(-6)}</code> · version {space.version}
        {owner ? ' · demo SSR (no wallet)' : ''}
      </p>
      <MemoryTimeline spaceId={space.id} initial={bundle} />
      <ArtifactList spaceId={space.id} initial={artifacts} />
      <ProofLogList spaceId={space.id} initial={proofs} />
      <PolicyPanel spaceId={space.id} initial={policies} />
    </div>
  );
}
