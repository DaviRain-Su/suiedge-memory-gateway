// Capture clean dashboard screenshots into docs/screenshots/.
// Reads the demo owner from the live SQLite index, then takes shots
// of:
//   01-home.png          — home with the SSR ?owner= view
//   02-space-detail.png  — space detail with all 4 panels
//   03-policy-form.png   — space detail with the "Share" form in
//                          focus (visible without a wallet)
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import Database from 'better-sqlite3';

const OWNER = '0xb908f724ae9fd9f3859df7b42d1192649217bc4a677c99b58ec838db2ff6ec41';
const OUT = 'docs/screenshots';
const BASE = 'http://localhost:3000';

async function main() {
  await mkdir(OUT, { recursive: true });
  const db = new Database('data/dev.db');
  const space = db.prepare('SELECT space_id FROM spaces ORDER BY created_at DESC LIMIT 1').get();
  if (!space) throw new Error('no spaces in dev.db — run scripts/demo.sh first');
  const SPACE_ID = space.space_id;
  console.log(`space_id=${SPACE_ID}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // 1) Home with SSR data
  await page.goto(`${BASE}/?owner=${OWNER}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/01-home.png`, fullPage: true });
  console.log(`saved ${OUT}/01-home.png`);

  // 2) Space detail
  await page.goto(`${BASE}/spaces/${SPACE_ID}?owner=${OWNER}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/02-space-detail.png`, fullPage: true });
  console.log(`saved ${OUT}/02-space-detail.png`);

  // 3) Space detail viewport-only
  await page.screenshot({ path: `${OUT}/03-space-detail-viewport.png` });
  console.log(`saved ${OUT}/03-space-detail-viewport.png`);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
