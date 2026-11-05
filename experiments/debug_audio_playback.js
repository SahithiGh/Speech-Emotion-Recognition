const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEST_AUDIO_PATH = path.resolve('external data/sample_audio/real_voice.wav');

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  
  const failedRequests = [];
  page.on('requestfailed', req => {
    failedRequests.push({ url: req.url(), failure: req.failure() });
  });

  await page.goto('http://localhost:5173/analyze', { waitUntil: 'networkidle2' });

  const fileInput = await page.$('#multi-file-input');
  await fileInput.uploadFile(TEST_AUDIO_PATH);
  await new Promise(r => setTimeout(r, 1000));

  const analyzeBtn = await page.$('.btn-action-primary');
  await analyzeBtn.click();
  await page.waitForSelector('.workspace-results-section', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  const audioState = await page.evaluate(async () => {
    const audio = document.querySelector('audio');
    if (!audio) return { error: 'No audio element found' };

    let playError = null;
    try {
      await audio.play();
      audio.pause();
    } catch (e) {
      playError = e.message;
    }

    return {
      src: audio.src,
      currentSrc: audio.currentSrc,
      duration: audio.duration,
      readyState: audio.readyState,
      networkState: audio.networkState,
      paused: audio.paused,
      muted: audio.muted,
      audioError: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
      playError
    };
  });

  console.log('Audio State:', JSON.stringify(audioState, null, 2));
  console.log('\nFailed Requests:', JSON.stringify(failedRequests, null, 2));
  console.log('\nConsole Logs:', consoleLogs);

  await browser.close();
}

run().catch(err => {
  console.error('Debug script error:', err);
  process.exit(1);
});

