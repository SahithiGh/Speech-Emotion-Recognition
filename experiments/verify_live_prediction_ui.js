const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT_DIR = path.resolve('experiments/final_ui_screenshots');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyLivePredictions() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 1. Happy2.wav upload and analyze
    console.log('[1] Testing Happy2.wav prediction in UI...');
    await page.goto('http://127.0.0.1:5173/analyze?mode=upload', { waitUntil: 'networkidle0' });
    await sleep(800);

    const fileInput = await page.$('#multi-file-input, input[type="file"]');
    await fileInput.uploadFile(path.resolve('external data/sample_audio/Happy2.wav'));
    await sleep(1000);

    // Click "Analyze Files" button
    const buttons = await page.$$('button');
    let clickedAnalyze = false;
    for (const b of buttons) {
      const txt = await page.evaluate(el => el.textContent, b);
      if (txt.includes('Analyze Files') || txt.includes('Analyze')) {
        await b.click();
        console.log('Clicked button:', txt.trim());
        clickedAnalyze = true;
        break;
      }
    }
    if (!clickedAnalyze) throw new Error('Could not find Analyze Files button!');

    // Wait for analysis to complete
    await sleep(5000);

    const happyResult = await page.evaluate(() => {
      const emotionEl = document.querySelector('.emotion-pill, .r-emotion');
      const qualityEl = document.querySelector('.audio-quality-badge');
      const filenameEl = document.querySelector('.active-filename');
      const badgeEl = document.querySelector('.badge');
      return {
        emotion: emotionEl ? emotionEl.textContent.trim() : null,
        quality: qualityEl ? qualityEl.textContent.trim() : null,
        filename: filenameEl ? filenameEl.textContent.trim() : null,
        modelBadge: badgeEl ? badgeEl.textContent.trim() : null
      };
    });
    console.log('Happy2 Result in UI:', happyResult);
    await page.screenshot({ path: path.join(SHOT_DIR, '13_happy2_active_prediction.png') });

    if (!happyResult.emotion || !happyResult.emotion.toLowerCase().includes('happy')) {
      throw new Error(`FAIL: Expected Happy emotion, got: ${happyResult.emotion}`);
    }

    // 2. Clear all and test Noisy1.wav
    console.log('\n[2] Testing Noisy1.wav rejection in UI...');
    await page.goto('http://127.0.0.1:5173/analyze?mode=upload', { waitUntil: 'networkidle0' });
    await sleep(800);

    const fileInput2 = await page.$('#multi-file-input, input[type="file"]');
    await fileInput2.uploadFile(path.resolve('external data/sample_audio/Noisy1.wav'));
    await sleep(1000);

    const buttons2 = await page.$$('button');
    for (const b of buttons2) {
      const txt = await page.evaluate(el => el.textContent, b);
      if (txt.includes('Analyze Files') || txt.includes('Analyze')) {
        await b.click();
        console.log('Clicked button:', txt.trim());
        break;
      }
    }

    await sleep(4000);

    const noisyResult = await page.evaluate(() => {
      const card = document.querySelector('.noisy-audio-card');
      const title = document.querySelector('.noisy-audio-title');
      const decision = document.querySelector('.quality-metric-item strong[style*="mismatch"]');
      return {
        hasCard: !!card,
        title: title ? title.textContent.trim() : null,
        decision: decision ? decision.textContent.trim() : null
      };
    });
    console.log('Noisy1 Result in UI:', noisyResult);
    await page.screenshot({ path: path.join(SHOT_DIR, '14_noisy1_rejection_card.png') });

    if (!noisyResult.hasCard || !noisyResult.title.includes('Noisy Audio')) {
      throw new Error('FAIL: Noisy Audio Detected card did not appear!');
    }

    console.log('\nConsole Errors:', consoleErrors);
    console.log('LIVE UI PREDICTION & NOISE REJECTION VERIFIED 100%!');
  } finally {
    await browser.close();
  }
}

verifyLivePredictions().catch(err => {
  console.error(err);
  process.exit(1);
});

