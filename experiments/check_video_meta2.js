const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIDEOS = [
  { page: 'Analyze', file: '/media/signals.mp4' },
  { page: 'Evaluation', file: '/media/observatory.mp4' },
  { page: 'Model Info', file: '/media/orbit-network.mp4' },
  { page: 'About', file: '/media/research-abstract.mp4' },
  { page: 'FAQ', file: '/media/light-rays.mp4' },
];

async function check() {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
  const page = await browser.newPage();
  for (const v of VIDEOS) {
    await page.setContent(`<video src="http://127.0.0.1:5173${v.file}" autoplay muted></video>`);
    await page.waitForFunction(() => {
      const vid = document.querySelector('video');
      return vid && vid.videoWidth > 0;
    }, { timeout: 10000 }).catch(() => {});
    const meta = await page.evaluate(() => {
      const vid = document.querySelector('video');
      return { width: vid.videoWidth, height: vid.videoHeight, duration: vid.duration };
    });
    console.log(`${v.page} (${v.file}): ${meta.width}x${meta.height}, duration: ${meta.duration}s`);
  }
  await browser.close();
}

check().catch(console.error);

