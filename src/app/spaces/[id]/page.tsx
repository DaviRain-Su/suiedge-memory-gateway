import { MemoryTimeline } from '@/components/MemoryTimeline';
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
    </div>
  );
}
