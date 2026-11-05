const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';

async function testBlends() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  // Let's test different CSS variations on the live page in Light Mode
  const variations = [
    {
      name: 'light_blend_invert_multiply',
      css: `
        .subpage-hero {
          background-color: var(--color-bg) !important;
          color: var(--color-text) !important;
          border-bottom: 1px solid var(--color-border) !important;
        }
        .subpage-hero-bg {
          background-color: transparent !important;
        }
        .subpage-hero-bg video {
          filter: invert(1) contrast(1.2) brightness(0.95) !important;
          mix-blend-mode: multiply !important;
          opacity: 0.35 !important;
          mask-image: linear-gradient(to bottom, black 60%, transparent 100%) !important;
          -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%) !important;
        }
        .subpage-hero-overlay {
          background: linear-gradient(180deg, rgba(255, 254, 250, 0.2) 0%, rgba(255, 254, 250, 0.85) 100%) !important;
        }
        .subpage-kicker {
          color: var(--color-primary) !important;
          border-color: rgba(196, 83, 110, 0.3) !important;
        }
        .subpage-title {
          color: var(--color-text) !important;
          text-shadow: none !important;
        }
        .subpage-desc {
          color: var(--color-muted) !important;
        }
      `
    },
    {
      name: 'light_blend_soft_light',
      css: `
        .subpage-hero {
          background-color: var(--color-bg) !important;
          color: var(--color-text) !important;
          border-bottom: 1px solid var(--color-border) !important;
        }
        .subpage-hero-bg {
          background-color: transparent !important;
        }
        .subpage-hero-bg video {
          filter: contrast(1.1) brightness(1.2) !important;
          mix-blend-mode: color-burn !important;
          opacity: 0.25 !important;
          mask-image: linear-gradient(to bottom, black 65%, transparent 100%) !important;
          -webkit-mask-image: linear-gradient(to bottom, black 65%, transparent 100%) !important;
        }
        .subpage-hero-overlay {
          background: linear-gradient(180deg, transparent 0%, rgba(255, 254, 250, 0.7) 100%) !important;
        }
        .subpage-kicker {
          color: var(--color-primary) !important;
          border-color: rgba(196, 83, 110, 0.3) !important;
        }
        .subpage-title {
          color: var(--color-text) !important;
          text-shadow: none !important;
        }
        .subpage-desc {
          color: var(--color-muted) !important;
        }
      `
    },
    {
      name: 'light_blend_luminosity_tint',
      css: `
        .subpage-hero {
          background: linear-gradient(180deg, rgba(78, 93, 159, 0.06) 0%, var(--color-bg) 100%) !important;
          color: var(--color-text) !important;
          border-bottom: 1px solid var(--color-border) !important;
        }
        .subpage-hero-bg {
          background-color: transparent !important;
        }
        .subpage-hero-bg video {
          filter: invert(0.9) hue-rotate(190deg) contrast(1.3) !important;
          mix-blend-mode: multiply !important;
          opacity: 0.38 !important;
          mask-image: linear-gradient(to bottom, black 60%, transparent 100%) !important;
          -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%) !important;
        }
        .subpage-hero-overlay {
          background: radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(255, 254, 250, 0.6) 90%) !important;
        }
        .subpage-kicker {
          color: var(--color-primary) !important;
          border-color: rgba(196, 83, 110, 0.3) !important;
        }
        .subpage-title {
          color: var(--color-text) !important;
          text-shadow: none !important;
        }
        .subpage-desc {
          color: var(--color-muted) !important;
        }
      `
    }
  ];

  for (const v of variations) {
    await page.evaluate((cssText) => {
      let styleTag = document.getElementById('test-blend-style');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'test-blend-style';
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = cssText;
    }, v.css);

    await new Promise(r => setTimeout(r, 600));
    const shotPath = path.join(ARTIFACT_DIR, `test_${v.name}.png`);
    await page.screenshot({ path: shotPath });
    console.log(`Saved ${shotPath}`);
  }

  // Also test Dark Mode with screen blend
  await page.evaluate(() => {
    localStorage.setItem('ser-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    const styleTag = document.getElementById('test-blend-style');
    if (styleTag) {
      styleTag.textContent = `
        .subpage-hero {
          background: var(--color-bg) !important;
          color: var(--color-text) !important;
          border-bottom: 1px solid var(--color-border) !important;
        }
        .subpage-hero-bg {
          background-color: transparent !important;
        }
        .subpage-hero-bg video {
          filter: contrast(1.15) brightness(1.1) !important;
          mix-blend-mode: screen !important;
          opacity: 0.65 !important;
          mask-image: linear-gradient(to bottom, black 70%, transparent 100%) !important;
          -webkit-mask-image: linear-gradient(to bottom, black 70%, transparent 100%) !important;
        }
        .subpage-hero-overlay {
          background: radial-gradient(circle at 50% 40%, rgba(91, 22, 38, 0.15) 0%, transparent 70%),
                      linear-gradient(180deg, transparent 40%, var(--color-bg) 100%) !important;
        }
        .subpage-kicker {
          color: var(--color-hero-tone) !important;
        }
        .subpage-title {
          color: var(--color-text) !important;
        }
        .subpage-desc {
          color: var(--color-muted) !important;
        }
      `;
    }
  });

  await new Promise(r => setTimeout(r, 600));
  const darkShotPath = path.join(ARTIFACT_DIR, `test_dark_screen_blend.png`);
  await page.screenshot({ path: darkShotPath });
  console.log(`Saved ${darkShotPath}`);

  await browser.close();
}

testBlends().catch(console.error);

