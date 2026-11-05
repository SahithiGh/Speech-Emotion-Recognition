const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve('experiments/phase8_screenshots');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyPromotedUI() {
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
    // 1. Check Model Info Page
    console.log('[1] Visiting /model page...');
    await page.goto('http://127.0.0.1:5173/model', { waitUntil: 'networkidle0' });
    await sleep(1500);

    const modelName = await page.evaluate(() => {
      const heading = document.querySelector('h1, h2');
      return heading ? heading.textContent.trim() : '';
    });
    console.log('Model Page Heading:', modelName);

    const modelFacts = await page.evaluate(() => {
      const dls = Array.from(document.querySelectorAll('dl.facts div, .card, table'));
      return dls.map(el => el.textContent.trim().replace(/\s+/g, ' ')).slice(0, 5);
    });
    console.log('Model Facts:', modelFacts);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '22_promoted_model_page.png') });

    // 2. Home Page & Prediction
    console.log('\n[2] Visiting Home page and uploading Happy2.wav...');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
    await sleep(1500);

    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(path.resolve('external data/sample_audio/Happy2.wav'));
      await sleep(1000);

      // Click analyze button if present
      const buttons = await page.$$('button');
      for (const b of buttons) {
        const text = await page.evaluate(el => el.textContent, b);
        if (text.includes('Analyze')) {
          await b.click();
          console.log('Clicked:', text.trim());
          break;
        }
      }

      await sleep(4000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '23_promoted_happy2_prediction.png') });

      const predictionText = await page.evaluate(() => {
        const res = document.querySelector('.card, .prediction-result, h2, h3');
        return res ? res.textContent.trim().replace(/\s+/g, ' ') : '';
      });
      console.log('Prediction Text:', predictionText);
    }

    // 3. Noisy Audio Upload
    console.log('\n[3] Testing Noisy Audio upload (Noisy1.wav)...');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
    await sleep(1500);

    const fileInput2 = await page.$('input[type="file"]');
    if (fileInput2) {
      await fileInput2.uploadFile(path.resolve('external data/sample_audio/Noisy1.wav'));
      await sleep(1000);

      const buttons = await page.$$('button');
      for (const b of buttons) {
        const text = await page.evaluate(el => el.textContent, b);
        if (text.includes('Analyze')) {
          await b.click();
          console.log('Clicked:', text.trim());
          break;
        }
      }

      await sleep(3000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '24_promoted_noisy_rejection.png') });

      const alertText = await page.evaluate(() => {
        const alert = document.querySelector('.alert, [role="alert"], .card');
        return alert ? alert.textContent.trim().replace(/\s+/g, ' ') : '';
      });
      console.log('Noisy Alert Text:', alertText);
    }

    console.log('\nConsole Errors:', errors);
    console.log('UI Verification completed!');
  } finally {
    await browser.close();
  }
}

verifyPromotedUI().catch(err => {
  console.error(err);
  process.exit(1);
});

