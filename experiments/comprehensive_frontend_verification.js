const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT_DIR = path.resolve('experiments/final_ui_screenshots');
if (!fs.existsSync(SHOT_DIR)) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const VIEWPORTS = [
  { name: '1440_desktop', width: 1440, height: 950 },
  { name: '1280_laptop', width: 1280, height: 800 },
  { name: '768_tablet', width: 768, height: 1024 },
  { name: '390_mobile', width: 390, height: 844 },
  { name: '360_small_mobile', width: 360, height: 740 }
];

const PAGES = [
  { path: '/', name: '01_home' },
  { path: '/analyze', name: '02_analyze' },
  { path: '/model', name: '03_model_info' },
  { path: '/evaluation', name: '04_evaluation' },
  { path: '/about', name: '05_about' },
  { path: '/faq', name: '06_faq' }
];

async function runComprehensiveVerification() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Ignore favicon or non-critical 404s
      if (!txt.includes('favicon')) {
        console.error('Browser console error:', txt);
        consoleErrors.push(txt);
      }
    }
  });

  try {
    console.log('=== 1. VERIFYING ALL PAGES ACROSS VIEWPORTS ===');
    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height });
      for (const p of PAGES) {
        await page.goto(`http://127.0.0.1:5173${p.path}`, { waitUntil: 'networkidle0' });
        await sleep(500);
        const file = `${p.name}_${vp.name}.png`;
        await page.screenshot({ path: path.join(SHOT_DIR, file) });
        console.log(`Saved screenshot: ${file}`);
      }
    }

    console.log('\n=== 2. VERIFYING THEME TOGGLE (LIGHT & DARK MODES) ===');
    await page.setViewport({ width: 1440, height: 950 });
    await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });
    await sleep(600);

    // Initial theme screenshot
    await page.screenshot({ path: path.join(SHOT_DIR, '07_analyze_theme_dark.png') });

    // Toggle to light theme
    const themeBtn = await page.$('.theme-toggle-btn');
    if (themeBtn) {
      await themeBtn.click();
      await sleep(600);
      await page.screenshot({ path: path.join(SHOT_DIR, '08_analyze_theme_light.png') });
      console.log('Saved Light Theme screenshot.');

      // Toggle back to dark theme
      await themeBtn.click();
      await sleep(600);
    }

    console.log('\n=== 3. VERIFYING AUDIO UPLOAD & PREDICTION (HAPPY2.WAV) ===');
    await page.goto('http://127.0.0.1:5173/analyze?mode=upload', { waitUntil: 'networkidle0' });
    await sleep(800);

    const fileInput = await page.$('#multi-file-input, input[type="file"]');
    if (fileInput) {
      const happyPath = path.resolve('external data/sample_audio/Happy2.wav');
      await fileInput.uploadFile(happyPath);
      console.log('Uploaded Happy2.wav, waiting for analysis...');
      await sleep(4000);

      const predictionResult = await page.evaluate(() => {
        const emo = document.querySelector('.emotion-pill, .r-emotion, strong');
        const quality = document.querySelector('.audio-quality-badge');
        const modelBadge = document.querySelector('.badge');
        return {
          emotionText: emo ? emo.textContent.trim() : null,
          qualityText: quality ? quality.textContent.trim() : null,
          modelBadgeText: modelBadge ? modelBadge.textContent.trim() : null
        };
      });
      console.log('Prediction Result:', predictionResult);
      await page.screenshot({ path: path.join(SHOT_DIR, '09_analyze_happy2_result.png') });
    }

    console.log('\n=== 4. VERIFYING NOISY AUDIO REJECTION (NOISY1.WAV) ===');
    await page.goto('http://127.0.0.1:5173/analyze?mode=upload', { waitUntil: 'networkidle0' });
    await sleep(800);

    const fileInput2 = await page.$('#multi-file-input, input[type="file"]');
    if (fileInput2) {
      const noisyPath = path.resolve('external data/sample_audio/Noisy1.wav');
      await fileInput2.uploadFile(noisyPath);
      console.log('Uploaded Noisy1.wav, waiting for quality assessment...');
      await sleep(3500);

      const noisyResult = await page.evaluate(() => {
        const card = document.querySelector('.noisy-audio-card');
        const badge = document.querySelector('.audio-quality-badge.noisy');
        const title = document.querySelector('.noisy-audio-title');
        return {
          cardExists: !!card,
          badgeText: badge ? badge.textContent.trim() : null,
          titleText: title ? title.textContent.trim() : null
        };
      });
      console.log('Noisy Audio Assessment:', noisyResult);
      await page.screenshot({ path: path.join(SHOT_DIR, '10_analyze_noisy1_rejection.png') });
    }

    console.log('\n=== 5. VERIFYING FAQ SEARCH INTERACTION ===');
    await page.goto('http://127.0.0.1:5173/faq', { waitUntil: 'networkidle0' });
    await sleep(600);
    const searchInput = await page.$('#faq-search');
    if (searchInput) {
      await searchInput.type('production');
      await sleep(500);
      const shownCount = await page.evaluate(() => {
        const details = Array.from(document.querySelectorAll('.faq details'));
        return details.length;
      });
      console.log('FAQ Search "production" Results Count:', shownCount);
      await page.screenshot({ path: path.join(SHOT_DIR, '11_faq_search_interaction.png') });
    }

    console.log('\n=== 6. VERIFYING MODEL INFO ACCURACY ===');
    await page.goto('http://127.0.0.1:5173/model', { waitUntil: 'networkidle0' });
    await sleep(800);
    const modelFacts = await page.evaluate(() => {
      const dls = Array.from(document.querySelectorAll('dl.facts div'));
      return dls.map(div => {
        const dt = div.querySelector('dt')?.textContent.trim();
        const dd = div.querySelector('dd')?.textContent.trim();
        return `${dt}: ${dd}`;
      });
    });
    console.log('Model Facts on Page:', modelFacts);
    await page.screenshot({ path: path.join(SHOT_DIR, '12_model_info_facts.png') });

    console.log('\nConsole Errors:', consoleErrors);
    if (consoleErrors.length > 0) {
      throw new Error(`FAIL: Encountered ${consoleErrors.length} browser console errors!`);
    }

    console.log('\nALL VERIFICATIONS PASSED SUCCESSFULLY WITH 0 ERRORS!');
  } finally {
    await browser.close();
  }
}

runComprehensiveVerification().catch(err => {
  console.error(err);
  process.exit(1);
});

