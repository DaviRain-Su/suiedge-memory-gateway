import { MemoryTimeline } from '@/components/MemoryTimeline';
import { PolicyPanel } from '@/components/PolicyPanel';
import { ArtifactList } from '@/components/ArtifactList';
import { ProofLogList } from '@/components/ProofLogList';
import { getSpace } from '@/lib/service/spaces';

export default async function SpaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const space = getSpace(id);
  if (!space) {
    return <p>Space <code>{id}</code> not found.</p>;
  }
  return (
    <div>
      <h1>{space.name}</h1>
      <p style={{ color: '#888' }}>
        owner <code>{space.owner.slice(0, 10)}…{space.owner.slice(-6)}</code> · version {space.version}
      </p>
      <MemoryTimeline spaceId={space.id} />
      <ArtifactList spaceId={space.id} />
      <ProofLogList spaceId={space.id} />
      <PolicyPanel spaceId={space.id} />
    </div>
  );
}
