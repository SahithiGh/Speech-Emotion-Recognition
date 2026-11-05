const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.resolve('experiments/master_redesign_verification');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log("=== STARTING MASTER REDESIGN VERIFICATION ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("favicon.ico") && !msg.text().includes("404")) {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 1. Analyze Page - Light Mode Empty Workspace (1440px)
    console.log("\n[1] Capturing Analyze Page (Light Mode Empty Workspace at 1440px)...");
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });
    await delay(500);

    // Ensure light theme
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
    });
    await delay(300);

    await page.screenshot({ path: path.join(OUTPUT_DIR, "01_analyze_empty_light_1440.png") });
    console.log("  Saved: 01_analyze_empty_light_1440.png");

    // 2. Add an audio sample to the file queue to verify the exact queue composition
    console.log("\n[2] Loading sample into File Queue on Analyze page...");
    // Open Example recordings details and click the first sample button
    const sampleClicked = await page.evaluate(async () => {
      const details = document.querySelector(".side-info-text.samples-text details");
      if (details) details.open = true;
      const btn = document.querySelector(".side-info-text.samples-text .sample-list button");
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (sampleClicked) {
      await delay(1200);
      console.log("  Sample loaded into queue!");
    } else {
      console.log("  Falling back to direct file simulation...");
    }

    // Capture Analyze Page with Item in Queue (Light Mode)
    await page.screenshot({ path: path.join(OUTPUT_DIR, "02_analyze_queued_light_1440.png") });
    console.log("  Saved: 02_analyze_queued_light_1440.png");

    // 3. Analyze Page - Dark Mode with Item in Queue (1440px)
    console.log("\n[3] Switching to Dark Mode on Analyze page...");
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await delay(400);

    await page.screenshot({ path: path.join(OUTPUT_DIR, "03_analyze_queued_dark_1440.png") });
    console.log("  Saved: 03_analyze_queued_dark_1440.png");

    // 4. Click Analyze Files to run prediction and capture analyzed state
    console.log("\n[4] Running Analysis on queued file...");
    const analyzeBtnFound = await page.evaluate(() => {
      const btn = document.querySelector(".btn-action-primary");
      if (btn && btn.textContent.includes("Analyze")) {
        btn.click();
        return true;
      }
      return false;
    });

    if (analyzeBtnFound) {
      console.log("  Clicked Analyze Files. Waiting for prediction response...");
      await delay(3500);
      await page.screenshot({ path: path.join(OUTPUT_DIR, "04_analyze_done_dark_1440.png") });
      console.log("  Saved: 04_analyze_done_dark_1440.png");

      // Switch back to light mode to see results in light mode
      await page.evaluate(() => {
        document.documentElement.setAttribute("data-theme", "light");
      });
      await delay(400);
      await page.screenshot({ path: path.join(OUTPUT_DIR, "05_analyze_done_light_1440.png") });
      console.log("  Saved: 05_analyze_done_light_1440.png");
    }

    // 5. Evaluation Page - Light Mode & Dark Mode
    console.log("\n[5] Capturing Evaluation Page...");
    await page.goto("http://127.0.0.1:5173/evaluation", { waitUntil: "networkidle0" });
    await delay(500);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await delay(300);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "06_evaluation_light_1440.png") });
    console.log("  Saved: 06_evaluation_light_1440.png");

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await delay(300);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "07_evaluation_dark_1440.png") });
    console.log("  Saved: 07_evaluation_dark_1440.png");

    // 6. Model Info Page - Light Mode & Dark Mode
    console.log("\n[6] Capturing Model Info Page...");
    await page.goto("http://127.0.0.1:5173/model", { waitUntil: "networkidle0" });
    await delay(500);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await delay(300);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "08_model_info_light_1440.png") });
    console.log("  Saved: 08_model_info_light_1440.png");

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await delay(300);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "09_model_info_dark_1440.png") });
    console.log("  Saved: 09_model_info_dark_1440.png");

    // 7. About Page - Light Mode & Dark Mode
    console.log("\n[7] Capturing About Page...");
    await page.goto("http://127.0.0.1:5173/about", { waitUntil: "networkidle0" });
    await delay(500);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await delay(300);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "10_about_light_1440.png") });
    console.log("  Saved: 10_about_light_1440.png");

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await delay(300);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "11_about_dark_1440.png") });
    console.log("  Saved: 11_about_dark_1440.png");

    // 8. FAQ Page - Light Mode & Dark Mode
    console.log("\n[8] Capturing FAQ Page...");
    await page.goto("http://127.0.0.1:5173/faq", { waitUntil: "networkidle0" });
    await delay(500);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await delay(300);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "12_faq_light_1440.png") });
    console.log("  Saved: 12_faq_light_1440.png");

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await delay(300);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "13_faq_dark_1440.png") });
    console.log("  Saved: 13_faq_dark_1440.png");

    // 9. Mobile Responsive Check (Analyze Page at 390px)
    console.log("\n[9] Testing Mobile Viewport (390px)...");
    await page.setViewport({ width: 390, height: 844 });
    await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });
    await delay(500);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "14_analyze_mobile_390.png") });
    console.log("  Saved: 14_analyze_mobile_390.png");

    // Check horizontal scroll
    const hasHorizScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(`  Horizontal overflow on mobile: ${hasHorizScroll ? "FAIL" : "PASS (0 overflow)"}`);

    // 10. Check Console Errors
    console.log(`\n[10] Console Errors Check: ${consoleErrors.length} errors.`);
    if (consoleErrors.length > 0) {
      console.log("  Errors:", consoleErrors);
    }

    console.log("\n=== MASTER REDESIGN VERIFICATION COMPLETE ===");
  } catch (err) {
    console.error("Verification failed with error:", err);
  } finally {
    await browser.close();
  }
}

run();

