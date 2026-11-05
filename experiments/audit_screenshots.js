const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve('experiments/ui_audit_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const VIEWPORTS = [
  { name: 'desktop_1440', width: 1440, height: 950 },
  { name: 'laptop_1280', width: 1280, height: 800 },
  { name: 'tablet_768', width: 768, height: 1024 },
  { name: 'mobile_390', width: 390, height: 844 },
  { name: 'mobile_360', width: 360, height: 740 }
];

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/analyze', name: 'analyze' },
  { path: '/evaluation', name: 'evaluation' },
  { path: '/model', name: 'model_info' },
  { path: '/about', name: 'about' },
  { path: '/faq', name: 'faq' }
];

async function captureAudit() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height });

      for (const p of PAGES) {
        await page.goto(`http://127.0.0.1:5173${p.path}`, { waitUntil: 'networkidle0' });
        await sleep(600);
        const filename = `${p.name}_${vp.name}.png`;
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: false });
        console.log(`Saved: ${filename}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

captureAudit().catch(err => {
  console.error(err);
  process.exit(1);
});

