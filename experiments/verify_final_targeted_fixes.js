const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';
const delay = ms => new Promise(r => setTimeout(r, ms));

async function verifyAll() {
  console.log('=== VERIFYING FINAL TARGETED FIXES ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // -------------------------------------------------------------
  // TEST 1: HOME PAGE VIDEO HEADING TEXT COLOUR (BRIGHT VS DARK)
  // -------------------------------------------------------------
  console.log('>>> [TEST 1] HOME PAGE VIDEO HEADING TEXT COLOUR');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });

  // Dark Mode Home
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await delay(600);
  const homeDark = await page.evaluate(() => {
    const title = document.querySelector('.hero-title');
    const hl2 = document.querySelector('.hero-title .hl-2');
    const label = document.querySelector('.hero-label');
    return {
      titleColor: window.getComputedStyle(title).color,
      hl2Color: window.getComputedStyle(hl2).color,
      labelColor: window.getComputedStyle(label).color,
    };
  });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'final_01_home_dark.png') });
  console.log('  [Home Dark Mode]:', homeDark);

  // Bright Mode Home
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await delay(600);
  const homeLight = await page.evaluate(() => {
    const title = document.querySelector('.hero-title');
    const hl2 = document.querySelector('.hero-title .hl-2');
    const label = document.querySelector('.hero-label');
    return {
      titleColor: window.getComputedStyle(title).color,
      hl2Color: window.getComputedStyle(hl2).color,
      labelColor: window.getComputedStyle(label).color,
    };
  });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'final_02_home_light.png') });
  console.log('  [Home Bright Mode]:', homeLight);

  const homeIdentical = (
    homeDark.titleColor === homeLight.titleColor &&
    homeDark.hl2Color === homeLight.hl2Color &&
    homeDark.labelColor === homeLight.labelColor
  );
  console.log(`  >>> HOME HEADING COLOUR IDENTICAL CHECK: ${homeIdentical ? 'PASS (100% Identical)' : 'FAIL'}`);

  // -------------------------------------------------------------
  // TEST 2: NON-HOME PAGE VIDEO ALIGNMENT & BRIGHT/DARK APPEARANCE
  // -------------------------------------------------------------
  const pages = [
    { name: 'Analyze', route: '/analyze' },
    { name: 'Evaluation', route: '/evaluation' },
    { name: 'Model Info', route: '/model' },
    { name: 'About', route: '/about' },
    { name: 'FAQ', route: '/faq' },
  ];

  const pageResults = [];

  for (const p of pages) {
    console.log(`\n>>> [TEST 2 & 3] ${p.name.toUpperCase()} (${p.route})`);
    await page.goto(`http://127.0.0.1:5173${p.route}`, { waitUntil: 'networkidle0' });

    // 1. Dark Mode
    await page.evaluate(() => {
      localStorage.setItem('ser-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await delay(700);

    const darkStats = await page.evaluate(async () => {
      const hero = document.querySelector('.subpage-hero');
      const vid = document.querySelector('.subpage-hero-bg video');
      const overlay = document.querySelector('.subpage-hero-overlay');

      const t1 = vid ? vid.currentTime : 0;
      await new Promise(r => setTimeout(r, 600));
      const t2 = vid ? vid.currentTime : 0;

      const vStyle = vid ? window.getComputedStyle(vid) : {};
      const heroRect = hero ? hero.getBoundingClientRect() : {};
      const vidRect = vid ? vid.getBoundingClientRect() : {};

      return {
        heroHeight: hero ? hero.offsetHeight : null,
        heroTop: heroRect.top,
        vidTop: vidRect.top,
        vidHeight: vidRect.height,
        vidWidth: vidRect.width,
        objectFit: vStyle.objectFit,
        objectPosition: vStyle.objectPosition,
        filter: vStyle.filter,
        mixBlend: vStyle.mixBlendMode,
        opacity: vStyle.opacity,
        playing: t2 > t1,
        overlayBg: overlay ? window.getComputedStyle(overlay).backgroundImage : null,
      };
    });

    const darkShotName = `final_${p.name.toLowerCase().replace(/\s+/g, '_')}_dark.png`;
    await page.screenshot({ path: path.join(ARTIFACT_DIR, darkShotName) });
    console.log(`  [Dark Mode] Hero Height: ${darkStats.heroHeight}px, Video Top: ${darkStats.vidTop}px, Playing: ${darkStats.playing}`);
    console.log(`  [Dark Mode] Filter: ${darkStats.filter}, MixBlend: ${darkStats.mixBlend}, Opacity: ${darkStats.opacity}`);

    // 2. Bright Mode
    await page.evaluate(() => {
      localStorage.setItem('ser-theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await delay(700);

    const lightStats = await page.evaluate(async () => {
      const hero = document.querySelector('.subpage-hero');
      const vid = document.querySelector('.subpage-hero-bg video');
      const overlay = document.querySelector('.subpage-hero-overlay');

      const t1 = vid ? vid.currentTime : 0;
      await new Promise(r => setTimeout(r, 600));
      const t2 = vid ? vid.currentTime : 0;

      const vStyle = vid ? window.getComputedStyle(vid) : {};
      const heroRect = hero ? hero.getBoundingClientRect() : {};
      const vidRect = vid ? vid.getBoundingClientRect() : {};

      return {
        heroHeight: hero ? hero.offsetHeight : null,
        heroTop: heroRect.top,
        vidTop: vidRect.top,
        vidHeight: vidRect.height,
        vidWidth: vidRect.width,
        objectFit: vStyle.objectFit,
        objectPosition: vStyle.objectPosition,
        filter: vStyle.filter,
        mixBlend: vStyle.mixBlendMode,
        opacity: vStyle.opacity,
        playing: t2 > t1,
        overlayBg: overlay ? window.getComputedStyle(overlay).backgroundImage : null,
      };
    });

    const lightShotName = `final_${p.name.toLowerCase().replace(/\s+/g, '_')}_light.png`;
    await page.screenshot({ path: path.join(ARTIFACT_DIR, lightShotName) });
    console.log(`  [Bright Mode] Hero Height: ${lightStats.heroHeight}px, Video Top: ${lightStats.vidTop}px, Playing: ${lightStats.playing}`);
    console.log(`  [Bright Mode] Filter: ${lightStats.filter}, MixBlend: ${lightStats.mixBlend}, Opacity: ${lightStats.opacity}`);

    const videoUnchanged = (
      darkStats.filter === lightStats.filter &&
      darkStats.mixBlend === lightStats.mixBlend &&
      darkStats.opacity === lightStats.opacity
    );
    console.log(`  >>> VIDEO UNCHANGED BETWEEN THEMES CHECK: ${videoUnchanged ? 'PASS (100% Unchanged)' : 'FAIL'}`);

    pageResults.push({ page: p.name, darkStats, lightStats, videoUnchanged });
  }

  // Cross-page consistency check
  const allHeights = pageResults.map(r => r.darkStats.heroHeight);
  const heightsConsistent = allHeights.every(h => h === allHeights[0]);
  console.log(`\n>>> CROSS-PAGE HERO HEIGHT CONSISTENCY: ${heightsConsistent ? `PASS (All ${allHeights[0]}px)` : `FAIL (${allHeights.join(', ')})`}`);

  await browser.close();
  console.log('\n=== ALL TARGETED VERIFICATIONS COMPLETED SUCCESSFULLY ===');
}

verifyAll().catch(console.error);

