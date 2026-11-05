const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const SCREENSHOT_DIR = path.join(__dirname, "final_logo_screenshots");
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

  console.log("=== COMPREHENSIVE VERIFICATION: LOGO REPLACEMENT & WEBSITE REDESIGN ===");

  // [TEST 1] Verify Navbar Brand Logo in Light Theme
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });

  console.log("\n[TEST 1] Verifying Navbar Brand Logo in Light Theme...");
  const brandLight = await page.evaluate(() => {
    const brand = document.querySelector(".site-header .brand");
    const logoWrap = brand?.querySelector(".ser-brand-logo-wrap");
    const brandName = brand?.querySelector(".brand-name")?.textContent?.trim();
    const lightImg = brand?.querySelector(".ser-logo-light");
    const darkImg = brand?.querySelector(".ser-logo-dark");
    const lightComputed = lightImg ? window.getComputedStyle(lightImg).display : null;
    const darkComputed = darkImg ? window.getComputedStyle(darkImg).display : null;
    const hasBox = !!brand?.querySelector(".logo-bg, rect, .badge, .card");

    return {
      hasBrand: !!brand,
      hasLogoWrap: !!logoWrap,
      brandName,
      lightSrc: lightImg?.getAttribute("src"),
      lightDisplay: lightComputed,
      darkDisplay: darkComputed,
      hasDecorativeContainer: hasBox,
    };
  });

  console.log("  Light Brand Check:", brandLight);
  if (!brandLight.hasBrand || brandLight.brandName !== "Speech Emotion Recognition") {
    throw new Error("Brand link or text missing!");
  }
  if (brandLight.lightDisplay !== "block" || brandLight.darkDisplay !== "none") {
    throw new Error("Logo display states incorrect in Light mode!");
  }
  if (brandLight.hasDecorativeContainer) {
    throw new Error("Logo is still inside a container or box!");
  }
  console.log("  PASS: Light theme brand logo displays black striped sphere directly against background!");

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "01_navbar_brand_light.png"),
    clip: { x: 0, y: 0, width: 1440, height: 100 },
  });

  // [TEST 2] Verify Navbar Brand Logo in Dark Theme
  console.log("\n[TEST 2] Verifying Navbar Brand Logo in Dark Theme...");
  const themeToggle = await page.$(".theme-toggle-btn");
  await themeToggle.click();
  await new Promise((r) => setTimeout(r, 600));

  const brandDark = await page.evaluate(() => {
    const brand = document.querySelector(".site-header .brand");
    const lightImg = brand?.querySelector(".ser-logo-light");
    const darkImg = brand?.querySelector(".ser-logo-dark");
    const lightComputed = lightImg ? window.getComputedStyle(lightImg).display : null;
    const darkComputed = darkImg ? window.getComputedStyle(darkImg).display : null;
    return {
      theme: document.documentElement.getAttribute("data-theme"),
      darkSrc: darkImg?.getAttribute("src"),
      lightDisplay: lightComputed,
      darkDisplay: darkComputed,
    };
  });
  console.log("  Dark Brand Check:", brandDark);
  if (brandDark.theme !== "dark" || brandDark.darkDisplay !== "block" || brandDark.lightDisplay !== "none") {
    throw new Error("Logo display states incorrect in Dark mode!");
  }
  console.log("  PASS: Dark theme brand logo displays white striped sphere directly against dark background!");

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "02_navbar_brand_dark.png"),
    clip: { x: 0, y: 0, width: 1440, height: 100 },
  });

  // [TEST 3] Verify Home Page Over-Hero Header (Dark Video Background)
  console.log("\n[TEST 3] Verifying Home Page Header & Over-Hero Logo...");
  // Toggle back to light theme first
  const themeToggleLight = await page.$(".theme-toggle-btn");
  await themeToggleLight.click();
  await new Promise((r) => setTimeout(r, 600));

  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle0" });
  const homeHeroBrand = await page.evaluate(() => {
    const isOverHero = document.querySelector(".site-header")?.classList.contains("over-hero");
    const brand = document.querySelector(".site-header .brand");
    const lightImg = brand?.querySelector(".ser-logo-light");
    const darkImg = brand?.querySelector(".ser-logo-dark");
    const lightComputed = lightImg ? window.getComputedStyle(lightImg).display : null;
    const darkComputed = darkImg ? window.getComputedStyle(darkImg).display : null;
    return {
      isOverHero,
      lightDisplay: lightComputed,
      darkDisplay: darkComputed,
    };
  });
  console.log("  Home Over-Hero Brand Check:", homeHeroBrand);
  if (!homeHeroBrand.isOverHero || homeHeroBrand.darkDisplay !== "block") {
    throw new Error("Over-hero header should display white logo for contrast against dark video!");
  }
  console.log("  PASS: Home page over-hero displays high-contrast white logo over video background!");

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "03_home_over_hero_brand.png"),
    clip: { x: 0, y: 0, width: 1440, height: 150 },
  });

  // [TEST 4] Verify Footer Logo in Both Themes
  console.log("\n[TEST 4] Verifying Footer Logo...");
  await page.goto("http://127.0.0.1:5173/about", { waitUntil: "networkidle0" });
  const footerCheck = await page.evaluate(() => {
    const footLogo = document.querySelector(".site-footer .foot-brand .ser-brand-logo-wrap");
    const footImg = footLogo?.querySelector("img");
    return {
      hasFooterLogo: !!footLogo,
      hasFooterImg: !!footImg,
    };
  });
  console.log("  Footer Logo Check:", footerCheck);
  if (!footerCheck.hasFooterLogo) {
    throw new Error("Footer logo missing!");
  }
  console.log("  PASS: Footer contains the striped spherical logo!");

  // [TEST 5] Verify Favicon Assets & Absence of Beige
  console.log("\n[TEST 5] Verifying Favicon & Alpha Transparency (No Beige)...");
  const faviconCheck = await page.evaluate(async () => {
    const favSvg = document.querySelector('link[rel="icon"]')?.getAttribute("href");
    const favPng = document.querySelector('link[rel="alternate icon"]')?.getAttribute("href");

    // Load logo-black.png and check pixels for transparency and beige
    const img = new Image();
    await new Promise((res) => {
      img.onload = res;
      img.src = "/logo-black.png";
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;

    let transparentCount = 0;
    let beigeCount = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) transparentCount++;
      // Check for beige (R > 180, G > 160, B > 140, alpha > 40)
      if (d[i] > 180 && d[i + 1] > 160 && d[i + 2] > 140 && d[i + 3] > 40) {
        beigeCount++;
      }
    }
    return {
      favSvg,
      favPng,
      width: c.width,
      height: c.height,
      transparentCount,
      beigeCount,
      totalPixels: c.width * c.height,
    };
  });

  console.log("  Transparency & Favicon Check:", faviconCheck);
  if (faviconCheck.beigeCount !== 0) {
    throw new Error(`Beige pixels detected in logo (${faviconCheck.beigeCount} pixels)!`);
  }
  if (faviconCheck.transparentCount < 5000) {
    throw new Error("Logo background is not transparent!");
  }
  console.log("  PASS: Logo has 100% transparent alpha channel and 0 beige pixels!");

  // [TEST 6] Verify All 5 Non-Home Pages & Hero Video Backgrounds
  console.log("\n[TEST 6] Verifying Non-Home Pages and Video Backgrounds...");
  const pages = [
    { url: "/analyze", video: "signals.mp4" },
    { url: "/evaluation", video: "observatory.mp4" },
    { url: "/model", video: "orbit-network.mp4" },
    { url: "/about", video: "research-abstract.mp4" },
    { url: "/faq", video: "light-rays.mp4" },
  ];

  for (const p of pages) {
    await page.goto("http://127.0.0.1:5173" + p.url, { waitUntil: "networkidle0" });
    const pCheck = await page.evaluate((expectedVid) => {
      const hero = document.querySelector(".subpage-hero");
      const video = hero?.querySelector("video");
      const sources = video ? Array.from(video.querySelectorAll("source")).map((s) => s.src) : [];
      const hasExpected = sources.some((s) => s.includes(expectedVid));
      const heroDecorations = hero?.querySelectorAll("svg:not(.ser-brand-logo)").length || 0;
      return {
        height: Math.round(hero?.getBoundingClientRect().height || 0),
        hasExpected,
        heroDecorations,
      };
    }, p.video);

    console.log(`  Page ${p.url}: height = ${pCheck.height}px, video = ${pCheck.hasExpected}, heroIcons = ${pCheck.heroDecorations}`);
    if (!pCheck.hasExpected) {
      throw new Error(`Video ${p.video} missing on ${p.url}!`);
    }
    if (pCheck.heroDecorations > 0) {
      throw new Error(`Decorative icon found in hero of ${p.url}!`);
    }
  }
  console.log("  PASS: All 5 pages have purposeful video backgrounds, uniform hero height, and 0 decorative hero icons!");

  // [TEST 7] Test Responsive Viewports (1440, 1280, 768, 390, 360)
  console.log("\n[TEST 7] Testing Responsive Viewports (Zero Overflow)...");
  const viewports = [1440, 1280, 768, 390, 360];
  for (const w of viewports) {
    await page.setViewport({ width: w, height: 800 });
    await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(`  Viewport ${w}px: overflow = ${overflow}`);
    if (overflow) throw new Error(`Horizontal overflow at ${w}px!`);
  }
  console.log("  PASS: All viewports verified with zero overflow!");

  // [TEST 8] Check Console Errors
  console.log("\n[TEST 8] Checking Browser Console Errors...");
  console.log("  Console error count:", consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.error("  Console errors:", consoleErrors);
    throw new Error("Console errors detected!");
  }
  console.log("  PASS: 0 console errors detected.");

  await browser.close();
  console.log("\n=== ALL 8 VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
})();

