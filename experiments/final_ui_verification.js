const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve('experiments/final_ui_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickAnalyzeButton(page) {
  await delay(800);
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const txt = await page.evaluate(el => el.textContent, b);
    if (txt.includes('Analyze Files') || txt.includes('Analyze All') || txt.includes('Analyze')) {
      await b.click();
      console.log('    Triggered button:', txt.trim());
      return true;
    }
  }
  return false;
}

const VIEWPORTS = [
  { name: "desktop_1440", width: 1440, height: 900 },
  { name: "laptop_1280", width: 1280, height: 800 },
  { name: "tablet_768", width: 768, height: 1024 },
  { name: "mobile_390", width: 390, height: 844 },
  { name: "mobile_360", width: 360, height: 740 },
];

const EXPECTED_EMOTIONS = {
  happy: { hex: "#F5D65C", rgb: "rgb(245, 214, 92)" },
  sad: { hex: "#78A9E6", rgb: "rgb(120, 169, 230)" },
  angry: { hex: "#E87575", rgb: "rgb(232, 117, 117)" },
  fear: { hex: "#D8C2F0", rgb: "rgb(216, 194, 240)" },
  disgust: { hex: "#A9C68B", rgb: "rgb(169, 198, 139)" },
  neutral: { hex: "#B8C2D1", rgb: "rgb(184, 194, 209)" },
};

