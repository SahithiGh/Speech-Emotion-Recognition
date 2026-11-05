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
    if (text.includes('Analyze')) {
      await b.click();
      console.log('Clicked button:', text.trim());
      return true;
    }
  }
  return false;
}

async function runPart1() {
  console.log('=== PHASE 8 UAT: PART 1 - PRODUCTION PROFILE ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1400, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  const consoleLogs = [];
  const errors = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      console.error('Browser console error:', text);
      errors.push(text);
    }
  });

  page.on('pageerror', err => {
    errors.push(err.toString());
    console.error('Browser page error:', err);
  });

  try {
    // 1. Model Info Page
    console.log('\n[1] Verifying Production Model Info Page (/model)...');
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
    console.log('Production Model Facts on /model:');
    modelFacts.forEach(f => console.log('  ', f));

    const shot1 = path.join(SCREENSHOT_DIR, '01_prod_model_info.png');
    await page.screenshot({ path: shot1, fullPage: false });
    console.log(`Saved screenshot: ${shot1}`);

    // 2. Normal WAV Upload & Analysis on /analyze
    console.log('\n[2] Testing Normal WAV Upload on /analyze (1001_DFA_ANG_XX.wav)...');
    await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });
    await sleep(1000);

    let fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error('File input not found on /analyze');
    await fileInput.uploadFile(path.resolve('data/AudioWAV/1001_DFA_ANG_XX.wav'));
    console.log('Uploaded 1001_DFA_ANG_XX.wav');
    await sleep(1200);

    await clickAnalyzeButton(page);
    await page.waitForSelector('.primary-emotion-hero, .hero-metric, .result-header', { timeout: 25000 });
    await sleep(2500);

    const wavMeta = await page.evaluate(() => {
      const hero = document.querySelector('.hero-metric .val')?.textContent?.trim();
      const conf = document.querySelector('.hero-sub')?.textContent?.trim();
      const meta = Array.from(document.querySelectorAll('dl.meta-grid div')).map(d => {
        return `${d.querySelector('dt')?.textContent?.trim()}: ${d.querySelector('dd')?.textContent?.trim()}`;
      });
      return { hero, conf, meta };
    });
    console.log('WAV Result:', wavMeta);

    const shot2 = path.join(SCREENSHOT_DIR, '02_prod_wav_analysis.png');
    await page.screenshot({ path: shot2, fullPage: false });
    console.log(`Saved screenshot: ${shot2}`);

    // 3. MP3 Audio Upload & Prediction (Repeated upload on same page)
    console.log('\n[3] Testing MP3 Audio Upload on /analyze (Sad2.mp3.mpeg)...');
    fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile('C:\\Users\\JAI-SREE-RAM\\Downloads\\Sad2.mp3.mpeg');
    console.log('Uploaded Sad2.mp3.mpeg');
    await sleep(1200);

    await clickAnalyzeButton(page);
    await sleep(5000);

    const mp3Meta = await page.evaluate(() => {
      const hero = document.querySelector('.hero-metric .val')?.textContent?.trim();
      const conf = document.querySelector('.hero-sub')?.textContent?.trim();
      const meta = Array.from(document.querySelectorAll('dl.meta-grid div')).map(d => {
        return `${d.querySelector('dt')?.textContent?.trim()}: ${d.querySelector('dd')?.textContent?.trim()}`;
      });
      return { hero, conf, meta };
    });
    console.log('MP3 Result:', mp3Meta);

    const shot3 = path.join(SCREENSHOT_DIR, '03_prod_mp3_analysis.png');
    await page.screenshot({ path: shot3, fullPage: false });
    console.log(`Saved screenshot: ${shot3}`);

    // 4. OOD Audio Analysis (Neutral1.wav)
    console.log('\n[4] Testing Out-of-Distribution Audio & Warning Banner (Neutral1.wav)...');
    fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(path.resolve('external_datasets/audio_for_friend/sample_audio/Neutral1.wav'));
    console.log('Uploaded Neutral1.wav');
    await sleep(1200);

    await clickAnalyzeButton(page);
    await page.waitForSelector('.ood-callout, .uncertain-callout, .warning-box, .banner', { timeout: 25000 });
    await sleep(2500);

    const oodInfo = await page.evaluate(() => {
      const oodBox = document.querySelector('.ood-callout, .uncertain-callout')?.textContent?.trim();
      return { oodBox };
    });
    console.log('OOD Banner detected:', oodInfo.oodBox?.slice(0, 150));

    const shot4 = path.join(SCREENSHOT_DIR, '04_prod_ood_warning.png');
    await page.screenshot({ path: shot4, fullPage: false });
    console.log(`Saved screenshot: ${shot4}`);

    // 5. Corrupted File Error Handling
    console.log('\n[5] Testing Corrupted Audio File Error Handling (test_corrupted.wav)...');
    fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(path.resolve('external_datasets/audio_for_friend/sample_audio/test_corrupted.wav'));
    console.log('Uploaded test_corrupted.wav');
    await sleep(1200);

    await clickAnalyzeButton(page);
    await sleep(2500);

    const errorMsg = await page.evaluate(() => {
      const err = document.querySelector('.error-banner, .batch-item.error, .banner.warn, [role="alert"]')?.textContent?.trim();
      return err;
    });
    console.log('Error message captured:', errorMsg);

    const shot5 = path.join(SCREENSHOT_DIR, '05_prod_error_handling.png');
    await page.screenshot({ path: shot5, fullPage: false });
    console.log(`Saved screenshot: ${shot5}`);

    // Save test summary
    const summary = {
      profile: 'production',
      modelFacts,
      wavMeta,
      mp3Meta,
      oodInfo,
      errorMsg,
      consoleErrors: errors,
    };
    fs.writeFileSync('experiments/phase8_screenshots/prod_summary.json', JSON.stringify(summary, null, 2));
    console.log('\n=== PART 1 (PRODUCTION) COMPLETED SUCCESSFULLY ===');
  } finally {
    await browser.close();
  }
}

runPart1().catch(err => {
  console.error('Part 1 failed:', err);
  process.exit(1);
});

