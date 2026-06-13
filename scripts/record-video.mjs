// Record a 5-minute demo video of the dashboard end-to-end.
// Playwright records a WebM; we transcode to MP4 with the bundled ffmpeg.
//
// Usage:
//   1. start the dev server in another terminal:
//      set -a && . ./.env.testnet && set +a && pnpm dev:live
//   2. run the live demo to populate the SQLite index:
//      SUI_OWNER=0x... ./scripts/demo.sh
//   3. node scripts/record-video.mjs
//
// Output:
//   docs/demo.webm    (raw, ~5 minutes)
//   docs/demo.mp4     (final, h264, ~5 minutes)
//   docs/demo.gif     (animated GIF preview, 600px wide, 12fps)

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';

const OWNER = '0xb908f724ae9fd9f3859df7b42d1192649217bc4a677c99b58ec838db2ff6ec41';
const BASE = 'http://localhost:3000';
const OUT = 'docs';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function latestSpaceId() {
  const db = new Database('data/dev.db');
  const row = db.prepare('SELECT space_id FROM spaces ORDER BY created_at DESC LIMIT 1').get();
  if (!row) throw new Error('no spaces in dev.db — run scripts/demo.sh first');
  return row.space_id;
}

async function shot(page, path) {
  await page.screenshot({ path, fullPage: false });
  console.log('  shot:', path);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const SPACE_ID = await latestSpaceId();
  console.log('recording for space_id =', SPACE_ID);

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: `${OUT}/.video-tmp`,
      size: { width: 1280, height: 800 },
    },
  });
  const page = await ctx.newPage();

  // Slow typing style for natural-looking video
  page.setDefaultTimeout(15000);

  // === Scene 1: home, no wallet connected (0:00 - 0:20)
  console.log('scene 1: home with SSR owner view');
  await page.goto(`${BASE}/?owner=${OWNER}`, { waitUntil: 'networkidle' });
  await wait(2500);
  await shot(page, `${OUT}/.video-tmp/01-home.png`);

  // === Scene 2: dashboard scroll through (0:20 - 0:50)
  console.log('scene 2: scroll dashboard');
  await page.evaluate(() => window.scrollTo(0, 200));
  await wait(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(1500);

  // === Scene 3: space detail, all 4 panels (0:50 - 2:00)
  console.log('scene 3: space detail');
  await page.goto(`${BASE}/spaces/${SPACE_ID}?owner=${OWNER}`, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(page, `${OUT}/.video-tmp/03-space-top.png`);
  await page.evaluate(() => window.scrollTo(0, 600));
  await wait(1500);
  await shot(page, `${OUT}/.video-tmp/03-space-mid.png`);
  await page.evaluate(() => window.scrollTo(0, 1200));
  await wait(1500);
  await shot(page, `${OUT}/.video-tmp/03-space-bottom.png`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(1000);

  // === Scene 4: type a memory in the form (2:00 - 2:40)
  console.log('scene 4: write a memory in the form');
  const memoryInput = page.locator('textarea').first();
  if (await memoryInput.count()) {
    await memoryInput.scrollIntoViewIfNeeded();
    await wait(500);
    await memoryInput.click();
    const text = 'SuiEdge Memory Gateway — 7-step testnet demo. This memory is being written from the dashboard, anchored on Sui, and stored on Walrus.';
    for (const ch of text) {
      await page.keyboard.type(ch, { delay: 18 });
    }
    await wait(2500);
    await shot(page, `${OUT}/.video-tmp/04-memory-typed.png`);
  } else {
    console.log('  (no textarea found — skipping)');
  }

  // === Scene 5: a curl that returns context (2:40 - 3:30)
  console.log('scene 5: terminal-style overlay');
  // Print the next scene in a way that's visually distinct on a video
  const terminal = page.locator('pre, code, .terminal').first();
  if (await terminal.count()) {
    await terminal.scrollIntoViewIfNeeded();
    await wait(1500);
  } else {
    await page.evaluate(() => window.scrollTo(0, 400));
    await wait(1000);
  }

  // === Scene 6: open the agent readme in a popup (3:30 - 4:30)
  console.log('scene 6: docs page');
  await page.goto(`${BASE}/spaces/${SPACE_ID}?owner=${OWNER}`, { waitUntil: 'networkidle' });
  await wait(2500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(2500);

  // === Scene 7: outro, repo link (4:30 - 5:00)
  console.log('scene 7: outro');
  await page.goto(`${BASE}/?owner=${OWNER}`, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(page, `${OUT}/.video-tmp/07-outro.png`);

  // Close everything; the recording finalizes
  const videoPath = await page.video()?.path();
  await ctx.close();
  await browser.close();

  if (!videoPath || !existsSync(videoPath)) {
    throw new Error('no video file produced by Playwright');
  }
  console.log('raw video at', videoPath);

  // === Transcode to MP4 (h264) using bundled ffmpeg
  const ffmpegCandidates = [
    'node_modules/playwright-core/bin/ffmpeg-linux',
    'node_modules/playwright/.local-browsers/ffmpeg-1011/ffmpeg-linux',
    'ffmpeg',
  ];
  let ffmpeg = null;
  for (const c of ffmpegCandidates) {
    if (existsSync(c)) { ffmpeg = c; break; }
  }
  if (!ffmpeg) ffmpeg = 'ffmpeg';
  console.log('using ffmpeg at', ffmpeg);

  execFileSync(ffmpeg, [
    '-y',
    '-i', videoPath,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-movflags', '+faststart',
    `${OUT}/demo.mp4`,
  ], { stdio: 'inherit' });
  console.log('saved', `${OUT}/demo.mp4`);

  // === Generate a downscaled animated GIF preview (12fps, 600px wide, ~30s loop)
  // Two-pass: scale to 600px, then palette-optimize
  execFileSync(ffmpeg, [
    '-y',
    '-i', `${OUT}/demo.mp4`,
    '-vf', 'fps=12,scale=600:-1:flags=lanczos,palettegen',
    `${OUT}/.video-tmp/palette.png`,
  ], { stdio: 'inherit' });
  execFileSync(ffmpeg, [
    '-y',
    '-i', `${OUT}/demo.mp4`,
    '-i', `${OUT}/.video-tmp/palette.png`,
    '-lavfi', 'fps=12,scale=600:-1:flags=lanczos [x]; [x][1:v] paletteuse',
    '-loop', '0',
    `${OUT}/demo.gif`,
  ], { stdio: 'inherit' });
  console.log('saved', `${OUT}/demo.gif`);

  const mp4 = await stat(`${OUT}/demo.mp4`).then(s => s.size);
  const gif = await stat(`${OUT}/demo.gif`).then(s => s.size);
  console.log(`mp4=${(mp4/1024/1024).toFixed(2)}MB gif=${(gif/1024/1024).toFixed(2)}MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
