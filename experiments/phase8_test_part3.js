const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve('experiments/phase8_screenshots');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clickAnalyzeButton(page) {
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const text = await page.evaluate(el => el.textContent, b);
    if (text.includes('Analyze Files')) {
      await b.click();
      console.log('Clicked button:', text.trim());
      return true;
    }
  }
  return false;
}

async function runPart3() {
  console.log('=== PHASE 8 UAT: PART 3 - REVERT TO PRODUCTION ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1400, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  try {
    console.log('\n[1] Verifying Reversion to Production on /model...');
    await page.goto('http://127.0.0.1:5173/model', { waitUntil: 'networkidle0' });
    await sleep(1500);

    const modelFacts = await page.evaluate(() => {
      const dls = Array.from(document.querySelectorAll('dl.facts div'));
      return dls.map(div => {
        const dt = div.querySelector('dt')?.textContent?.trim() || '';
        const dd = div.querySelector('dd')?.textContent?.trim() || '';
        return `${dt}: ${dd}`;
      });
    });
    console.log('Reverted Model Facts on /model:');
    modelFacts.forEach(f => console.log('  ', f));

    console.log('\n[2] Verifying Reversion to Production on /analyze...');
    await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });
    await sleep(1000);

    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(path.resolve('data/AudioWAV/1001_DFA_ANG_XX.wav'));
    console.log('Uploaded 1001_DFA_ANG_XX.wav');
    await sleep(1200);

    await clickAnalyzeButton(page);
    await page.waitForSelector('.primary-emotion-hero, .hero-metric, .result-header', { timeout: 25000 });
    await sleep(2500);

    const wavMeta = await page.evaluate(() => {
      const meta = Array.from(document.querySelectorAll('dl.meta-grid div')).map(d => {
        return `${d.querySelector('dt')?.textContent?.trim()}: ${d.querySelector('dd')?.textContent?.trim()}`;
      });
      return meta;
    });
    console.log('Reverted Analysis Metadata:', wavMeta);

    const shot10 = path.join(SCREENSHOT_DIR, '10_revert_prod.png');
    await page.screenshot({ path: shot10, fullPage: false });
    console.log(`Saved screenshot: ${shot10}`);

    fs.writeFileSync('experiments/phase8_screenshots/revert_summary.json', JSON.stringify({ modelFacts, wavMeta }, null, 2));
    console.log('\n=== PART 3 (REVERT) COMPLETED SUCCESSFULLY ===');
  } finally {
    await browser.close();
  }
}

runPart3().catch(err => {
  console.error('Part 3 failed:', err);
  process.exit(1);
});

