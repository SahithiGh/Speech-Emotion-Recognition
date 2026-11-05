const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve('experiments/new_palette_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const EXPECTED_PALETTE = {
  angry: {
    bgHex: "#FCE2E2",
    bgRgb: "rgb(252, 226, 226)",
    textHex: "#A91F24",
    textRgb: "rgb(169, 31, 36)",
  },
  disgust: {
    bgHex: "#E5EAD5",
    bgRgb: "rgb(229, 234, 213)",
    textHex: "#43552D",
    textRgb: "rgb(67, 85, 45)",
  },
  fear: {
    bgHex: "#FEEDCC",
    bgRgb: "rgb(254, 237, 204)",
    textHex: "#92400E",
    textRgb: "rgb(146, 64, 14)",
  },
  happy: {
    bgHex: "#FEF3C7",
    bgRgb: "rgb(254, 243, 199)",
    textHex: "#854D0E",
    textRgb: "rgb(133, 77, 14)",
  },
  neutral: {
    bgHex: "#E2E8F0",
    bgRgb: "rgb(226, 232, 240)",
    textHex: "#334155",
    textRgb: "rgb(51, 65, 85)",
  },
  sad: {
    bgHex: "#292929",
    bgRgb: "rgb(41, 41, 41)",
    textHex: "#FFFFFF",
    textRgb: "rgb(255, 255, 255)",
  },
};

