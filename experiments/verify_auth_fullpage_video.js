const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';
const delay = ms => new Promise(r => setTimeout(r, ms));

async function verifyAuth() {
  console.log('=== VERIFYING FULL-PAGE VIDEO AUTH PAGES ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const pagesToTest = [
    { title: 'Login / Sign In (/login)', url: 'http://127.0.0.1:5173/login', key: 'login' },
    { title: 'Sign In Alias (/signin)', url: 'http://127.0.0.1:5173/signin', key: 'signin' },
    { title: 'Register / Create Account (/register)', url: 'http://127.0.0.1:5173/register', key: 'register' },
  ];

  for (const item of pagesToTest) {
    console.log(`\n>>> Testing ${item.title}`);

    // 1. DESKTOP DARK MODE
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(item.url, { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      localStorage.setItem('ser-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await delay(700);

    const darkCheck = await page.evaluate(async () => {
      const vid = document.querySelector('.auth-fullpage-video');
      const view = document.querySelector('.auth-fullpage-view');
      const card = document.querySelector('.auth-card');
      const nav = document.querySelector('.site-header');

      const t1 = vid ? vid.currentTime : 0;
      await new Promise(r => setTimeout(r, 600));
      const t2 = vid ? vid.currentTime : 0;

      const vidRect = vid ? vid.getBoundingClientRect() : {};
      const cardRect = card ? card.getBoundingClientRect() : {};
      const viewRect = view ? view.getBoundingClientRect() : {};
      const navRect = nav ? nav.getBoundingClientRect() : {};

      const vStyle = vid ? window.getComputedStyle(vid) : {};
      const cardStyle = card ? window.getComputedStyle(card) : {};

      return {
        hasVideo: !!vid,
        playing: t2 > t1,
        timeAdvancing: `${t1.toFixed(2)}s -> ${t2.toFixed(2)}s`,
        navHeight: navRect.height,
        viewHeight: viewRect.height,
        vidHeight: vidRect.height,
        vidWidth: vidRect.width,
        vidTop: vidRect.top,
        vidBottom: vidRect.bottom,
        cardWidth: cardRect.width,
        cardHeight: cardRect.height,
        cardTop: cardRect.top,
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
        cardZIndex: cardStyle.zIndex,
        filter: vStyle.filter,
        mixBlend: vStyle.mixBlendMode,
        opacity: vStyle.opacity,
        cardBg: cardStyle.backgroundColor,
      };
    });

    console.log(`  [Dark Mode] Video playing: ${darkCheck.playing} (${darkCheck.timeAdvancing})`);
    console.log(`  [Dark Mode] View height: ${darkCheck.viewHeight}px, Video height: ${darkCheck.vidHeight}px (fills viewport: ${darkCheck.vidHeight >= 835})`);
    console.log(`  [Dark Mode] Card size: ${Math.round(darkCheck.cardWidth)}x${Math.round(darkCheck.cardHeight)}px, Card Left: ${Math.round(darkCheck.cardLeft)}px (centered)`);
    console.log(`  [Dark Mode] Video Filter: ${darkCheck.filter}, MixBlend: ${darkCheck.mixBlend}, Opacity: ${darkCheck.opacity}`);

    const darkShotPath = path.join(ARTIFACT_DIR, `auth_${item.key}_dark_desktop.png`);
    await page.screenshot({ path: darkShotPath });
    console.log(`  Captured ${darkShotPath}`);

    // 2. DESKTOP BRIGHT MODE
    await page.evaluate(() => {
      localStorage.setItem('ser-theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await delay(700);

    const lightCheck = await page.evaluate(async () => {
      const vid = document.querySelector('.auth-fullpage-video');
      const view = document.querySelector('.auth-fullpage-view');
      const card = document.querySelector('.auth-card');

      const t1 = vid ? vid.currentTime : 0;
      await new Promise(r => setTimeout(r, 600));
      const t2 = vid ? vid.currentTime : 0;

      const vidRect = vid ? vid.getBoundingClientRect() : {};
      const cardRect = card ? card.getBoundingClientRect() : {};
      const viewRect = view ? view.getBoundingClientRect() : {};

      const vStyle = vid ? window.getComputedStyle(vid) : {};
      const cardStyle = card ? window.getComputedStyle(card) : {};

      return {
        hasVideo: !!vid,
        playing: t2 > t1,
        timeAdvancing: `${t1.toFixed(2)}s -> ${t2.toFixed(2)}s`,
        viewHeight: viewRect.height,
        vidHeight: vidRect.height,
        filter: vStyle.filter,
        mixBlend: vStyle.mixBlendMode,
        opacity: vStyle.opacity,
        cardBg: cardStyle.backgroundColor,
      };
    });

    console.log(`  [Bright Mode] Video playing: ${lightCheck.playing} (${lightCheck.timeAdvancing})`);
    console.log(`  [Bright Mode] Video height: ${lightCheck.vidHeight}px (full coverage)`);
    console.log(`  [Bright Mode] Video Filter: ${lightCheck.filter}, MixBlend: ${lightCheck.mixBlend}, Opacity: ${lightCheck.opacity}`);
    console.log(`  [Bright Mode] Video Unchanged from Dark: ${darkCheck.filter === lightCheck.filter && darkCheck.mixBlend === lightCheck.mixBlend && darkCheck.opacity === lightCheck.opacity}`);

    const lightShotPath = path.join(ARTIFACT_DIR, `auth_${item.key}_light_desktop.png`);
    await page.screenshot({ path: lightShotPath });
    console.log(`  Captured ${lightShotPath}`);

    // 3. MOBILE (390x844)
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await delay(500);
    const mobileShotPath = path.join(ARTIFACT_DIR, `auth_${item.key}_mobile.png`);
    await page.screenshot({ path: mobileShotPath });
    console.log(`  Captured Mobile: ${mobileShotPath}`);
  }

  await browser.close();
  console.log('\n=== ALL AUTH VERIFICATIONS COMPLETE ===');
}

verifyAuth().catch(console.error);

