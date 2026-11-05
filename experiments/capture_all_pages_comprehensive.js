const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';
const SAMPLE_AUDIO = path.resolve('external data/sample_audio/Happy2.wav');

const delay = ms => new Promise(r => setTimeout(r, ms));

async function captureAllPages() {
  console.log('=== FULL VISUAL AUDIT & HIGH-RES SCREENSHOT CAPTURE ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const report = [];

  // 1. ANALYZE (With Live Queued & Analyzed State)
  console.log('>>> [1/5] ANALYZE PAGE');
  await page.setViewport({ width: 1440, height: 950 });
  await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });

  // Light Mode Queued
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await delay(600);
  const fileInput = await page.$('#multi-file-input');
  if (fileInput) {
    await fileInput.uploadFile(SAMPLE_AUDIO);
    await delay(1200);
  }
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_analyze_light_desktop.png') });
  console.log('  Captured 01_analyze_light_desktop.png');

  // Dark Mode Queued
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await delay(600);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_analyze_dark_desktop.png') });
  console.log('  Captured 02_analyze_dark_desktop.png');

  // Analyze the file
  await page.evaluate(() => {
    const btn = document.querySelector('.btn-action-primary');
    if (btn) btn.click();
  });
  await delay(3500);

  // Dark Mode Analyzed Result
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_analyze_dark_analyzed_desktop.png') });
  console.log('  Captured 03_analyze_dark_analyzed_desktop.png');

  // Light Mode Analyzed Result
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await delay(600);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_analyze_light_analyzed_desktop.png') });
  console.log('  Captured 04_analyze_light_analyzed_desktop.png');

  // Analyze Mobile
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await delay(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_analyze_light_mobile.png') });
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await delay(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_analyze_dark_mobile.png') });
  console.log('  Captured Analyze mobile (light & dark)');

  // 2. EVALUATION PAGE
  console.log('\n>>> [2/5] EVALUATION PAGE');
  await page.setViewport({ width: 1440, height: 950 });
  await page.goto('http://127.0.0.1:5173/evaluation', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await delay(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_evaluation_light_desktop.png') });
  console.log('  Captured 07_evaluation_light_desktop.png');

  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await delay(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '08_evaluation_dark_desktop.png') });
  console.log('  Captured 08_evaluation_dark_desktop.png');

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await delay(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '09_evaluation_dark_mobile.png') });
  console.log('  Captured Evaluation mobile');

  // 3. MODEL INFO PAGE
  console.log('\n>>> [3/5] MODEL INFO PAGE');
  await page.setViewport({ width: 1440, height: 950 });
  await page.goto('http://127.0.0.1:5173/model', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await delay(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '10_model_info_light_desktop.png') });
  console.log('  Captured 10_model_info_light_desktop.png');

  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await delay(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '11_model_info_dark_desktop.png') });
  console.log('  Captured 11_model_info_dark_desktop.png');

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await delay(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '12_model_info_dark_mobile.png') });
  console.log('  Captured Model Info mobile');

  // 4. ABOUT PAGE
  console.log('\n>>> [4/5] ABOUT PAGE');
  await page.setViewport({ width: 1440, height: 950 });
  await page.goto('http://127.0.0.1:5173/about', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await delay(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '13_about_light_desktop.png') });
  console.log('  Captured 13_about_light_desktop.png');

  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await delay(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '14_about_dark_desktop.png') });
  console.log('  Captured 14_about_dark_desktop.png');

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await delay(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '15_about_dark_mobile.png') });
  console.log('  Captured About mobile');

  // 5. FAQ PAGE
  console.log('\n>>> [5/5] FAQ PAGE');
  await page.setViewport({ width: 1440, height: 950 });
  await page.goto('http://127.0.0.1:5173/faq', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await delay(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '16_faq_light_desktop.png') });
  console.log('  Captured 16_faq_light_desktop.png');

  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await delay(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '17_faq_dark_desktop.png') });
  console.log('  Captured 17_faq_dark_desktop.png');

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await delay(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '18_faq_dark_mobile.png') });
  console.log('  Captured FAQ mobile');

  await browser.close();
  console.log('\n=== ALL CAPTURES SUCCEEDED ===');
}

captureAllPages().catch(console.error);