async function run() {
  console.log("=== STARTING NEW EMOTION COLOR PALETTE VERIFICATION ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  let failures = 0;

  try {
    // 1. Home Page Verification
    console.log("\n[TEST 1] Verifying Home Page Emotion Cards...");
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle0" });

    const homeCardStyles = await page.evaluate(() => {
      const results = {};
      const cards = document.querySelectorAll(".home-emotion-card");
      cards.forEach((card) => {
        const cls = Array.from(card.classList).find((c) => c.startsWith("emo-"));
        if (cls) {
          const emo = cls.replace("emo-", "");
          const cardStyle = window.getComputedStyle(card);
          const title = card.querySelector(".emo-title");
          const titleStyle = title ? window.getComputedStyle(title) : null;
          results[emo] = {
            bg: cardStyle.backgroundColor,
            text: titleStyle ? titleStyle.color : cardStyle.color,
          };
        }
      });
      return results;
    });

    console.log("  Home Page Card Styles:", JSON.stringify(homeCardStyles, null, 2));

    for (const [emo, expected] of Object.entries(EXPECTED_PALETTE)) {
      const actual = homeCardStyles[emo];
      if (!actual) {
        console.error(`  FAIL: Missing card for ${emo}`);
        failures++;
      } else {
        if (actual.bg === expected.bgRgb) {
          console.log(`  PASS: ${emo} bg matches ${expected.bgHex} (${actual.bg})`);
        } else {
          console.error(`  FAIL: ${emo} bg mismatch! Expected ${expected.bgRgb}, got ${actual.bg}`);
          failures++;
        }
        if (actual.text === expected.textRgb) {
          console.log(`  PASS: ${emo} text matches ${expected.textHex} (${actual.text})`);
        } else {
          console.error(`  FAIL: ${emo} text mismatch! Expected ${expected.textRgb}, got ${actual.text}`);
          failures++;
        }
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_home_cards_palette.png"), fullPage: false });

    // 2. About Page Verification
    console.log("\n[TEST 2] Verifying About Page Profile Cards...");
    await page.goto("http://127.0.0.1:5173/about", { waitUntil: "networkidle0" });

    const aboutCardStyles = await page.evaluate(() => {
      const results = {};
      const cards = document.querySelectorAll(".profile-card.emo-card");
      cards.forEach((card) => {
        const cls = Array.from(card.classList).find((c) => c.startsWith("emo-") && c !== "emo-card");
        if (cls) {
          const emo = cls.replace("emo-", "");
          const cardStyle = window.getComputedStyle(card);
          const h3 = card.querySelector("h3");
          const h3Style = h3 ? window.getComputedStyle(h3) : null;
          results[emo] = {
            bg: cardStyle.backgroundColor,
            text: h3Style ? h3Style.color : cardStyle.color,
          };
        }
      });
      return results;
    });

    console.log("  About Page Card Styles:", JSON.stringify(aboutCardStyles, null, 2));

    for (const [emo, expected] of Object.entries(EXPECTED_PALETTE)) {
      const actual = aboutCardStyles[emo];
      if (!actual) {
        console.error(`  FAIL: Missing about card for ${emo}`);
        failures++;
      } else {
        if (actual.bg === expected.bgRgb) {
          console.log(`  PASS: About ${emo} bg matches ${expected.bgHex} (${actual.bg})`);
        } else {
          console.error(`  FAIL: About ${emo} bg mismatch! Expected ${expected.bgRgb}, got ${actual.bg}`);
          failures++;
        }
        if (actual.text === expected.textRgb) {
          console.log(`  PASS: About ${emo} text matches ${expected.textHex} (${actual.text})`);
        } else {
          console.error(`  FAIL: About ${emo} text mismatch! Expected ${expected.textRgb}, got ${actual.text}`);
          failures++;
        }
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_about_cards_palette.png"), fullPage: false });

    // 3. Analyze Page Live Prediction Result Hero Card & Pills
    console.log("\n[TEST 3] Verifying Analyze Page Prediction Result Card & Pills...");
    await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });

    const fileInput = await page.$("input[type=file]");
    const happyPath = path.resolve("external data/sample_audio/Happy2.wav");
    await fileInput.uploadFile(happyPath);

    // Click Analyze button
    const buttons = await page.$$("button");
    for (const b of buttons) {
      const txt = await page.evaluate((el) => el.textContent, b);
      if (txt.includes("Analyze Files") || txt.includes("Analyze All") || txt.includes("Analyze")) {
        await b.click();
        break;
      }
    }

    await page.waitForSelector(".primary-emotion-hero", { timeout: 30000 });
    await delay(1000);

    const analyzeResultStyles = await page.evaluate(() => {
      const hero = document.querySelector(".primary-emotion-hero");
      const heroStyle = hero ? window.getComputedStyle(hero) : null;
      const rEmotion = document.querySelector(".r-emotion");
      const rEmotionStyle = rEmotion ? window.getComputedStyle(rEmotion) : null;

      // Check emotion badge/pill styles
      const pill = document.querySelector(".emotion-pill");
      const pillStyle = pill ? window.getComputedStyle(pill) : null;

      // Check score bars
      const scoreBars = {};
      document.querySelectorAll(".s-fill").forEach((bar) => {
        const cls = Array.from(bar.classList).find((c) => c.startsWith("emo-bar-"));
        if (cls) {
          const emo = cls.replace("emo-bar-", "");
          scoreBars[emo] = window.getComputedStyle(bar).backgroundColor;
        }
      });

      return {
        heroBg: heroStyle?.backgroundColor,
        heroText: rEmotionStyle?.color,
        pillBg: pillStyle?.backgroundColor,
        pillText: pillStyle?.color,
        scoreBars,
      };
    });

    console.log("  Analyze Page Result Styles:", JSON.stringify(analyzeResultStyles, null, 2));

    // Happy2.wav detects Happy
    if (analyzeResultStyles.heroBg === EXPECTED_PALETTE.happy.bgRgb) {
      console.log(`  PASS: Primary emotion hero bg matches Golden ${EXPECTED_PALETTE.happy.bgHex}`);
    } else {
      console.error(`  FAIL: Hero bg mismatch! Expected ${EXPECTED_PALETTE.happy.bgRgb}, got ${analyzeResultStyles.heroBg}`);
      failures++;
    }
    if (analyzeResultStyles.heroText === EXPECTED_PALETTE.happy.textRgb) {
      console.log(`  PASS: Primary emotion hero text matches ${EXPECTED_PALETTE.happy.textHex}`);
    } else {
      console.error(`  FAIL: Hero text mismatch! Expected ${EXPECTED_PALETTE.happy.textRgb}, got ${analyzeResultStyles.heroText}`);
      failures++;
    }

    // Verify all 6 score bar background colors
    for (const [emo, expected] of Object.entries(EXPECTED_PALETTE)) {
      const actualBarBg = analyzeResultStyles.scoreBars[emo];
      if (actualBarBg === expected.bgRgb) {
        console.log(`  PASS: Score bar for ${emo} matches ${expected.bgHex} (${actualBarBg})`);
      } else {
        console.error(`  FAIL: Score bar for ${emo} mismatch! Expected ${expected.bgRgb}, got ${actualBarBg}`);
        failures++;
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_analyze_hero_and_scorebars.png"), fullPage: false });

    // 4. Dark Theme Verification
    console.log("\n[TEST 4] Verifying Dark Theme rendering...");
    await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await delay(500);

    const darkHomeStyles = await page.evaluate(() => {
      const sadCard = document.querySelector(".home-emotion-card.emo-sad");
      if (!sadCard) return null;
      const s = window.getComputedStyle(sadCard);
      const title = sadCard.querySelector(".emo-title");
      return {
        sadBg: s.backgroundColor,
        sadText: title ? window.getComputedStyle(title).color : null,
      };
    });
    console.log("  Dark Theme Sad Card Styles:", darkHomeStyles);
    if (darkHomeStyles?.sadBg === EXPECTED_PALETTE.sad.bgRgb && darkHomeStyles?.sadText === EXPECTED_PALETTE.sad.textRgb) {
      console.log("  PASS: Dark Theme Sad card correctly displays Charcoal #292929 with White #FFFFFF text!");
    } else {
      console.error("  FAIL: Dark Theme Sad card mismatch:", darkHomeStyles);
      failures++;
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_dark_theme_verification.png"), fullPage: false });

    console.log("\n=== VERIFICATION SUMMARY ===");
    if (failures === 0) {
      console.log("ALL TESTS PASSED: All 6 emotion colors and text contrasts perfectly match requirements!");
    } else {
      console.error(`VERIFICATION COMPLETED WITH ${failures} FAILURE(S).`);
    }
  } catch (err) {
    console.error("Test execution error:", err);
  } finally {
    await browser.close();
  }
}

run();
