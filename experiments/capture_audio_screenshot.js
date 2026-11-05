const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\JAI-SREE-RAM\\.gemini\\antigravity\\brain\\cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';
const TEST_AUDIO_PATH = path.resolve('external data/sample_audio/Noisy1.wav');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('http://localhost:5173/analyze', { waitUntil: 'networkidle2' });

  const fileInput = await page.$('#multi-file-input');
  await fileInput.uploadFile(TEST_AUDIO_PATH);
  await new Promise(r => setTimeout(r, 800));

  const analyzeBtn = await page.$('.btn-action-primary');
  await analyzeBtn.click();
  await page.waitForSelector('.workspace-results-section', { timeout: 35000 });
  await new Promise(r => setTimeout(r, 1500));

  // Play audio slightly to show progress
  await page.evaluate(async () => {
    const audio = document.querySelector('audio');
    if (audio) {
      audio.currentTime = 3.5;
    }
  });
  await new Promise(r => setTimeout(r, 500));

  const waveformModule = await page.$('.waveform-module');
  if (waveformModule) {
    const scPath = path.join(ARTIFACTS_DIR, 'audio_playback_waveform_verified.png');
    await waveformModule.screenshot({ path: scPath });
    console.log('Saved screenshot:', scPath);
  }

  await browser.close();
})();

