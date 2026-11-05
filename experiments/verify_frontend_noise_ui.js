const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';
const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('=== STARTING BROWSER NOISE REDUCTION UI VERIFICATION ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to http://127.0.0.1:5173/analyze...');
  await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });

  // 1. Set to Dark Mode
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await delay(500);

  // 2. Upload Noisy1.wav
  const noisy1Path = path.resolve('backend_reference/Noisy1.wav');
  console.log('Uploading test clip:', noisy1Path);

  const fileInput = await page.$('#multi-file-input');
  await fileInput.uploadFile(noisy1Path);
  await delay(1200);

  // 3. Click "Analyze Files" button
  console.log('Clicking "Analyze Files" button...');
  const analyzeBtn = await page.waitForSelector('.btn-action-primary');
  await analyzeBtn.click();

  // 4. Wait for analysis to complete
  console.log('Waiting for analysis completion...');
  await page.waitForSelector('.status-pill.done', { timeout: 30000 });
  await delay(1200);

  // 5. Inspect UI Elements
  const uiState = await page.evaluate(() => {
    const denoisedPill = document.querySelector('.status-pill.denoised');
    const denoisedBadge = document.querySelector('.audio-quality-badge.denoised');
    const denoisedAdvisory = document.querySelector('.audio-quality-advisory.denoised');
    const emotionHero = document.querySelector('.primary-emotion-hero');
    const emotionTitle = document.querySelector('.r-emotion');
    const confValue = document.querySelector('.r-confidence-value');

    return {
      hasDenoisedPill: !!denoisedPill,
      denoisedPillText: denoisedPill ? denoisedPill.innerText : null,
      hasDenoisedBadge: !!denoisedBadge,
      denoisedBadgeText: denoisedBadge ? denoisedBadge.innerText : null,
      hasDenoisedAdvisory: !!denoisedAdvisory,
      advisoryTitle: denoisedAdvisory ? denoisedAdvisory.querySelector('.advisory-title')?.innerText : null,
      advisoryText: denoisedAdvisory ? denoisedAdvisory.querySelector('.advisory-text')?.innerText : null,
      advisoryStats: denoisedAdvisory ? denoisedAdvisory.querySelector('.advisory-stats')?.innerText : null,
      hasEmotionHero: !!emotionHero,
      emotion: emotionTitle ? emotionTitle.innerText : null,
      confidence: confValue ? confValue.innerText : null
    };
  });

  console.log('UI Verification Results:', JSON.stringify(uiState, null, 2));

  // Save Dark Screenshot
  const darkShot = path.join(ARTIFACT_DIR, 'analyze_noise_reduced_dark.png');
  await page.screenshot({ path: darkShot, fullPage: false });
  console.log('Saved dark mode screenshot:', darkShot);

  // 6. Switch to Light Mode
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await delay(600);

  // Save Light Screenshot
  const lightShot = path.join(ARTIFACT_DIR, 'analyze_noise_reduced_light.png');
  await page.screenshot({ path: lightShot, fullPage: false });
  console.log('Saved light mode screenshot:', lightShot);

  await browser.close();
  console.log('\n=== VERIFICATION FINISHED SUCCESSFULLY ===');
}

main().catch(err => {
  console.error('Browser test failed:', err);
  process.exit(1);
});
