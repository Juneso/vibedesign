import { chromium } from 'playwright';

const URL = 'http://localhost:5175/src/experiments/active/2026-04-30_agent-call-interaction/';
const OUTDIR = '/tmp/ac_shots';

import { mkdirSync } from 'fs';
mkdirSync(OUTDIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: 'networkidle' });
// Wait for initial animations to settle
await page.waitForTimeout(2000);

// Find the device frame (the iPhone-shaped box)
const deviceFrame = await page.locator('.device-frame').first();

// Helper to capture the device frame area
async function shot(name) {
  await page.waitForTimeout(1500); // let animations settle
  await deviceFrame.screenshot({ path: `${OUTDIR}/${name}.jpg`, type: 'jpeg', quality: 75 });
  console.log(`captured ${name}`);
}

// State 1: BEFORE — hide all AI containers
await page.evaluate(() => {
  ['containerGreet','containerCta','containerDefault','containerArs','containerKeypad'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('ac-hidden');
  });
  // also hide AI gradient card
  const card = document.getElementById('aiGradientCard');
  if (card) card.classList.remove('visible');
});
await shot('1_before');

// State 2: greet
await page.evaluate(() => window.setContainerMode('greet'));
await shot('2_greet');

// State 3: cta
await page.evaluate(() => window.setContainerMode('cta'));
await shot('3_cta');

await browser.close();
console.log('done');
