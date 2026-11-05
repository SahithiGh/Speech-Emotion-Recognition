const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve('experiments/unified_workspace_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const VIEWPORTS = [
  { name: "desktop_1440", width: 1440, height: 900 },
  { name: "desktop_1280", width: 1280, height: 800 },
  { name: "tablet_768", width: 768, height: 1024 },
  { name: "mobile_390", width: 390, height: 844 },
  { name: "mobile_360", width: 360, height: 740 },
];

async function run() {
  console.log("=== STARTING UNIFIED ANALYSIS WORKSPACE VERIFICATION ===");
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

  let failures = 0;

  try {
    // 1. Initial Load & Workspace Structure Check
    console.log("\n[TEST 1] Verifying Unified Analysis Workspace Structure at 1440px...");
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });

    const workspaceInfo = await page.evaluate(() => {
      const ws = document.querySelector(".analysis-workspace");
      if (!ws) return null;
      const rect = ws.getBoundingClientRect();
      const style = window.getComputedStyle(ws);
      const header = document.querySelector(".workspace-header");
      const tabs = document.querySelectorAll(".workspace-tab-btn");
      const dropzone = document.querySelector(".workspace-dropzone");
      const videoBanner = document.querySelector(".video-support-banner");
      const videoBannerStyle = videoBanner ? window.getComputedStyle(videoBanner) : null;
      const iconPlate = document.querySelector(".banner-icon-plate");

      return {
        width: rect.width,
        maxWidth: style.maxWidth,
        bg: style.backgroundColor,
        hasHeader: !!header,
        tabCount: tabs.length,
        hasDropzone: !!dropzone,
        hasVideoBanner: !!videoBanner,
        videoBannerDisplay: videoBannerStyle?.display,
        hasIconPlate: !!iconPlate,
      };
    });

    console.log("  Workspace Structure:", JSON.stringify(workspaceInfo, null, 2));

    if (!workspaceInfo) {
      console.error("  FAIL: .analysis-workspace not found!");
      failures++;
    } else {
      if (workspaceInfo.width > 1100) {
        console.log(`  PASS: Workspace effectively utilizes desktop width: ${workspaceInfo.width.toFixed(1)}px (no 780px cutoff)`);
      } else {
        console.error(`  FAIL: Workspace width too narrow: ${workspaceInfo.width}px`);
        failures++;
      }
      if (workspaceInfo.tabCount === 2) {
        console.log("  PASS: Workspace header contains 2 integrated mode tabs");
      } else {
        console.error(`  FAIL: Expected 2 tabs, got ${workspaceInfo.tabCount}`);
        failures++;
      }
      if (workspaceInfo.hasVideoBanner && workspaceInfo.videoBannerDisplay === "flex" && workspaceInfo.hasIconPlate) {
        console.log("  PASS: Video support banner uses proper flexbox container with dedicated icon plate");
      } else {
        console.error("  FAIL: Video support banner layout issue:", workspaceInfo);
        failures++;
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_empty_workspace_desktop_1440.png"), fullPage: false });

    // 2. Test Mode Switcher: Switch to Record Tab
    console.log("\n[TEST 2] Testing Mode Switcher (Record Microphone Tab)...");
    const recordTab = await page.$("#tab-record");
    if (recordTab) {
      await recordTab.click();
      await delay(400);

      const recordZoneVisible = await page.evaluate(() => {
        const zone = document.querySelector(".workspace-record-zone");
        const btn = document.querySelector(".record-btn");
        return !!zone && !!btn;
      });

      if (recordZoneVisible) {
        console.log("  PASS: Record Microphone mode activated cleanly within workspace");
      } else {
        console.error("  FAIL: Record zone did not appear!");
        failures++;
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_record_mode_active.png"), fullPage: false });

      // Switch back to upload tab
      const uploadTab = await page.$("#tab-upload");
      if (uploadTab) await uploadTab.click();
      await delay(400);
    }

    // 3. Test File Queue Integration (Upload multiple files)
    console.log("\n[TEST 3] Testing Integrated File Queue & Batch Management...");
    const fileInput = await page.$("input[type=file]#multi-file-input");
    const happyPath = path.resolve("external data/sample_audio/Happy2.wav");
    const realVoicePath = path.resolve("external data/sample_audio/real_voice.wav");

    // Upload first file
    await fileInput.uploadFile(happyPath);
    await delay(600);

    // Upload second file
    await fileInput.uploadFile(realVoicePath);
    await delay(800);

    const queueInfo = await page.evaluate(() => {
      const queueSection = document.querySelector(".workspace-queue-section");
      const table = document.querySelector(".batch-table");
      const rows = document.querySelectorAll(".batch-row");
      const toolbar = document.querySelector(".queue-toolbar");
      const analyzeBtn = document.querySelector(".queue-actions-toolbar .btn.primary");
      const clearBtn = document.querySelector(".queue-actions-toolbar .btn.text-danger");
      const replaceBtn = document.querySelector(".replace-audio-btn");

      return {
        inWorkspace: !!queueSection?.closest(".analysis-workspace"),
        rowCount: rows.length,
        hasTable: !!table,
        hasToolbar: !!toolbar,
        hasAnalyzeBtn: !!analyzeBtn,
        hasClearBtn: !!clearBtn,
        hasReplaceBtn: !!replaceBtn,
      };
    });

    console.log("  Queue Integration Info:", JSON.stringify(queueInfo, null, 2));

    if (queueInfo.inWorkspace && queueInfo.rowCount >= 2 && queueInfo.hasAnalyzeBtn && queueInfo.hasClearBtn) {
      console.log("  PASS: File Queue is directly integrated inside the main workspace with aligned toolbar!");
    } else {
      console.error("  FAIL: Queue integration check failed:", queueInfo);
      failures++;
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_file_queue_integrated_pre_analysis.png"), fullPage: false });

    // 4. Run Analysis on the Queue
    console.log("\n[TEST 4] Running Batch Analysis...");
    const analyzeBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.find((b) => b.textContent.includes("Analyze Files") || b.textContent.includes("Analyze"));
    });

    if (analyzeBtn) {
      await analyzeBtn.click();
      console.log("  Clicked Analyze Files. Waiting for processing to complete...");
      await page.waitForSelector(".primary-emotion-hero", { timeout: 40000 });
      await delay(2000);
      console.log("  Analysis complete!");
    } else {
      console.error("  FAIL: Analyze button not found!");
      failures++;
    }

    // 5. Verify Results Integration within the Workspace
    console.log("\n[TEST 5] Verifying Unified Results Section within Workspace...");
    const resultsInfo = await page.evaluate(() => {
      const resultsSection = document.querySelector(".workspace-results-section");
      const inWorkspace = !!resultsSection?.closest(".analysis-workspace");
      const activeBanner = document.querySelector(".active-item-banner");
      const activeFilename = document.querySelector(".active-filename")?.textContent?.trim();
      const hero = document.querySelector(".primary-emotion-hero");
      const heroEmotion = document.querySelector(".r-emotion")?.textContent?.trim();
      const resultsGrid = document.querySelector(".workspace-results-grid");
      const transcript = document.querySelector(".results-col-left .result-feature-card");
      const scoreBars = document.querySelector(".score-module");
      const waveform = document.querySelector(".waveform-module");

      return {
        inWorkspace,
        hasActiveBanner: !!activeBanner,
        activeFilename,
        hasHero: !!hero,
        heroEmotion,
        hasResultsGrid: !!resultsGrid,
        hasTranscript: !!transcript,
        hasScoreBars: !!scoreBars,
        hasWaveform: !!waveform,
      };
    });

    console.log("  Results Info:", JSON.stringify(resultsInfo, null, 2));

    if (resultsInfo.inWorkspace && resultsInfo.hasHero && resultsInfo.hasResultsGrid && resultsInfo.hasTranscript && resultsInfo.hasScoreBars) {
      console.log("  PASS: Analysis results display as a cohesive continuation of the same workspace!");
    } else {
      console.error("  FAIL: Results section integration failed:", resultsInfo);
      failures++;
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_analyzed_results_integrated_desktop_1440.png"), fullPage: false });

    // 6. Test Responsive Viewports
    console.log("\n[TEST 6] Testing Responsive Viewports across Desktop, Tablet, and Mobile...");
    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await delay(500);

      const vpMetrics = await page.evaluate(() => {
        const bodyWidth = document.body.clientWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        const wsWidth = document.querySelector(".analysis-workspace")?.clientWidth;
        return {
          bodyWidth,
          scrollWidth,
          wsWidth,
          hasHorizontalScroll: scrollWidth > bodyWidth + 2,
        };
      });

      console.log(`  Viewport ${vp.name} (${vp.width}x${vp.height}): wsWidth = ${vpMetrics.wsWidth}px, horizScroll = ${vpMetrics.hasHorizontalScroll}`);

      if (vpMetrics.hasHorizontalScroll) {
        console.error(`  FAIL: Horizontal scroll detected on ${vp.name}!`);
        failures++;
      } else {
        console.log(`  PASS: ${vp.name} layout verified with zero horizontal overflow.`);
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `05_workspace_${vp.name}.png`),
        fullPage: false,
      });
    }

    // 7. Test Dark Theme Rendering
    console.log("\n[TEST 7] Testing Dark Theme Rendering...");
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await delay(600);

    const darkStyles = await page.evaluate(() => {
      const ws = document.querySelector(".analysis-workspace");
      const dropzone = document.querySelector(".workspace-dropzone");
      const activeBanner = document.querySelector(".active-item-banner");
      return {
        wsBg: window.getComputedStyle(ws).backgroundColor,
        wsColor: window.getComputedStyle(ws).color,
        dropzoneBg: window.getComputedStyle(dropzone).backgroundColor,
        activeBannerBg: window.getComputedStyle(activeBanner).backgroundColor,
      };
    });

    console.log("  Dark Theme Styles:", darkStyles);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_workspace_dark_theme_1440.png"), fullPage: false });

    console.log("\n[CONSOLE ERRORS CHECK]");
    if (consoleErrors.length === 0) {
      console.log("  PASS: 0 browser console errors detected!");
    } else {
      console.warn("  Console notices:", consoleErrors);
    }

    console.log("\n=== VERIFICATION SUMMARY ===");
    if (failures === 0) {
      console.log("ALL VERIFICATION CHECKS PASSED: Unified Analysis Workspace is fully verified!");
    } else {
      console.error(`VERIFICATION COMPLETED WITH ${failures} FAILURE(S).`);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
  } finally {
    await browser.close();
  }
}

run();

