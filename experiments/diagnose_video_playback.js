const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function diagnose() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const pagesToTest = [
    { name: 'Analyze', url: 'http://127.0.0.1:5173/analyze' },
    { name: 'Evaluation', url: 'http://127.0.0.1:5173/evaluation' },
    { name: 'Model Info', url: 'http://127.0.0.1:5173/model' },
    { name: 'About', url: 'http://127.0.0.1:5173/about' },
    { name: 'FAQ', url: 'http://127.0.0.1:5173/faq' },
  ];

  console.log('=== DIAGNOSING VIDEO PLAYBACK & COMPUTED STYLES ===\n');

  for (const p of pagesToTest) {
    console.log(`Checking ${p.name} (${p.url})...`);
    await page.goto(p.url, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));

    const videoState = await page.evaluate(async () => {
      const v = document.querySelector('.subpage-hero-bg video') || document.querySelector('video');
      if (!v) return { found: false };

      const time1 = v.currentTime;
      await new Promise(r => setTimeout(r, 600));
      const time2 = v.currentTime;

      const hero = document.querySelector('.subpage-hero');
      const overlay = document.querySelector('.subpage-hero-overlay');

      return {
        found: true,
        currentSrc: v.currentSrc,
        readyState: v.readyState,
        paused: v.paused,
        muted: v.muted,
        loop: v.loop,
        autoplay: v.autoplay,
        time1,
        time2,
        advancing: time2 > time1,
        heroBg: hero ? window.getComputedStyle(hero).backgroundColor : null,
        heroColor: hero ? window.getComputedStyle(hero).color : null,
        videoOpacity: window.getComputedStyle(v).opacity,
        videoMixBlend: window.getComputedStyle(v).mixBlendMode,
        videoFilter: window.getComputedStyle(v).filter,
        overlayBg: overlay ? window.getComputedStyle(overlay).backgroundImage : null,
        overlayColor: overlay ? window.getComputedStyle(overlay).backgroundColor : null,
      };
    });

    console.log(JSON.stringify(videoState, null, 2));
    console.log('--------------------------------------------------');
  }

  await browser.close();
}

diagnose().catch(console.error);

