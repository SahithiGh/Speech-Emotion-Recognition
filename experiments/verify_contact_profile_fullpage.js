const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';
const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('=== STARTING CONTACT & PROFILE FULL-PAGE VIDEO VERIFICATION ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // ----------------------------------------------------
  // 1. CONTACT PAGE
  // ----------------------------------------------------
  console.log('>>> 1. Verifying Contact Page (/contact)...');

  // Contact Desktop Dark
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173/contact', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await delay(800);

  const contactDarkMetrics = await page.evaluate(async () => {
    const vid = document.querySelector('.auth-fullpage-video');
    const view = document.querySelector('.auth-fullpage-view');
    const card = document.querySelector('.auth-card');
    const nav = document.querySelector('.site-header');

    const t1 = vid ? vid.currentTime : 0;
    await new Promise(r => setTimeout(r, 600));
    const t2 = vid ? vid.currentTime : 0;

    const vStyle = vid ? window.getComputedStyle(vid) : {};
    const cStyle = card ? window.getComputedStyle(card) : {};
    const viewStyle = view ? window.getComputedStyle(view) : {};

    return {
      hasVideo: !!vid,
      src: vid ? vid.getAttribute('src') || (vid.querySelector('source') ? vid.querySelector('source').src : '') : null,
      playing: t2 > t1,
      timeProgress: `${t1.toFixed(2)}s -> ${t2.toFixed(2)}s`,
      filter: vStyle.filter,
      mixBlendMode: vStyle.mixBlendMode,
      opacity: vStyle.opacity,
      viewMinHeight: viewStyle.minHeight,
      cardBackdrop: cStyle.backdropFilter || cStyle.webkitBackdropFilter,
      cardBg: cStyle.backgroundColor,
      cardBorder: cStyle.borderColor
    };
  });

  console.log('Contact Dark Metrics:', contactDarkMetrics);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'contact_fullpage_dark_desktop.png'), fullPage: false });

  // Contact Desktop Bright
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await delay(800);

  const contactLightMetrics = await page.evaluate(async () => {
    const vid = document.querySelector('.auth-fullpage-video');
    const card = document.querySelector('.auth-card');
    const vStyle = vid ? window.getComputedStyle(vid) : {};
    const cStyle = card ? window.getComputedStyle(card) : {};
    return {
      filter: vStyle.filter,
      opacity: vStyle.opacity,
      mixBlendMode: vStyle.mixBlendMode,
      cardBg: cStyle.backgroundColor,
      cardBackdrop: cStyle.backdropFilter || cStyle.webkitBackdropFilter
    };
  });
  console.log('Contact Light Metrics:', contactLightMetrics);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'contact_fullpage_light_desktop.png'), fullPage: false });

  // Contact Mobile
  await page.setViewport({ width: 390, height: 844 });
  await delay(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'contact_fullpage_mobile.png'), fullPage: false });

  // ----------------------------------------------------
  // 2. PROFILE PAGE
  // ----------------------------------------------------
  console.log('\n>>> 2. Verifying Profile Page (/profile)...');

  // Let's create or log into a test user
  await page.setViewport({ width: 1440, height: 900 });
  const testEmail = `tester_${Date.now()}@example.com`;
  const testPass = 'Password123!';
  const testName = 'Dr. Elena Rostova';

  // Register via API from page context
  const authSuccess = await page.evaluate(async ({ email, name, password }) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_name: name, password })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('ser_auth_token', data.token);
        localStorage.setItem('ser_auth_user', JSON.stringify(data.user));
        return { success: true, user: data.user };
      }
      return { success: false, status: res.status, text: await res.text() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, { email: testEmail, name: testName, password: testPass });

  console.log('Profile Test User Auth Result:', authSuccess);

  // Navigate to /profile
  await page.goto('http://127.0.0.1:5173/profile', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await delay(1000);

  const profileDarkMetrics = await page.evaluate(async () => {
    const vid = document.querySelector('.profile-fullpage-video');
    const view = document.querySelector('.profile-fullpage-view');
    const cards = document.querySelectorAll('.card');

    const t1 = vid ? vid.currentTime : 0;
    await new Promise(r => setTimeout(r, 600));
    const t2 = vid ? vid.currentTime : 0;

    const vStyle = vid ? window.getComputedStyle(vid) : {};
    const firstCard = cards[0];
    const cStyle = firstCard ? window.getComputedStyle(firstCard) : {};

    return {
      hasVideo: !!vid,
      src: vid ? vid.getAttribute('src') || (vid.querySelector('source') ? vid.querySelector('source').src : '') : null,
      playing: t2 > t1,
      timeProgress: `${t1.toFixed(2)}s -> ${t2.toFixed(2)}s`,
      filter: vStyle.filter,
      mixBlendMode: vStyle.mixBlendMode,
      opacity: vStyle.opacity,
      cardsFound: cards.length,
      cardBackdrop: cStyle.backdropFilter || cStyle.webkitBackdropFilter,
      cardBg: cStyle.backgroundColor
    };
  });

  console.log('Profile Dark Metrics:', profileDarkMetrics);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'profile_fullpage_dark_desktop.png'), fullPage: false });

  // Profile Desktop Bright
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await delay(800);

  const profileLightMetrics = await page.evaluate(async () => {
    const vid = document.querySelector('.profile-fullpage-video');
    const firstCard = document.querySelector('.card');
    const vStyle = vid ? window.getComputedStyle(vid) : {};
    const cStyle = firstCard ? window.getComputedStyle(firstCard) : {};
    return {
      filter: vStyle.filter,
      opacity: vStyle.opacity,
      mixBlendMode: vStyle.mixBlendMode,
      cardBg: cStyle.backgroundColor,
      cardBackdrop: cStyle.backdropFilter || cStyle.webkitBackdropFilter
    };
  });
  console.log('Profile Light Metrics:', profileLightMetrics);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'profile_fullpage_light_desktop.png'), fullPage: false });

  // Profile Mobile
  await page.setViewport({ width: 390, height: 844 });
  await delay(500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'profile_fullpage_mobile.png'), fullPage: false });

  await browser.close();
  console.log('\n=== VERIFICATION FINISHED SUCCESSFULLY ===');
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

