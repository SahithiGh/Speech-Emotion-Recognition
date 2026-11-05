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

async function clickClearAll(page) {
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const text = await page.evaluate(el => el.textContent, b);
    if (text.includes('Clear All')) {
      await b.click();
      console.log('Cleared batch queue.');
      return true;
    }
  }
  return false;
}

async function runPart2() {
  console.log('=== PHASE 8 UAT: PART 2 - EMOTION2VEC EXPERIMENTAL PROFILE ===');
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
    console.log('\n[1] Verifying emotion2vec_experimental Model Info Page (/model)...');
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
    console.log('Experimental Model Facts on /model:');
    modelFacts.forEach(f => console.log('  ', f));

    const shot6 = path.join(SCREENSHOT_DIR, '06_exp_model_info.png');
    await page.screenshot({ path: shot6, fullPage: false });
    console.log(`Saved screenshot: ${shot6}`);

    // 2. WAV Upload on /analyze (Sad2.wav)
    console.log('\n[2] Testing WAV Audio Upload on /analyze (Sad2.wav)...');
    await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });
    await sleep(1000);

    let fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error('File input not found on /analyze');
    await fileInput.uploadFile(path.resolve('external_datasets/audio_for_friend/sample_audio/Sad2.wav'));
    console.log('Uploaded Sad2.wav');
    await sleep(1200);

    await clickAnalyzeButton(page);
    console.log('Waiting for analysis to complete...');
    await page.waitForSelector('.primary-emotion-hero, .hero-metric, .result-header', { timeout: 35000 });
    await sleep(2500);

    const wavMeta = await page.evaluate(() => {
      const hero = document.querySelector('.hero-metric .val, .primary-emotion-hero .val')?.textContent?.trim();
      const conf = document.querySelector('.hero-sub')?.textContent?.trim();
      const meta = Array.from(document.querySelectorAll('dl.meta-grid div')).map(d => {
        return `${d.querySelector('dt')?.textContent?.trim()}: ${d.querySelector('dd')?.textContent?.trim()}`;
      });
      return { hero, conf, meta };
    });
    console.log('WAV Result:', wavMeta);

    const shot7 = path.join(SCREENSHOT_DIR, '07_exp_wav_sad2.png');
    await page.screenshot({ path: shot7, fullPage: false });
    console.log(`Saved screenshot: ${shot7}`);

    // 3. MP3 Upload (Sad2.mp3.mpeg) after clearing previous batch item
    console.log('\n[3] Testing MP3 Audio Upload on /analyze (Sad2.mp3.mpeg)...');
    await clickClearAll(page);
    await sleep(1000);

    fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile('C:\\Users\\JAI-SREE-RAM\\Downloads\\Sad2.mp3.mpeg');
    console.log('Uploaded Sad2.mp3.mpeg');
    await sleep(1200);

    await clickAnalyzeButton(page);
    console.log('Waiting for MP3 analysis to complete...');
    await page.waitForSelector('.primary-emotion-hero, .hero-metric, .result-header', { timeout: 35000 });
    await sleep(2500);

    const mp3Meta = await page.evaluate(() => {
      const hero = document.querySelector('.hero-metric .val, .primary-emotion-hero .val')?.textContent?.trim();
      const conf = document.querySelector('.hero-sub')?.textContent?.trim();
      const meta = Array.from(document.querySelectorAll('dl.meta-grid div')).map(d => {
        return `${d.querySelector('dt')?.textContent?.trim()}: ${d.querySelector('dd')?.textContent?.trim()}`;
      });
      return { hero, conf, meta };
    });
    console.log('MP3 Result:', mp3Meta);

    const shot8 = path.join(SCREENSHOT_DIR, '08_exp_mp3_sad2.png');
    await page.screenshot({ path: shot8, fullPage: false });
    console.log(`Saved screenshot: ${shot8}`);

    // 4. Test Timeline Panel
    console.log('\n[4] Testing Timeline Generation in Advanced Panels...');
    await page.evaluate(() => window.scrollBy(0, 800));
    await sleep(1000);

    const timelineBtn = await page.$('button.btn.sub, .advanced-panel button');
    const buttons = await page.$$('button');
    let clickedTimeline = false;
    for (const b of buttons) {
      const txt = await page.evaluate(el => el.textContent, b);
      if (txt.includes('Generate') || txt.includes('Timeline') || txt.includes('Spectrogram')) {
        await b.click();
        console.log('Clicked advanced panel button:', txt.trim());
        clickedTimeline = true;
        break;
      }
    }
    await sleep(3500);

    const shot9 = path.join(SCREENSHOT_DIR, '09_exp_timeline.png');
    await page.screenshot({ path: shot9, fullPage: false });
    console.log(`Saved screenshot: ${shot9}`);

    // Save test summary
    const summary = {
      profile: 'emotion2vec_experimental',
      modelFacts,
      wavMeta,
      mp3Meta,
      consoleErrors: errors,
    };
    fs.writeFileSync('experiments/phase8_screenshots/exp_summary.json', JSON.stringify(summary, null, 2));
    console.log('\n=== PART 2 (EXPERIMENTAL) COMPLETED SUCCESSFULLY ===');
  } finally {
    await browser.close();
  }
}

runPart2().catch(err => {
  console.error('Part 2 failed:', err);
  process.exit(1);
});

