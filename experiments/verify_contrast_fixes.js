const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\JAI-SREE-RAM\\.gemini\\antigravity\\brain\\cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';
const TEST_AUDIO_PATH = path.resolve('external data/sample_audio/real_voice.wav');

function parseRgb(colorStr) {
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return { r: 255, g: 255, b: 255, a: 1 };
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    a: match[4] !== undefined ? parseFloat(match[4]) : 1
  };
}

function getLuminance({ r, g, b }) {
  const sRGB = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function getContrast(rgb1, rgb2) {
  const l1 = getLuminance(rgb1);
  const l2 = getLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function blendRgb(fg, bg) {
  const a = fg.a !== undefined ? fg.a : 1;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1
  };
}

async function testTheme(browser, targetTheme) {
  console.log(`\n======================================================`);
  console.log(`EVALUATING ${targetTheme.toUpperCase()} MODE`);
  console.log(`======================================================`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Pre-seed theme in localStorage before page mounts
  await page.evaluateOnNewDocument((t) => {
    localStorage.setItem('ser-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, targetTheme);

  console.log('Navigating to http://localhost:5173/analyze...');
  await page.goto('http://localhost:5173/analyze', { waitUntil: 'networkidle2' });

  // Ensure theme attribute is present
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
  }, targetTheme);

  // Upload test audio
  const fileInput = await page.$('#multi-file-input');
  if (fileInput) {
    await fileInput.uploadFile(TEST_AUDIO_PATH);
    console.log('Uploaded audio file:', TEST_AUDIO_PATH);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Click Analyze Files button
  const analyzeBtn = await page.$('.btn-action-primary');
  if (analyzeBtn) {
    console.log('Clicking Analyze Files...');
    await analyzeBtn.click();
    await page.waitForSelector('.workspace-results-section', { timeout: 30000 });
    console.log('Analysis completed! Results section rendered.');
    await new Promise(r => setTimeout(r, 2000));
  }

  // Inspect computed styles
  const styles = await page.evaluate(() => {
    function getInfo(selector, bgSelector = null) {
      const el = document.querySelector(selector);
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      let bg = 'rgb(255, 255, 255)';

      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') {
        bg = cs.backgroundColor;
      } else if (bgSelector) {
        const bgEl = document.querySelector(bgSelector);
        if (bgEl) bg = window.getComputedStyle(bgEl).backgroundColor;
      } else if (el.parentElement) {
        let curr = el.parentElement;
        while (curr) {
          const b = window.getComputedStyle(curr).backgroundColor;
          if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') {
            bg = b;
            break;
          }
          curr = curr.parentElement;
        }
      }
      return {
        text: el.innerText ? el.innerText.trim().slice(0, 45) : '',
        color: cs.color,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        backgroundColor: cs.backgroundColor,
        resolvedBg: bg
      };
    }

    return {
      transcriptHeading: getInfo('.feature-card-title', '.result-feature-card'),
      alignBadge: getInfo('.transcript-align-badge', '.result-feature-card'),
      transcriptBox: getInfo('.transcript-box'),
      transcriptQuote: getInfo('.transcript-quote', '.transcript-box'),
      interactiveHint: getInfo('.interactive-hint', '.transcript-box'),
      segTimeBtn: getInfo('.seg-time-btn', '.transcript-box'),
      wordPillBtn: getInfo('.word-pill-btn', '.transcript-box'),
      wordTs: getInfo('.word-ts', '.transcript-box'),
      signalBox: getInfo('.signal-box', '.result-feature-card'),
      signalLabel: getInfo('.signal-label', '.signal-box'),
      signalValEmotion: getInfo('.signal-val.emotion-sad', '.signal-box'),
      signalValWording: getInfo('.signal-box:nth-child(2) .signal-val', '.signal-box:nth-child(2)'),
      consistencyHeadline: getInfo('.consistency-headline', '.result-feature-card'),
      consistencyExplanation: getInfo('.consistency-explanation', '.result-feature-card'),
      ethicalNote: getInfo('.ethical-guardrail-note', '.result-feature-card')
    };
  });

  console.log('\n--- COMPUTED STYLES & CONTRAST RATIOS ---');
  const cardBgRgb = targetTheme === 'dark' ? { r: 18, g: 16, b: 13, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  const transcriptBoxBase = targetTheme === 'dark' ? { r: 11, g: 19, b: 43, a: 1 } : blendRgb({ r: 11, g: 19, b: 43, a: 0.94 }, cardBgRgb);

  for (const [key, val] of Object.entries(styles)) {
    if (!val) {
      console.log(`[${key}] Element not found`);
      continue;
    }
    const fgRgb = parseRgb(val.color);
    let rawBgRgb = parseRgb(val.resolvedBg || val.backgroundColor);

    // Determine appropriate base for translucent backgrounds
    let effectiveBgRgb;
    if (['transcriptQuote', 'interactiveHint', 'segTimeBtn', 'wordPillBtn', 'wordTs'].includes(key)) {
      effectiveBgRgb = rawBgRgb.a < 1 ? blendRgb(rawBgRgb, transcriptBoxBase) : rawBgRgb;
    } else {
      effectiveBgRgb = rawBgRgb.a < 1 ? blendRgb(rawBgRgb, cardBgRgb) : rawBgRgb;
    }

    const contrast = getContrast(fgRgb, effectiveBgRgb);
    const isLargeText = parseFloat(val.fontSize) >= 18 || (parseFloat(val.fontSize) >= 14 && parseInt(val.fontWeight) >= 700);
    const minRequired = isLargeText ? 3.0 : 4.5;
    const status = contrast >= minRequired ? `PASS (req >= ${minRequired}:1)` : `FAIL (req >= ${minRequired}:1)`;

    console.log(`[${key}] "${val.text}"`);
    console.log(`   color: ${val.color} | bg: rgb(${effectiveBgRgb.r},${effectiveBgRgb.g},${effectiveBgRgb.b})`);
    console.log(`   Contrast: ${contrast.toFixed(2)}:1 -> ${status}\n`);
  }

  // Scroll to results section
  await page.evaluate(() => {
    const el = document.querySelector('.workspace-results-section');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await new Promise(r => setTimeout(r, 600));

  // Desktop screenshot
  const resultsDesktop = await page.$('.workspace-results-section');
  if (resultsDesktop) {
    const screenshotDesktop = path.join(ARTIFACTS_DIR, `contrast_verification_${targetTheme}_desktop.png`);
    await resultsDesktop.screenshot({ path: screenshotDesktop });
    console.log(`Saved screenshot: ${screenshotDesktop}`);
  }

  // Mobile screenshot
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await new Promise(r => setTimeout(r, 600));
  const resultsMobile = await page.$('.workspace-results-section');
  if (resultsMobile) {
    const screenshotMobile = path.join(ARTIFACTS_DIR, `contrast_verification_${targetTheme}_mobile.png`);
    await resultsMobile.screenshot({ path: screenshotMobile });
    console.log(`Saved screenshot: ${screenshotMobile}`);
  }

  await page.close();
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  await testTheme(browser, 'light');
  await testTheme(browser, 'dark');

  await browser.close();
  console.log('\nVerification across Light and Dark themes completed successfully!');
}

run().catch(err => {
  console.error('Error during contrast verification:', err);
  process.exit(1);
});
