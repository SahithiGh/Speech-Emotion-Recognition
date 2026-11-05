const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';
const SAMPLE_AUDIO = path.resolve('external data/sample_audio/Happy2.wav');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log("=== CAPTURING EXACT WORKSPACE QUEUE & PREDICTION MATCH ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  // 1. Light Mode with Queued File
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:5173/analyze", { waitUntil: "networkidle0" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await delay(400);

  // Upload file
  console.log("Uploading sample audio file...");
  const fileInput = await page.$('#multi-file-input');
  if (fileInput) {
    await fileInput.uploadFile(SAMPLE_AUDIO);
    await delay(1200);
  }

  // Capture Light Mode Queued
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "01_analyze_workspace_light_queued_1440.png") });
  console.log("Captured 01_analyze_workspace_light_queued_1440.png");

  // 2. Dark Mode with Queued File (Exact target match for user reference image)
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await delay(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "02_analyze_workspace_dark_queued_1440.png") });
  console.log("Captured 02_analyze_workspace_dark_queued_1440.png");

  // 3. Click Analyze Files to process the queue
  console.log("Clicking Analyze Files...");
  await page.evaluate(() => {
    const btn = document.querySelector(".btn-action-primary");
    if (btn) btn.click();
  });

  await delay(4000);

  // Capture Dark Mode Analyzed
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "03_analyze_workspace_dark_analyzed_1440.png") });
  console.log("Captured 03_analyze_workspace_dark_analyzed_1440.png");

  // Capture Light Mode Analyzed
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await delay(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "04_analyze_workspace_light_analyzed_1440.png") });
  console.log("Captured 04_analyze_workspace_light_analyzed_1440.png");

  await browser.close();
  console.log("=== ALL CAPTURES COMPLETE ===");
}

run();

