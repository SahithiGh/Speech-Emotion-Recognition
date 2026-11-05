const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const PAGES = ['/analyze', '/evaluation', '/model', '/about', '/faq'];

async function measureHeroes() {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  for (const route of PAGES) {
    await page.goto(`http://127.0.0.1:5173${route}`, { waitUntil: 'networkidle0' });
    const metrics = await page.evaluate(() => {
      const hero = document.querySelector('.subpage-hero');
      const vid = document.querySelector('.subpage-hero-bg video');
      const inner = document.querySelector('.subpage-hero-inner');
      return {
        heroHeight: hero ? hero.offsetHeight : null,
        videoHeight: vid ? vid.offsetHeight : null,
        videoWidth: vid ? vid.offsetWidth : null,
        videoTop: vid ? vid.getBoundingClientRect().top : null,
        innerHeight: inner ? inner.offsetHeight : null,
      };
    });
    console.log(`${route}:`, metrics);
  }
  await browser.close();
}

measureHeroes().catch(console.error);

