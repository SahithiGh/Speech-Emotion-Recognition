const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve('experiments/phase8_screenshots');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testHeader() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  try {
    // 1. Desktop 1440px
    console.log('[1] Testing Desktop 1440px...');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:5173/analyze', { waitUntil: 'networkidle0' });
    await sleep(800);

    const d1440 = await page.evaluate(() => {
      const navHeader = document.querySelector('.mobile-menu-header');
      const closeBtn = document.querySelector('.mobile-close-btn');
      const menuBtn = document.querySelector('.menu-btn');
      const badge = document.querySelector('.badge');
      const navLinks = Array.from(document.querySelectorAll('.site-nav .nav-link')).map(a => a.textContent.trim());
      
      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      };

      return {
        navHeaderVisible: isVisible(navHeader),
        closeBtnVisible: isVisible(closeBtn),
        menuBtnVisible: isVisible(menuBtn),
        badgeText: badge ? badge.textContent.trim() : null,
        badgeVisible: isVisible(badge),
        navLinks
      };
    });
    console.log('Desktop 1440 Check:', d1440);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'header_desktop_1440.png') });

    // Assertions for Desktop
    if (d1440.navHeaderVisible) throw new Error('FAIL: mobile-menu-header visible on desktop 1440!');
    if (d1440.closeBtnVisible) throw new Error('FAIL: close-btn visible on desktop 1440!');
    if (d1440.menuBtnVisible) throw new Error('FAIL: hamburger menu-btn visible on desktop 1440!');
    if (!d1440.badgeVisible) throw new Error('FAIL: badge not visible on desktop 1440!');

    // 2. Laptop 1280px
    console.log('[2] Testing Laptop 1280px...');
    await page.setViewport({ width: 1280, height: 800 });
    await sleep(500);
    const d1280 = await page.evaluate(() => {
      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      return {
        navHeaderVisible: isVisible(document.querySelector('.mobile-menu-header')),
        closeBtnVisible: isVisible(document.querySelector('.mobile-close-btn')),
        menuBtnVisible: isVisible(document.querySelector('.menu-btn')),
        badgeVisible: isVisible(document.querySelector('.badge'))
      };
    });
    console.log('Laptop 1280 Check:', d1280);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'header_laptop_1280.png') });
    if (d1280.navHeaderVisible) throw new Error('FAIL: mobile-menu-header visible on 1280!');
    if (d1280.closeBtnVisible) throw new Error('FAIL: close-btn visible on 1280!');

    // 3. Tablet 768px
    console.log('[3] Testing Tablet 768px...');
    await page.setViewport({ width: 768, height: 1024 });
    await sleep(500);
    const d768 = await page.evaluate(() => {
      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      return {
        menuBtnVisible: isVisible(document.querySelector('.menu-btn')),
        siteNavVisible: isVisible(document.querySelector('.site-nav')),
        badgeVisible: isVisible(document.querySelector('.badge'))
      };
    });
    console.log('Tablet 768 Check:', d768);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'header_tablet_768.png') });
    if (!d768.menuBtnVisible) throw new Error('FAIL: hamburger not visible on tablet 768!');
    if (d768.siteNavVisible) throw new Error('FAIL: desktop nav shouldn\'t be visible unexpanded on 768!');

    // Open drawer on tablet
    await page.click('.menu-btn');
    await sleep(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'header_tablet_768_drawer_open.png') });
    const d768_open = await page.evaluate(() => {
      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      return {
        siteNavVisible: isVisible(document.querySelector('.site-nav.open')),
        closeBtnVisible: isVisible(document.querySelector('.mobile-close-btn')),
        backdropVisible: isVisible(document.querySelector('.menu-backdrop'))
      };
    });
    console.log('Tablet 768 Drawer Open Check:', d768_open);
    if (!d768_open.siteNavVisible || !d768_open.closeBtnVisible || !d768_open.backdropVisible) {
      throw new Error('FAIL: drawer did not open properly on tablet!');
    }
    // Close drawer via close button
    await page.click('.mobile-close-btn');
    await sleep(400);

    // 4. Mobile 390px
    console.log('[4] Testing Mobile 390px...');
    await page.setViewport({ width: 390, height: 844 });
    await sleep(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'header_mobile_390.png') });
    // Open drawer on mobile
    const isOpenBefore = await page.evaluate(() => document.querySelector('.site-nav').classList.contains('open'));
    console.log('Mobile 390 Drawer is open before clicking menu-btn:', isOpenBefore);
    await page.click('.menu-btn');
    await sleep(400);
    const isOpenAfter = await page.evaluate(() => document.querySelector('.site-nav').classList.contains('open'));
    console.log('Mobile 390 Drawer is open after clicking menu-btn:', isOpenAfter);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'header_mobile_390_drawer_open.png') });
    
    // Click Evaluation nav link inside drawer
    await page.evaluate(() => {
      const el = document.querySelector('.site-nav a[href="/evaluation"]');
      if (el) el.click();
    });
    await sleep(1000);
    const currentUrl = page.url();
    const isClosedAfterNav = await page.evaluate(() => {
      const nav = document.querySelector('.site-nav');
      return !nav.classList.contains('open');
    });
    console.log('Mobile 390 Nav Click -> Current URL:', currentUrl, 'Drawer Closed:', isClosedAfterNav);
    if (!currentUrl.includes('evaluation') || !isClosedAfterNav) {
      throw new Error('FAIL: Link click did not navigate or close drawer!');
    }

    // 5. Small Mobile 360px
    console.log('[5] Testing Small Mobile 360px...');
    await page.setViewport({ width: 360, height: 740 });
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
    await sleep(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'header_mobile_360.png') });

    console.log('\nAll Header Navigation Tests PASSED with 0 errors!');
  } finally {
    await browser.close();
  }
}

testHeader().catch(err => {
  console.error(err);
  process.exit(1);
});
