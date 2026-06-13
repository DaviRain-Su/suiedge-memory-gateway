/**
 * Seed script: when running offline (no SUI_CLIENT_LIVE), this
 * pre-populates the SQLite index with a demo space + 1 memory +
 * 1 artifact + 1 proof log so the dashboard renders on first
 * visit. Skipped silently when live mode is on.
 */
import { resetConfigForTest, config } from '../src/lib/config';
import { openStore } from '../src/lib/store';

if (config().suiPackageId && process.env.SUI_CLIENT_LIVE === '1') {
  console.log('[seed] live mode — skipping seed');
  process.exit(0);
}

const db = openStore();
const now = Math.floor(Date.now() / 1000);
const owner = '0xb908f724ae9fd9f3859df7b42d1192649217bc4a677c99b58ec838db2ff6ec41';
const spaceId = '0x1f16992ca8d52fae0ef8e4cdf4f0722caf8b7a676a254f3c07a454cfb65afe7c';

const ins = db.prepare(
  `INSERT OR REPLACE INTO spaces (space_id, owner, name, latest_version, created_at)
   VALUES (?, ?, ?, ?, ?)`,
);
ins.run(spaceId, owner, 'suiedge-demo', 0, now);

const insBlob = db.prepare(
  `INSERT OR REPLACE INTO blobs
     (space_id, blob_id, kind, version, content_hash, mime_type, name, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);
insBlob.run(
  spaceId, 'u_pRa6Ur-kUbguw6nJMmncIy47e8BpKC-gi51MinjhE', 1, 0,
  '266dd584ed27825667c4c2d9e4f5df1459485f112dfa6b591cd29d814f5d916b',
  null, null, now,
);
insBlob.run(
  spaceId, 'EqMqyq71yHY3_UMLp7P2-nEs_RUR4449gVRBWe0P0eE', 2, 0,
  'be7ad4d7c37f6e724b17668ab65d530eabda8750d0dd23109472492a8312510a',
  'text/markdown', 'hackathon-plan.md', now,
);
insBlob.run(
  spaceId, '_JfXHrEImVmPFxjTb8DbIgZ-ZHCPBo11jZSgAPu-ces', 3, 0,
  '0000000000000000000000000000000000000000000000000000000000000000',
  null, null, now,
);

console.log('[seed] offline demo data inserted');
