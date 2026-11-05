const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIDEOS = [
  { page: 'Analyze', file: '/media/signals.mp4' },
  { page: 'Evaluation', file: '/media/observatory.mp4' },
  { page: 'Model Info', file: '/media/orbit-network.mp4' },
  { page: 'About', file: '/media/research-abstract.mp4' },
  { page: 'FAQ', file: '/media/light-rays.mp4' },
];

async function checkVideos() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  for (const v of VIDEOS) {
    await page.goto(`http://127.0.0.1:5173${v.file}`);
    const meta = await page.evaluate(() => {
      const vid = document.querySelector('video');
      return vid ? { width: vid.videoWidth, height: vid.videoHeight, duration: vid.duration } : null;
    });
    console.log(`${v.page} (${v.file}):`, meta);
  }
  await browser.close();
}

checkVideos().catch(console.error);

