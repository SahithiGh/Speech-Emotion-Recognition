const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const ARTIFACT_DIR = "C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1080 });

  console.log("=== VERIFYING EVALUATION PAGE METRICS ===");

  // 1. Light Theme
  await page.goto("http://127.0.0.1:5173/evaluation", { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("ser-theme", "light");
  });
  await new Promise((r) => setTimeout(r, 1000));

  const metricsData = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll("dl.metrics > div")).map((div) => {
      const dt = div.querySelector("dt")?.textContent?.trim();
      const dd = div.querySelector("dd")?.textContent?.trim();
      const sub = div.querySelector("dd.sub")?.textContent?.trim();
      return { dt, dd, sub };
    });

    const perEmotionRows = Array.from(document.querySelectorAll("table.data tbody tr")).map((tr) => {
      const th = tr.querySelector("th")?.textContent?.trim();
      const tds = Array.from(tr.querySelectorAll("td")).map((td) => td.textContent?.trim());
      return { emotion: th, values: tds };
    });

    const hasConfusionMatrix = !!document.querySelector(".matrix-table, table.cm-table, .confusion-matrix, table");

    return {
      tiles,
      perEmotionRows: perEmotionRows.slice(0, 6),
      hasConfusionMatrix,
    };
  });

  console.log("\n[METRIC TILES EXTRACTED]:");
  console.log(JSON.stringify(metricsData.tiles, null, 2));

  console.log("\n[PER-EMOTION ROWS]:");
  console.log(JSON.stringify(metricsData.perEmotionRows, null, 2));

  // Take screenshot of Light Mode
  const lightShotPath = path.join(ARTIFACT_DIR, "01_evaluation_light_mode.png");
  await page.screenshot({ path: lightShotPath, fullPage: false });
  console.log("Saved Light mode screenshot:", lightShotPath);

  // Take screenshot of Metrics Card section specifically
  const metricsEl = await page.$("dl.metrics");
  if (metricsEl) {
    const tilesPath = path.join(ARTIFACT_DIR, "02_evaluation_metrics_cards.png");
    await metricsEl.screenshot({ path: tilesPath });
    console.log("Saved Metrics tiles screenshot:", tilesPath);
  }

  // 2. Dark Theme
  console.log("\nSwitching to Dark Theme...");
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("ser-theme", "dark");
  });
  await new Promise((r) => setTimeout(r, 1000));

  const darkShotPath = path.join(ARTIFACT_DIR, "03_evaluation_dark_mode.png");
  await page.screenshot({ path: darkShotPath, fullPage: false });
  console.log("Saved Dark mode screenshot:", darkShotPath);

  // Full page dark mode screenshot
  const fullDarkPath = path.join(ARTIFACT_DIR, "04_evaluation_fullpage_dark.png");
  await page.screenshot({ path: fullDarkPath, fullPage: true });
  console.log("Saved Dark mode full page screenshot:", fullDarkPath);

  await browser.close();
  console.log("\n=== EVALUATION VERIFICATION COMPLETE ===");
})();

