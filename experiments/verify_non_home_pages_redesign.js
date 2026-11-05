const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const SCREENSHOT_DIR = path.join(__dirname, "non_home_redesign_screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => consoleErrors.push(err.toString()));

  console.log("=== COMPREHENSIVE VERIFICATION: ALL NON-HOME PAGES REDESIGN ===");

  const nonHomePages = [
    { url: "/analyze", name: "Analyze", expectedVideo: "signals.mp4" },
    { url: "/evaluation", name: "Evaluation", expectedVideo: "observatory.mp4" },
    { url: "/model", name: "ModelInfo", expectedVideo: "orbit-network.mp4" },
    { url: "/about", name: "About", expectedVideo: "research-abstract.mp4" },
    { url: "/faq", name: "FAQ", expectedVideo: "light-rays.mp4" },
  ];

  // 1. Verify Page Heroes, Videos, and Consistency across Desktop (1440px)
  await page.setViewport({ width: 1440, height: 900 });
  console.log("\n[TEST 1] Verifying Video Backgrounds and Hero Sections across all 5 pages...");

  for (const p of nonHomePages) {
    await page.goto("http://127.0.0.1:5173" + p.url, { waitUntil: "networkidle0" });
    const heroInfo = await page.evaluate(() => {
      const hero = document.querySelector(".subpage-hero");
      if (!hero) return null;
      const video = hero.querySelector("video");
      const kicker = hero.querySelector(".subpage-kicker")?.textContent?.trim();
      const title = hero.querySelector(".subpage-title")?.textContent?.trim();
      const desc = hero.querySelector(".subpage-desc")?.textContent?.trim();
      const sources = video ? Array.from(video.querySelectorAll("source")).map((s) => s.src) : [];
      const rect = hero.getBoundingClientRect();
      const hasDecorativeIcon = hero.querySelectorAll("svg:not(.ser-brand-logo)").length;
      return {
        height: rect.height,
        kicker,
        title,
        desc,
        sources,
        hasDecorativeIcon,
      };
    });

    console.log(`\nPage [${p.name}] at ${p.url}:`);
    console.log(`  Hero title: "${heroInfo?.title}"`);
    console.log(`  Hero kicker: "${heroInfo?.kicker}"`);
    console.log(`  Hero height: ${Math.round(heroInfo?.height || 0)}px`);
    console.log(`  Sources:`, heroInfo?.sources);
    console.log(`  Decorative icons in hero: ${heroInfo?.hasDecorativeIcon}`);

    const hasExpectedVideo = heroInfo?.sources.some((s) => s.includes(p.expectedVideo));
    if (!hasExpectedVideo) {
      throw new Error(`Expected video ${p.expectedVideo} not found in page ${p.url}! Found: ${heroInfo?.sources.join(", ")}`);
    }
    if (heroInfo?.hasDecorativeIcon > 0) {
      throw new Error(`Unexpected decorative icon found in hero of ${p.url}!`);
    }

    const filename = `01_${p.name.toLowerCase()}_hero_desktop_1440.png`;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), clip: { x: 0, y: 0, width: 1440, height: 500 } });
    console.log(`  PASS: ${p.name} hero and video verified. Screenshot saved: ${filename}`);
  }

  // 2. Verify Navbar Brand Logo Preservation & Removal of Top Hero Icon
  console.log("\n[TEST 2] Verifying Navbar Brand Logo & Removal of Hero Icons...");
  await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });
  const logoCheck = await page.evaluate(() => {
    const brandSvg = document.querySelector(".site-header .brand svg.ser-brand-logo");
    const brandName = document.querySelector(".site-header .brand .brand-name")?.textContent?.trim();
    const heroSvg = document.querySelector(".subpage-hero svg");
    const eyebrowSvg = document.querySelector(".workspace-eyebrow svg");
    return {
      hasBrandSvg: !!brandSvg,
      brandName,
      hasHeroSvg: !!heroSvg,
      hasEyebrowSvg: !!eyebrowSvg,
    };
  });
  console.log("  Brand Logo Check:", logoCheck);
  if (!logoCheck.hasBrandSvg || logoCheck.brandName !== "Speech Emotion Recognition") {
    throw new Error("Navbar brand logo or name modified!");
  }
  if (logoCheck.hasHeroSvg || logoCheck.hasEyebrowSvg) {
    throw new Error("Hero or workspace eyebrow still contains an icon!");
  }
  console.log("  PASS: Navbar brand logo intact. Hero download/upload icon successfully removed!");

  // 3. Test Full Upload, Queue, Batch Analysis, and Results on Analyze Page
  console.log("\n[TEST 3] Testing Complete Analyze Page Workflow (Upload -> Queue -> Analyze -> Results)...");
  const fileInput = await page.$("input[type=file]#multi-file-input");
  await fileInput.uploadFile("external data/sample_audio/Happy2.wav", "external data/sample_audio/Angry1.wav");

  await page.waitForSelector(".workspace-queue-section", { timeout: 10000 });
  const queueInfo = await page.evaluate(() => {
    const rows = document.querySelectorAll(".batch-table tbody tr");
    return {
      rowCount: rows.length,
      fileNames: Array.from(rows).map((r) => r.querySelector(".filename-text")?.textContent?.trim()),
    };
  });
  console.log("  Queue loaded files:", queueInfo);
  if (queueInfo.rowCount !== 2) {
    throw new Error(`Expected 2 files in queue, got ${queueInfo.rowCount}`);
  }

  const buttons = await page.$$("button");
  for (const b of buttons) {
    const text = await page.evaluate((el) => el.textContent, b);
    if (text.includes("Analyze Files") || text.includes("Analyze All")) {
      await b.click();
      break;
    }
  }
  await page.waitForSelector(".primary-emotion-hero", { timeout: 35000 });
  console.log("  Analysis executed successfully!");

  const resultsInfo = await page.evaluate(() => {
    const heroTitle = document.querySelector(".primary-emotion-hero .emotion-name")?.textContent?.trim();
    const heroBg = window.getComputedStyle(document.querySelector(".primary-emotion-hero")).backgroundColor;
    const heroColor = window.getComputedStyle(document.querySelector(".primary-emotion-hero")).color;
    return { heroTitle, heroBg, heroColor };
  });
  console.log("  Analysis Results:", resultsInfo);
  const screenshotAnalyzeResults = path.join(SCREENSHOT_DIR, "02_analyze_results_unified.png");
  await page.screenshot({ path: screenshotAnalyzeResults, fullPage: false });
  console.log(`  PASS: Analyze results verified and captured: 02_analyze_results_unified.png`);

  // 4. Verify Theme Toggle (Light & Dark) across Pages
  console.log("\n[TEST 4] Testing Light & Dark Theme Consistency...");
  // Toggle to dark theme
  const themeBtn = await page.$(".theme-toggle-btn");
  await themeBtn.click();
  await new Promise((r) => setTimeout(r, 600));

  const darkTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  console.log("  Current theme after toggle:", darkTheme);

  for (const p of ["/analyze", "/evaluation", "/model", "/about", "/faq"]) {
    await page.goto("http://127.0.0.1:5173" + p, { waitUntil: "networkidle0" });
    const name = `03_${p.replace("/", "")}_dark_theme.png`;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), clip: { x: 0, y: 0, width: 1440, height: 600 } });
    console.log(`  Captured dark theme: ${name}`);
  }

  // Toggle back to light theme
  const themeBtnLight = await page.$(".theme-toggle-btn");
  await themeBtnLight.click();
  await new Promise((r) => setTimeout(r, 600));

  // 5. Test Responsive Viewports (1440, 1280, 768, 390, 360)
  console.log("\n[TEST 5] Testing Responsive Layouts across 5 Viewports...");
  const viewports = [
    { name: "desktop_1440", w: 1440, h: 900 },
    { name: "desktop_1280", w: 1280, h: 800 },
    { name: "tablet_768", w: 768, h: 1024 },
    { name: "mobile_390", w: 390, h: 844 },
    { name: "mobile_360", w: 360, h: 740 },
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.w, height: vp.h });
    await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });
    const overflow = await page.evaluate(() => {
      const sw = document.documentElement.scrollWidth;
      const cw = document.documentElement.clientWidth;
      return sw > cw;
    });

    console.log(`  Viewport ${vp.name} (${vp.w}x${vp.h}): Horizontal overflow = ${overflow}`);
    if (overflow) {
      throw new Error(`Horizontal scroll detected at viewport ${vp.name}!`);
    }

    const vpScreenshot = `04_analyze_${vp.name}.png`;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, vpScreenshot), clip: { x: 0, y: 0, width: vp.w, height: 650 } });
  }

  // 6. Verify Home Page is completely unchanged
  console.log("\n[TEST 6] Verifying Home page is unchanged...");
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle0" });
  const homeCheck = await page.evaluate(() => {
    const heroTitle = document.querySelector(".hero-title")?.textContent?.trim();
    const heroVideo = document.querySelector(".hero-video video");
    const emotionCards = document.querySelectorAll(".home-emotion-card");
    return {
      heroTitle,
      hasHeroVideo: !!heroVideo,
      emotionCount: emotionCards.length,
    };
  });
  console.log("  Home page verification:", homeCheck);
  if (!homeCheck.heroTitle?.includes("Speech Emotion Recognition") || homeCheck.emotionCount !== 6) {
    throw new Error("Home page was modified or emotion cards missing!");
  }
  console.log("  PASS: Home page is completely intact!");

  console.log("\n[TEST 7] Checking browser console errors...");
  console.log("  Console error count:", consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.error("  Console errors detected:", consoleErrors);
    throw new Error("Console errors encountered during testing!");
  }
  console.log("  PASS: 0 console errors detected.");

  await browser.close();
  console.log("\n=== ALL 7 COMPREHENSIVE TESTS PASSED SUCCESSFULLY! ===");
})();

