const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';

async function inspectLayout() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });

  // Light Mode Layout
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await new Promise(r => setTimeout(r, 600));

  const metrics = await page.evaluate(() => {
    const hero = document.querySelector('.subpage-hero');
    const heroRect = hero ? hero.getBoundingClientRect() : null;
    const card = document.querySelector('.analysis-workspace-card');
    const cardRect = card ? card.getBoundingClientRect() : null;
    const nav = document.querySelector('.site-header');
    const navRect = nav ? nav.getBoundingClientRect() : null;

    return {
      navHeight: navRect ? navRect.height : null,
      heroTop: heroRect ? heroRect.top : null,
      heroHeight: heroRect ? heroRect.height : null,
      heroBottom: heroRect ? heroRect.bottom : null,
      cardTop: cardRect ? cardRect.top : null,
      gapBetweenHeroAndCard: cardRect && heroRect ? cardRect.top - heroRect.bottom : null,
      cardWidth: cardRect ? cardRect.width : null,
    };
  });

  console.log('Analyze Layout Metrics (Light Mode):', JSON.stringify(metrics, null, 2));

  // Let's also do a full-page screenshot of Analyze in Light & Dark mode
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_final_analyze_light_fullpage.png'), fullPage: false });

  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_final_analyze_dark_fullpage.png'), fullPage: false });

  await browser.close();
}

inspectLayout().catch(console.error);

