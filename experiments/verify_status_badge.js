const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve('experiments/phase8_screenshots');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyBadge(expectedProfile, shotName) {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1400, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  try {
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
    await sleep(1500);

    const badgeText = await page.evaluate(() => {
      const el = document.querySelector('.badge');
      return el ? el.textContent.trim() : null;
    });

    console.log(`[StatusBadge] Expected Profile: ${expectedProfile} | Found: "${badgeText}"`);
    const shotPath = path.join(SCREENSHOT_DIR, shotName);
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`Saved screenshot: ${shotPath}`);

    return { badgeText, errors };
  } finally {
    await browser.close();
  }
}

const target = process.argv[2] || 'Production';
const shot = process.argv[3] || '11_badge_production.png';

verifyBadge(target, shot).then(res => {
  console.log('Result:', JSON.stringify(res));
  if (res.errors.length > 0) {
    console.error('Console errors detected:', res.errors);
    process.exit(1);
  }
}).catch(err => {
  console.error(err);
  process.exit(1);
});

