import { SpaceList } from '@/components/SpaceList';
import { listSpaces } from '@/lib/service/spaces';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  // Optional server-side pre-render: if the visitor supplies ?owner=0x...
  // we hit the SQLite index directly. Without it we fall back to the
  // client-side dapp-kit flow that asks the visitor to sign a message.
  const { owner } = await searchParams;
  const initial = owner ? listSpaces({ owner }) : null;

  return (
    <div>
      <h1>Agent Spaces</h1>
      <p style={{ color: '#aaa' }}>Walrus-backed memory vaults for Sui agents.</p>
      <SpaceList initial={initial} ownerQuery={owner} />
    </div>
  );
}
