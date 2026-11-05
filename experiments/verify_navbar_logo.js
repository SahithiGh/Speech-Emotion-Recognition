const fs = require('fs');
const puppeteer = require('puppeteer-core');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('=== VERIFYING NAVBAR LOGO APPEARANCE & VISIBILITY ===');

  // 1. Analyze page in Light Mode
  await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('ser-theme', 'light');
  });
  await new Promise(r => setTimeout(r, 800));

  // Check navbar dimensions and alignment
  const navMetricsLight = await page.evaluate(() => {
    const brand = document.querySelector('.site-header .brand');
    const logoWrap = brand?.querySelector('.ser-brand-logo-wrap');
    const logoImg = logoWrap?.querySelector('.ser-logo-light');
    const brandName = brand?.querySelector('.brand-name');

    const brandRect = brand?.getBoundingClientRect();
    const logoRect = logoWrap?.getBoundingClientRect();
    const textRect = brandName?.getBoundingClientRect();

    return {
      brandHeight: brandRect?.height,
      logoWidth: logoRect?.width,
      logoHeight: logoRect?.height,
      brandTextY: textRect?.top + textRect?.height / 2,
      logoCenterY: logoRect?.top + logoRect?.height / 2,
      gap: textRect?.left - logoRect?.right
    };
  });

  console.log('\n[LIGHT MODE METRICS]:', JSON.stringify(navMetricsLight, null, 2));

  // Capture close-up of brand header in light mode
  const headerEl = await page.$('.site-header .wrap.bar');
  if (headerEl) {
    const brandEl = await page.$('.site-header .brand');
    if (brandEl) {
      const shotPath = path.join(ARTIFACT_DIR, '01_navbar_brand_light_38px.png');
      await brandEl.screenshot({ path: shotPath });
      console.log('Saved Light mode brand lockup screenshot:', shotPath);
    }
  }

  // Also capture full navbar
  const navShotLight = path.join(ARTIFACT_DIR, '02_full_navbar_light.png');
  await headerEl.screenshot({ path: navShotLight });
  console.log('Saved full navbar light screenshot:', navShotLight);

  // 2. Dark Mode
  console.log('\nSwitching to Dark Mode...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('ser-theme', 'dark');
  });
  await new Promise(r => setTimeout(r, 800));

  const navMetricsDark = await page.evaluate(() => {
    const brand = document.querySelector('.site-header .brand');
    const logoWrap = brand?.querySelector('.ser-brand-logo-wrap');
    const logoImg = logoWrap?.querySelector('.ser-logo-dark');
    const brandName = brand?.querySelector('.brand-name');

    const brandRect = brand?.getBoundingClientRect();
    const logoRect = logoWrap?.getBoundingClientRect();
    const textRect = brandName?.getBoundingClientRect();

    return {
      brandHeight: brandRect?.height,
      logoWidth: logoRect?.width,
      logoHeight: logoRect?.height,
      brandTextY: textRect?.top + textRect?.height / 2,
      logoCenterY: logoRect?.top + logoRect?.height / 2,
      gap: textRect?.left - logoRect?.right
    };
  });
  console.log('\n[DARK MODE METRICS]:', JSON.stringify(navMetricsDark, null, 2));

  const brandElDark = await page.$('.site-header .brand');
  if (brandElDark) {
    const shotPath = path.join(ARTIFACT_DIR, '03_navbar_brand_dark_38px.png');
    await brandElDark.screenshot({ path: shotPath });
    console.log('Saved Dark mode brand lockup screenshot:', shotPath);
  }

  const navShotDark = path.join(ARTIFACT_DIR, '04_full_navbar_dark.png');
  await headerEl.screenshot({ path: navShotDark });
  console.log('Saved full navbar dark screenshot:', navShotDark);

  // 3. Home page (over hero with video)
  console.log('\nNavigating to Home Page (Over-Hero Video Header)...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  const homeHeader = await page.$('.site-header');
  if (homeHeader) {
    const homeShot = path.join(ARTIFACT_DIR, '05_navbar_over_hero_video.png');
    await homeHeader.screenshot({ path: homeShot });
    console.log('Saved Home over-hero navbar screenshot:', homeShot);
  }

  // 4. Mobile Viewport (390px)
  console.log('\nTesting Mobile Viewport (390px)...');
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));

  const mobileHeader = await page.$('.site-header');
  if (mobileHeader) {
    const mobileShot = path.join(ARTIFACT_DIR, '06_mobile_navbar_390px.png');
    await mobileHeader.screenshot({ path: mobileShot });
    console.log('Saved Mobile navbar screenshot:', mobileShot);
  }

  await browser.close();
  console.log('\n=== NAVBAR LOGO VERIFICATION COMPLETE ===');
})();

