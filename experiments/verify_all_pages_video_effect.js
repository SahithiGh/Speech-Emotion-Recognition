const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';

const PAGES = [
  { name: 'analyze', route: '/analyze', expectedVideo: 'signals.mp4' },
  { name: 'evaluation', route: '/evaluation', expectedVideo: 'observatory.mp4' },
  { name: 'model', route: '/model', expectedVideo: 'orbit-network.mp4' },
  { name: 'about', route: '/about', expectedVideo: 'research-abstract.mp4' },
  { name: 'faq', route: '/faq', expectedVideo: 'light-rays.mp4' },
];

async function run() {
  console.log('=== VERIFYING BACKGROUND VIDEO & THEME GLASS EFFECT ACROSS ALL PAGES ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const results = [];

  for (const p of PAGES) {
    console.log(`\n>>> Testing Page: ${p.name.toUpperCase()} (${p.route})`);

    // --- 1. LIGHT THEME (Desktop 1440x950) ---
    await page.setViewport({ width: 1440, height: 950 });
    await page.goto(`http://127.0.0.1:5173${p.route}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      localStorage.setItem('ser-theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await new Promise(r => setTimeout(r, 1200));

    // Verify video playback and properties in Light Mode
    const lightCheck = await page.evaluate(async () => {
      const v = document.querySelector('.subpage-hero-bg video') || document.querySelector('video');
      if (!v) return { found: false };

      const t1 = v.currentTime;
      await new Promise(r => setTimeout(r, 800));
      const t2 = v.currentTime;

      const hero = document.querySelector('.subpage-hero');
      const heroStyle = hero ? window.getComputedStyle(hero) : null;
      const vStyle = window.getComputedStyle(v);
      const bodyStyle = window.getComputedStyle(document.body);

      return {
        found: true,
        src: v.currentSrc,
        paused: v.paused,
        muted: v.muted,
        loop: v.loop,
        autoplay: v.autoplay,
        time1: t1,
        time2: t2,
        advancing: t2 > t1,
        bodyBg: bodyStyle.backgroundColor,
        heroBg: heroStyle ? heroStyle.backgroundColor : null,
        heroColor: heroStyle ? heroStyle.color : null,
        videoMixBlend: vStyle.mixBlendMode,
        videoOpacity: vStyle.opacity,
        videoFilter: vStyle.filter,
      };
    });

    const lightShot = path.join(ARTIFACT_DIR, `page_${p.name}_light_desktop.png`);
    await page.screenshot({ path: lightShot });
    console.log(`  [Light Mode] Video playing: ${lightCheck.advancing} (${lightCheck.time1.toFixed(2)}s -> ${lightCheck.time2.toFixed(2)}s)`);
    console.log(`  [Light Mode] MixBlend: ${lightCheck.videoMixBlend}, Opacity: ${lightCheck.videoOpacity}`);
    console.log(`  [Light Mode] BodyBg: ${lightCheck.bodyBg}, HeroBg: ${lightCheck.heroBg}, Text: ${lightCheck.heroColor}`);

    // --- 2. DARK THEME (Desktop 1440x950) ---
    await page.evaluate(() => {
      localStorage.setItem('ser-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await new Promise(r => setTimeout(r, 1200));

    const darkCheck = await page.evaluate(async () => {
      const v = document.querySelector('.subpage-hero-bg video') || document.querySelector('video');
      if (!v) return { found: false };

      const t1 = v.currentTime;
      await new Promise(r => setTimeout(r, 800));
      const t2 = v.currentTime;

      const hero = document.querySelector('.subpage-hero');
      const heroStyle = hero ? window.getComputedStyle(hero) : null;
      const vStyle = window.getComputedStyle(v);
      const bodyStyle = window.getComputedStyle(document.body);

      return {
        found: true,
        src: v.currentSrc,
        paused: v.paused,
        muted: v.muted,
        loop: v.loop,
        autoplay: v.autoplay,
        time1: t1,
        time2: t2,
        advancing: t2 > t1,
        bodyBg: bodyStyle.backgroundColor,
        heroBg: heroStyle ? heroStyle.backgroundColor : null,
        heroColor: heroStyle ? heroStyle.color : null,
        videoMixBlend: vStyle.mixBlendMode,
        videoOpacity: vStyle.opacity,
        videoFilter: vStyle.filter,
      };
    });

    const darkShot = path.join(ARTIFACT_DIR, `page_${p.name}_dark_desktop.png`);
    await page.screenshot({ path: darkShot });
    console.log(`  [Dark Mode] Video playing: ${darkCheck.advancing} (${darkCheck.time1.toFixed(2)}s -> ${darkCheck.time2.toFixed(2)}s)`);
    console.log(`  [Dark Mode] MixBlend: ${darkCheck.videoMixBlend}, Opacity: ${darkCheck.videoOpacity}`);
    console.log(`  [Dark Mode] BodyBg: ${darkCheck.bodyBg}, HeroBg: ${darkCheck.heroBg}, Text: ${darkCheck.heroColor}`);

    // --- 3. MOBILE (390x844) ---
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await new Promise(r => setTimeout(r, 600));
    const mobileShot = path.join(ARTIFACT_DIR, `page_${p.name}_mobile.png`);
    await page.screenshot({ path: mobileShot });
    console.log(`  [Mobile] Captured ${mobileShot}`);

    results.push({
      page: p.name,
      route: p.route,
      video: p.expectedVideo,
      light: lightCheck,
      dark: darkCheck,
    });
  }

  await browser.close();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'video_verification_summary.json'), JSON.stringify(results, null, 2));
  console.log('\n=== ALL VERIFICATIONS COMPLETE ===');
}

run().catch(console.error);

