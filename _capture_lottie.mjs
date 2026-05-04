import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/ac_shots', { recursive: true });

const URL = 'http://localhost:5175/src/experiments/active/2026-04-30_agent-call-interaction/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });

// Switch to greet to make lottie visible
await page.evaluate(() => window.setContainerMode('greet'));
await page.waitForTimeout(800); // mid-animation

// Find lottie icon element (within greet container)
const lottieEl = await page.locator('#containerGreet .ac-lottie-icon').first();
await lottieEl.screenshot({ path: '/tmp/ac_shots/lottie.png', omitBackground: true });
console.log('lottie captured');

// EQ dots
const eqEl = await page.locator('#eqDots').first();
await eqEl.screenshot({ path: '/tmp/ac_shots/eq.png', omitBackground: true });
console.log('eq captured');

await browser.close();