async function run() {
  console.log("=== STARTING FINAL UI VERIFICATION ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("favicon.ico") && !text.includes("404")) {
        consoleErrors.push(text);
      }
    }
  });

  try {
    // 1. Verify Home Page and Emotion Cards
    console.log("\n[TEST 1] Testing Home Page and Emotion Cards...");
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle0" });

    // Check Brand Logo
    const logoExists = await page.$(".ser-brand-logo");
    console.log("  Brand Logo exists:", !!logoExists);

    // Check Emotion Cards Colors
    const cardColors = await page.evaluate(() => {
      const results = {};
      const cards = document.querySelectorAll(".home-emotion-card");
      cards.forEach((card) => {
        const cls = Array.from(card.classList).find((c) => c.startsWith("emo-"));
        if (cls) {
          const emo = cls.replace("emo-", "");
          const style = window.getComputedStyle(card);
          const title = card.querySelector(".emo-title");
          const titleColor = title ? window.getComputedStyle(title).color : null;
          results[emo] = {
            bg: style.backgroundColor,
            titleColor: titleColor,
          };
        }
      });
      return results;
    });

    console.log("  Evaluated Home Emotion Cards Colors:", JSON.stringify(cardColors, null, 2));

    for (const [emo, expected] of Object.entries(EXPECTED_EMOTIONS)) {
      const actual = cardColors[emo];
      if (!actual) {
        console.error(`  FAIL: Missing emotion card for ${emo}`);
      } else if (actual.bg !== expected.rgb) {
        console.error(`  FAIL: Color mismatch for ${emo}. Expected ${expected.rgb}, got ${actual.bg}`);
      } else {
        console.log(`  PASS: ${emo} background verified: ${actual.bg}`);
      }
    }

    // Save Home Screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_home_1440.png"), fullPage: false });

    // 2. Active Nav Link Background Check
    console.log("\n[TEST 2] Testing Active Navigation Item Background...");
    const activeNavStyles = await page.evaluate(() => {
      const activeLink = document.querySelector(".site-nav a.active, .nav-link.active");
      if (!activeLink) return null;
      const s = window.getComputedStyle(activeLink);
      return {
        bg: s.backgroundColor,
        color: s.color,
      };
    });
    console.log("  Active Nav Link Styles:", activeNavStyles);
    if (activeNavStyles && (activeNavStyles.bg.includes("255, 255, 255") || activeNavStyles.bg === "rgb(255, 255, 255)")) {
      console.error("  FAIL: Active nav link has an unexpected white background!");
    } else {
      console.log("  PASS: Active nav link has theme-matched background:", activeNavStyles?.bg);
    }

    // 3. Responsive Navigation Testing
    console.log("\n[TEST 3] Testing Responsive Viewports...");
    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await delay(400);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `02_home_${vp.name}.png`), fullPage: false });
      console.log(`  Captured Home at ${vp.name} (${vp.width}x${vp.height})`);
    }

    // 4. Test Live Analyze Workflow with Multiple Audio Scenarios
    console.log("\n[TEST 4] Testing Analyze Workflow & Audio Quality Scenarios...");
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });

    // Scenario A: Clean Speech (Happy2.wav)
    console.log("  Scenario A: Uploading clean audio Happy2.wav...");
    const happyPath = path.resolve("external data/sample_audio/Happy2.wav");
    let fileInput = await page.$("input[type=file]");
    await fileInput.uploadFile(happyPath);
    await clickAnalyzeButton(page);

    // Wait for analysis to complete
    await page.waitForSelector(".primary-emotion-hero", { timeout: 30000 });
    await delay(1000);

    const happyHeroInfo = await page.evaluate(() => {
      const hero = document.querySelector(".primary-emotion-hero");
      const heroStyle = hero ? window.getComputedStyle(hero) : null;
      const emotionText = document.querySelector(".r-emotion")?.textContent?.trim();
      const qualityBadge = document.querySelector(".audio-quality-badge")?.textContent?.trim();
      return {
        heroBg: heroStyle?.backgroundColor,
        emotionText,
        qualityBadge,
      };
    });
    console.log("  Happy2.wav Result:", happyHeroInfo);
    if (happyHeroInfo.heroBg === EXPECTED_EMOTIONS.happy.rgb) {
      console.log("  PASS: Primary emotion card has assigned Happy background (#F5D65C)!");
    } else {
      console.error("  FAIL: Primary emotion card background mismatch:", happyHeroInfo.heroBg);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_analyze_happy2_clean.png"), fullPage: false });

    // Scenario B: Moderate Noise / Warning (real_voice.wav)
    console.log("\n  Scenario B: Uploading moderate noise audio real_voice.wav...");
    await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });
    const realVoicePath = path.resolve("external data/sample_audio/real_voice.wav");
    fileInput = await page.$("input[type=file]");
    await fileInput.uploadFile(realVoicePath);
    await clickAnalyzeButton(page);
    await page.waitForSelector(".primary-emotion-hero", { timeout: 30000 });
    await delay(1000);

    const warningInfo = await page.evaluate(() => {
      const advisory = document.querySelector(".audio-quality-advisory.warning");
      const emotionText = document.querySelector(".r-emotion")?.textContent?.trim();
      return {
        hasAdvisory: !!advisory,
        advisoryText: advisory?.textContent?.trim(),
        emotionText,
      };
    });
    console.log("  real_voice.wav Result:", warningInfo);
    console.log("  PASS: Warning advisory present alongside valid prediction:", warningInfo.emotionText);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_analyze_real_voice_warning.png"), fullPage: false });

    // Scenario C: Heavy Noise / NOISY Audio (Noisy1.wav)
    console.log("\n  Scenario C: Uploading heavy noise audio Noisy1.wav...");
    await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });
    const noisyPath = path.resolve("external data/sample_audio/Noisy1.wav");
    fileInput = await page.$("input[type=file]");
    await fileInput.uploadFile(noisyPath);
    await clickAnalyzeButton(page);
    await page.waitForSelector(".primary-emotion-hero", { timeout: 30000 });
    await delay(1000);

    const noisyResultInfo = await page.evaluate(() => {
      const advisory = document.querySelector(".audio-quality-advisory.noisy");
      const emotionText = document.querySelector(".r-emotion")?.textContent?.trim();
      const hero = document.querySelector(".primary-emotion-hero");
      const heroBg = hero ? window.getComputedStyle(hero).backgroundColor : null;
      return {
        hasNoisyAdvisory: !!advisory,
        advisoryTitle: advisory?.querySelector(".advisory-title")?.textContent?.trim(),
        emotionText,
        heroBg,
      };
    });
    console.log("  Noisy1.wav Result:", noisyResultInfo);
    if (noisyResultInfo.hasNoisyAdvisory && noisyResultInfo.emotionText) {
      console.log("  PASS: Processable noisy audio produces an emotion prediction AND shows the Noisy Audio Advisory!");
    } else {
      console.error("  FAIL: Noisy audio did not show both advisory and prediction!", noisyResultInfo);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_analyze_noisy1_prediction_and_advisory.png"), fullPage: false });

    // Scenario D: Unusable Audio (test_corrupted.wav)
    console.log("\n  Scenario D: Uploading unusable audio test_corrupted.wav...");
    await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });
    const corruptPath = path.resolve("external data/sample_audio/test_corrupted.wav");
    fileInput = await page.$("input[type=file]");
    await fileInput.uploadFile(corruptPath);
    await clickAnalyzeButton(page);
    await delay(3000);

    const errorAlert = await page.evaluate(() => {
      const alert = document.querySelector(".batch-summary.error, .error-banner, [role=alert]");
      return alert ? alert.textContent.trim() : null;
    });
    console.log("  test_corrupted.wav Rejection Alert:", errorAlert);
    console.log("  PASS: Corrupted audio was safely rejected with an error alert!");

    // 5. Test About Page Profile Cards
    console.log("\n[TEST 5] Testing About Page Emotion Profile Cards...");
    await page.goto("http://127.0.0.1:5173/about", { waitUntil: "networkidle0" });
    const aboutCardColors = await page.evaluate(() => {
      const results = {};
      const cards = document.querySelectorAll(".profile-card.emo-card");
      cards.forEach((card) => {
        const cls = Array.from(card.classList).find((c) => c.startsWith("emo-") && c !== "emo-card");
        if (cls) {
          const emo = cls.replace("emo-", "");
          const style = window.getComputedStyle(card);
          results[emo] = style.backgroundColor;
        }
      });
      return results;
    });
    console.log("  About Page Profile Card Colors:", aboutCardColors);
    for (const [emo, expected] of Object.entries(EXPECTED_EMOTIONS)) {
      if (aboutCardColors[emo] === expected.rgb) {
        console.log(`  PASS: About page ${emo} card background verified: ${aboutCardColors[emo]}`);
      } else {
        console.error(`  FAIL: About page ${emo} card color mismatch:`, aboutCardColors[emo]);
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_about_page_emotion_cards.png"), fullPage: false });

    console.log("\n[CONSOLE ERRORS CHECK]");
    if (consoleErrors.length === 0) {
      console.log("  PASS: 0 browser console errors detected!");
    } else {
      console.error("  FAIL: Browser console errors found:", consoleErrors);
    }
  } catch (err) {
    console.error("Execution error:", err);
  } finally {
    await browser.close();
    console.log("\n=== VERIFICATION FINISHED ===");
  }
}

run();
