import type { Metadata } from 'next';
import { Providers } from './providers';
import { WalletConnect } from '@/components/WalletConnect';
import './globals.css';

export const metadata: Metadata = {
  title: 'SuiEdge Memory Gateway',
  description: 'Walrus-backed agent memory on Sui',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderBottom: '1px solid #222' }}>
            <a href="/" style={{ fontWeight: 700, color: 'inherit', textDecoration: 'none' }}>SuiEdge Memory</a>
            <WalletConnect />
          </header>
          <main style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
