const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\JAI-SREE-RAM\\.gemini\\antigravity\\brain\\cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';
const TEST_AUDIO = path.resolve('external data/sample_audio/real_voice.wav');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log("=== REAL UPLOAD: VERIFYING TRANSCRIPT & EMOTION TRACKS ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1100 });

  // 1. Go to analyze
  await page.goto("http://localhost:5173/analyze", { waitUntil: "networkidle2" });
  await delay(800);

  // 2. Upload real audio
  const fileInput = await page.$('#multi-file-input');
  if (!fileInput) throw new Error('File input not found');
  await fileInput.uploadFile(TEST_AUDIO);
  await delay(800);

  // 3. Click Analyze
  const analyzeBtn = await page.$('.btn-action-primary');
  if (!analyzeBtn) throw new Error('Analyze button not found');
  await analyzeBtn.click();
  console.log("Analyze clicked, waiting for workspace results...");

  await page.waitForSelector('.workspace-results-section', { timeout: 35000 });
  await delay(2000);
  console.log("Workspace results section loaded!");

  // --- LIGHT MODE VERIFICATION ---
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await delay(400);

  // 1. Spoken Words Transcript & Timestamps (Light)
  const transcriptCard = await page.$('.result-feature-card');
  if (transcriptCard) {
    await page.evaluate(el => el.scrollIntoView({ behavior: "instant", block: "center" }), transcriptCard);
    await delay(300);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "real_transcript_light.png") });
    console.log("Saved: real_transcript_light.png");
  }

  // 2. Emotion Visualizations (Emotion Tracks - Light)
  const emoVis = await page.$('.conv-panel');
  if (emoVis) {
    await page.evaluate(el => el.scrollIntoView({ behavior: "instant", block: "center" }), emoVis);
    await delay(300);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "real_emotion_tracks_light.png") });
    console.log("Saved: real_emotion_tracks_light.png");

    // Switch to Emotion Journey tab
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".emotion-toggle-btn"));
      const jBtn = btns.find(b => b.textContent.includes("Journey"));
      if (jBtn) jBtn.click();
    });
    await delay(400);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "real_emotion_journey_light.png") });
    console.log("Saved: real_emotion_journey_light.png");
  }

  // --- DARK MODE VERIFICATION ---
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await delay(400);

  // Switch back to Tracks in Dark Mode
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll(".emotion-toggle-btn"));
    const tBtn = btns.find(b => b.textContent.includes("Tracks"));
    if (tBtn) tBtn.click();
  });
  await delay(300);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "real_emotion_tracks_dark.png") });
  console.log("Saved: real_emotion_tracks_dark.png");

  // Transcript Card in Dark Mode
  if (transcriptCard) {
    await page.evaluate(el => el.scrollIntoView({ behavior: "instant", block: "center" }), transcriptCard);
    await delay(300);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "real_transcript_dark.png") });
    console.log("Saved: real_transcript_dark.png");
  }

  // 3. Advanced Views in Dark Mode
  const adv = await page.$('.advanced');
  if (adv) {
    await page.evaluate(el => {
      el.scrollIntoView({ behavior: "instant", block: "center" });
      const firstDet = el.querySelector("details");
      if (firstDet) firstDet.open = true;
    }, adv);
    await delay(500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "real_advanced_views_dark.png") });
    console.log("Saved: real_advanced_views_dark.png");
  }

  await browser.close();
  console.log("=== VERIFICATION COMPLETE ===");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
