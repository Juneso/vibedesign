const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8045/index.html?v=30');
  const result = await page.evaluate(() => {
    const section = document.querySelector('[data-page="ai-entrance-3"]');
    if (!section) return "Section not found";
    const keys = section.querySelectorAll('.dialer-keypad-area .key');
    const display = section.querySelector('.dialer-number h1');
    return {
      keysCount: keys.length,
      displayId: display ? display.id : "No display",
      displayVisible: display ? display.offsetParent !== null : false
    };
  });
  console.log(JSON.stringify(result));
  await browser.close();
})();
