import { SpaceList } from '@/components/SpaceList';

export default function HomePage() {
  return (
    <div>
      <h1>Agent Spaces</h1>
      <p style={{ color: '#aaa' }}>Walrus-backed memory vaults for Sui agents.</p>
      <SpaceList />
    </div>
  );
}
