const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log("=== VERIFYING ABOUT PAGE SIX-ITEM GRIDS ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  async function checkGrid(selector, name) {
    return await page.evaluate((sel, n) => {
      const grid = document.querySelector(sel);
      if (!grid) return { error: `Selector ${sel} not found` };
      const cards = Array.from(grid.children);
      const rects = cards.map((c) => {
        const r = c.getBoundingClientRect();
        return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
      });

      // Count unique row tops
      const rowTops = Array.from(new Set(rects.map((r) => r.top))).sort((a, b) => a - b);
      const rows = rowTops.map((top) => rects.filter((r) => r.top === top));
      const colCountsPerRow = rows.map((r) => r.length);

      return {
        name: n,
        totalCards: cards.length,
        numRows: rowTops.length,
        cardsPerRow: colCountsPerRow,
        equalWidths: rects.every((r) => Math.abs(r.width - rects[0].width) <= 2),
        sampleWidth: rects[0]?.width,
      };
    }, selector, name);
  }

  // 1. Desktop 1440px (Light Theme)
  console.log("\n[TEST 1] Desktop 1440px (Light Theme)...");
  await page.setViewport({ width: 1440, height: 1080 });
  await page.goto("http://127.0.0.1:5173/about", { waitUntil: "networkidle0" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await delay(500);

  const emoDesktop = await checkGrid(".emotion-profile-grid", "Six Emotions");
  const featDesktop = await checkGrid(".feature-category-grid", "296-D Acoustic Extraction");
  console.log("  Emotions Grid (Desktop):", JSON.stringify(emoDesktop, null, 2));
  console.log("  Features Grid (Desktop):", JSON.stringify(featDesktop, null, 2));

  // Scroll to Six Emotions and capture
  const emoEl = await page.$('.emotion-profile-grid');
  if (emoEl) {
    await emoEl.scrollIntoView();
    await delay(300);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "about_emotions_desktop_light_1440.png") });
    console.log("  Captured about_emotions_desktop_light_1440.png");
  }

  // Scroll to Feature Extraction and capture
  const featEl = await page.$('.feature-category-grid');
  if (featEl) {
    await featEl.scrollIntoView();
    await delay(300);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "about_features_desktop_light_1440.png") });
    console.log("  Captured about_features_desktop_light_1440.png");
  }

  // 2. Desktop 1440px (Dark Theme)
  console.log("\n[TEST 2] Desktop 1440px (Dark Theme)...");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await delay(400);

  if (emoEl) {
    await emoEl.scrollIntoView();
    await delay(300);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "about_emotions_desktop_dark_1440.png") });
    console.log("  Captured about_emotions_desktop_dark_1440.png");
  }

  if (featEl) {
    await featEl.scrollIntoView();
    await delay(300);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "about_features_desktop_dark_1440.png") });
    console.log("  Captured about_features_desktop_dark_1440.png");
  }

  // 3. Tablet 768px (2 Columns Check)
  console.log("\n[TEST 3] Tablet 768px (2 Columns Check)...");
  await page.setViewport({ width: 768, height: 1024 });
  await delay(400);

  const emoTablet = await checkGrid(".emotion-profile-grid", "Six Emotions (Tablet)");
  const featTablet = await checkGrid(".feature-category-grid", "296-D Acoustic Extraction (Tablet)");
  console.log("  Emotions Grid (Tablet):", JSON.stringify(emoTablet, null, 2));
  console.log("  Features Grid (Tablet):", JSON.stringify(featTablet, null, 2));

  if (emoEl) {
    await emoEl.scrollIntoView();
    await delay(300);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "about_emotions_tablet_768.png") });
    console.log("  Captured about_emotions_tablet_768.png");
  }

  // 4. Mobile 390px (1 Column Check)
  console.log("\n[TEST 4] Mobile 390px (1 Column Check)...");
  await page.setViewport({ width: 390, height: 844 });
  await delay(400);

  const emoMobile = await checkGrid(".emotion-profile-grid", "Six Emotions (Mobile)");
  const featMobile = await checkGrid(".feature-category-grid", "296-D Acoustic Extraction (Mobile)");
  console.log("  Emotions Grid (Mobile):", JSON.stringify(emoMobile, null, 2));
  console.log("  Features Grid (Mobile):", JSON.stringify(featMobile, null, 2));

  if (emoEl) {
    await emoEl.scrollIntoView();
    await delay(300);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "about_emotions_mobile_390.png") });
    console.log("  Captured about_emotions_mobile_390.png");
  }

  // Acceptance Criteria Validation
  const desktopEmotionsValid = emoDesktop.numRows === 2 && emoDesktop.cardsPerRow.every((c) => c === 3);
  const desktopFeaturesValid = featDesktop.numRows === 2 && featDesktop.cardsPerRow.every((c) => c === 3);
  const tabletEmotionsValid = emoTablet.numRows === 3 && emoTablet.cardsPerRow.every((c) => c === 2);
  const tabletFeaturesValid = featTablet.numRows === 3 && featTablet.cardsPerRow.every((c) => c === 2);
  const mobileEmotionsValid = emoMobile.numRows === 6 && emoMobile.cardsPerRow.every((c) => c === 1);
  const mobileFeaturesValid = featMobile.numRows === 6 && featMobile.cardsPerRow.every((c) => c === 1);

  console.log("\n=== VALIDATION SUMMARY ===");
  console.log(`Desktop Emotions (3 cols x 2 rows): ${desktopEmotionsValid ? "PASS" : "FAIL"}`);
  console.log(`Desktop Features (3 cols x 2 rows): ${desktopFeaturesValid ? "PASS" : "FAIL"}`);
  console.log(`Tablet Emotions (2 cols x 3 rows): ${tabletEmotionsValid ? "PASS" : "FAIL"}`);
  console.log(`Tablet Features (2 cols x 3 rows): ${tabletFeaturesValid ? "PASS" : "FAIL"}`);
  console.log(`Mobile Emotions (1 col x 6 rows): ${mobileEmotionsValid ? "PASS" : "FAIL"}`);
  console.log(`Mobile Features (1 col x 6 rows): ${mobileFeaturesValid ? "PASS" : "FAIL"}`);

  await browser.close();
  if (desktopEmotionsValid && desktopFeaturesValid && tabletEmotionsValid && tabletFeaturesValid && mobileEmotionsValid && mobileFeaturesValid) {
    console.log("\nALL ACCEPTANCE CRITERIA SATISFIED!");
  } else {
    process.exit(1);
  }
}

run();

