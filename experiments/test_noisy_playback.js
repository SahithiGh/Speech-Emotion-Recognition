const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: "new",
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  page.on('console', msg => console.log('LOG:', msg.text()));
  page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure()));
  
  await page.goto('http://localhost:5173/analyze');
  const fileInput = await page.$('#multi-file-input');
  await fileInput.uploadFile(path.resolve('external data/sample_audio/Noisy1.wav'));
  await new Promise(r => setTimeout(r, 1000));
  
  const analyzeBtn = await page.$('.btn-action-primary');
  await analyzeBtn.click();
  await page.waitForSelector('.workspace-results-section', { timeout: 30000 });
  console.log('Result section ready, checking audio element...');
  
  const res = await page.evaluate(async () => {
    const audio = document.querySelector('audio');
    if (!audio) return { err: 'no audio' };
    return { 
      src: audio.src,
      currentSrc: audio.currentSrc,
      duration: audio.duration, 
      paused: audio.paused,
      readyState: audio.readyState,
      networkState: audio.networkState,
      audioErr: audio.error ? { code: audio.error.code, message: audio.error.message } : null 
    };
  });
  console.log('Noisy Audio Playback State:', JSON.stringify(res, null, 2));
  await browser.close();
})();

