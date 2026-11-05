const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';

const VIDEOS = [
  { name: 'signals', file: '/media/signals.mp4' },
  { name: 'observatory', file: '/media/observatory.mp4' },
  { name: 'orbit-network', file: '/media/orbit-network.mp4' },
  { name: 'research-abstract', file: '/media/research-abstract.mp4' },
  { name: 'light-rays', file: '/media/light-rays.mp4' },
];

async function captureFrames() {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  for (const v of VIDEOS) {
    await page.setContent(`
      <body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;">
        <video src="http://127.0.0.1:5173${v.file}" autoplay muted style="width:100%;height:100%;object-fit:contain;"></video>
      </body>
    `);
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `raw_frame_${v.name}.png`) });
    console.log(`Saved raw_frame_${v.name}.png`);
  }
  await browser.close();
}

captureFrames().catch(console.error);

