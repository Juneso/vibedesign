const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  await page.goto('http://localhost:8045/index.html?v=30', { waitUntil: 'load' });
  
  // click navigation "ai 등장"
  const navItem = await page.$('.lab-nav-item[data-page="ai-entrance"]');
  if (navItem) {
    await navItem.click();
    console.log("Clicked ai-entrance nav");
  } else {
    console.log("ai-entrance nav not found");
  }
  
  await page.waitForTimeout(500);
  
  // Click first key
  const keys = await page.$$('.lab-page.active .dialer-keypad-area .key');
  if (keys.length > 0) {
    await keys[0].click();
    console.log("Clicked first key");
  } else {
    console.log("No keys found on active page");
  }
  
  await page.waitForTimeout(500);
  
  const display = await page.$eval('.lab-page.active .dialer-number h1', el => el.textContent);
  console.log("Display is now:", display);
  
  await browser.close();
})();
