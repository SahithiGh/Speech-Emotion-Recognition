const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve('experiments/screenshots');

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

async function runBrowserTests() {
  console.log('=== Launching Headless Chrome for Live UI/UX Testing ===');
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
    }
  });

  page.on('pageerror', err => {
    errors.push(err.toString());
    console.error('Browser page error:', err);
  });

  try {
    // --- 1. Production vs Staging Model Status ---
    console.log('\n1. Testing Model Status & Info View...');
    await page.goto('http://127.0.0.1:5173/about', { waitUntil: 'networkidle0' });
    await sleep(1000);
    const shot1 = path.join(SCREENSHOT_DIR, '01_model_status_staging.png');
    await page.screenshot({ path: shot1, fullPage: false });
    console.log(`Saved screenshot: ${shot1}`);

    // --- 2. Normal Analysis (1001_DFA_ANG_XX.wav) ---
    console.log('\n2. Testing Normal Audio Analysis (Upload & Emotion Hero)...');
    await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });
    await sleep(1000);

    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error('File input not found on /analyze page');

    const normalAudioPath = path.resolve('data/AudioWAV/1001_DFA_ANG_XX.wav');
    await fileInput.uploadFile(normalAudioPath);
    console.log('Uploaded normal audio clip: 1001_DFA_ANG_XX.wav');
    await sleep(1500);

    await clickAnalyzeButton(page);

    // Wait for analysis to finish
    await page.waitForSelector('.primary-emotion-hero, .uncertain-callout, .active-filename', { timeout: 20000 });
    await sleep(2500);

    const shot2 = path.join(SCREENSHOT_DIR, '02_normal_analysis.png');
    await page.screenshot({ path: shot2, fullPage: false });
    console.log(`Saved screenshot: ${shot2}`);

    // --- 3. Spectrogram and Timeline ---
    console.log('\n3. Testing Spectrogram & Emotion Timeline Panel...');
    await page.evaluate(() => window.scrollBy(0, 650));
    await sleep(1500);

    const shot3 = path.join(SCREENSHOT_DIR, '03_spectrogram_timeline.png');
    await page.screenshot({ path: shot3, fullPage: false });
    console.log(`Saved screenshot: ${shot3}`);

    // --- 4. OOD Audio Analysis (Neutral1.wav) ---
    console.log('\n4. Testing Out-of-Distribution Audio & Warning Banner...');
    await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });
    await sleep(1000);

    const fileInput2 = await page.$('input[type="file"]');
    const oodAudioPath = path.resolve('external_datasets/audio_for_friend/sample_audio/Neutral1.wav');
    await fileInput2.uploadFile(oodAudioPath);
    console.log('Uploaded external audio clip: Neutral1.wav');
    await sleep(1500);

    await clickAnalyzeButton(page);

    await page.waitForSelector('.ood-callout, .uncertain-callout', { timeout: 20000 });
    await sleep(2500);

    const shot4 = path.join(SCREENSHOT_DIR, '04_ood_analysis_warning.png');
    await page.screenshot({ path: shot4, fullPage: false });
    console.log(`Saved screenshot: ${shot4}`);

    // --- 5. Corrupted File Error Handling ---
    console.log('\n5. Testing Corrupted Audio File Error Handling...');
    await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });
    await sleep(1000);

    const fileInput3 = await page.$('input[type="file"]');
    const corruptedPath = path.resolve('external_datasets/audio_for_friend/sample_audio/test_corrupted.wav');
    await fileInput3.uploadFile(corruptedPath);
    console.log('Uploaded corrupted audio clip: test_corrupted.wav');
    await sleep(1500);

    await clickAnalyzeButton(page);
    await sleep(2500);

    const shot5 = path.join(SCREENSHOT_DIR, '05_corrupted_file_error.png');
    await page.screenshot({ path: shot5, fullPage: false });
    console.log(`Saved screenshot: ${shot5}`);

    // --- 6. Analysis History / Profile ---
    console.log('\n6. Testing History / Profile View...');
    await page.goto('http://127.0.0.1:5173/profile', { waitUntil: 'networkidle0' });
    await sleep(1500);

    const shot6 = path.join(SCREENSHOT_DIR, '06_analysis_history.png');
    await page.screenshot({ path: shot6, fullPage: false });
    console.log(`Saved screenshot: ${shot6}`);

    console.log('\n=== All 6 Screenshots Captured Successfully ===');
    console.log('Console Errors Count:', errors.length);
  } finally {
    await browser.close();
  }
}

runBrowserTests().catch(err => {
  console.error('Browser testing failed:', err);
  process.exit(1);
});
