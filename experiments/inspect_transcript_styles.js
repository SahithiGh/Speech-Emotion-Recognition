const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  await page.goto('http://127.0.0.1:5173/analyze');
  
  // Test Light Mode
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await new Promise(r => setTimeout(r, 600));

  const fileInput = await page.$('#multi-file-input');
  await fileInput.uploadFile('backend_reference/Noisy1.wav');
  await new Promise(r => setTimeout(r, 800));

  const btn = await page.waitForSelector('.btn-action-primary');
  await btn.click();
  await page.waitForSelector('.status-pill.done', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 1200));

  const cs = el => el ? {
    tag: el.tagName,
    text: el.innerText ? el.innerText.slice(0, 30) : null,
    color: window.getComputedStyle(el).color,
    bg: window.getComputedStyle(el).backgroundColor,
    border: window.getComputedStyle(el).borderColor
  } : null;

  const lightStyles = await page.evaluate(() => {
    return {
      card: window.getComputedStyle(document.querySelector('.result-feature-card')).backgroundColor,
      title: window.getComputedStyle(document.querySelector('.feature-card-title')).color,
      badge: {
        color: window.getComputedStyle(document.querySelector('.transcript-align-badge')).color,
        bg: window.getComputedStyle(document.querySelector('.transcript-align-badge')).backgroundColor,
      },
      box: {
        color: window.getComputedStyle(document.querySelector('.transcript-box')).color,
        bg: window.getComputedStyle(document.querySelector('.transcript-box')).backgroundColor,
      },
      quote: {
        color: window.getComputedStyle(document.querySelector('.transcript-quote')).color,
      },
      hint: {
        color: window.getComputedStyle(document.querySelector('.interactive-hint')).color,
      },
      segBtn: {
        color: window.getComputedStyle(document.querySelector('.seg-time-btn')).color,
        bg: window.getComputedStyle(document.querySelector('.seg-time-btn')).backgroundColor,
      },
      wordBtn: {
        color: window.getComputedStyle(document.querySelector('.word-pill-btn')).color,
        bg: window.getComputedStyle(document.querySelector('.word-pill-btn')).backgroundColor,
      },
      wordTs: {
        color: window.getComputedStyle(document.querySelector('.word-ts')).color,
      }
    };
  });

  console.log('--- LIGHT MODE COMPUTED STYLES ---');
  console.log(JSON.stringify(lightStyles, null, 2));

  await page.screenshot({ path: 'experiments/transcript_light_before.png' });

  // Test Dark Mode
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await new Promise(r => setTimeout(r, 600));

  const darkStyles = await page.evaluate(() => {
    return {
      card: window.getComputedStyle(document.querySelector('.result-feature-card')).backgroundColor,
      title: window.getComputedStyle(document.querySelector('.feature-card-title')).color,
      badge: {
        color: window.getComputedStyle(document.querySelector('.transcript-align-badge')).color,
        bg: window.getComputedStyle(document.querySelector('.transcript-align-badge')).backgroundColor,
      },
      box: {
        color: window.getComputedStyle(document.querySelector('.transcript-box')).color,
        bg: window.getComputedStyle(document.querySelector('.transcript-box')).backgroundColor,
      },
      quote: {
        color: window.getComputedStyle(document.querySelector('.transcript-quote')).color,
      },
      hint: {
        color: window.getComputedStyle(document.querySelector('.interactive-hint')).color,
      },
      segBtn: {
        color: window.getComputedStyle(document.querySelector('.seg-time-btn')).color,
        bg: window.getComputedStyle(document.querySelector('.seg-time-btn')).backgroundColor,
      },
      wordBtn: {
        color: window.getComputedStyle(document.querySelector('.word-pill-btn')).color,
        bg: window.getComputedStyle(document.querySelector('.word-pill-btn')).backgroundColor,
      },
      wordTs: {
        color: window.getComputedStyle(document.querySelector('.word-ts')).color,
      }
    };
  });

  console.log('\n--- DARK MODE COMPUTED STYLES ---');
  console.log(JSON.stringify(darkStyles, null, 2));

  await page.screenshot({ path: 'experiments/transcript_dark_before.png' });

  await browser.close();
})();

