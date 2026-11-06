const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\JAI-SREE-RAM\\.gemini\\antigravity\\brain\\cb96c2cc-5be4-4858-b66a-ba5c125cf3fc';
const ONE_SPEAKER_AUDIO = path.resolve('external data/sample_audio/real_voice.wav');
const TWO_SPEAKERS_AUDIO = path.resolve('experiments/two_speakers_test.wav');
const THREE_SPEAKERS_AUDIO = path.resolve('experiments/three_speakers_test.wav');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log("=== CONDITIONAL SINGLE-SPEAKER & MULTI-SPEAKER EMOTION ANALYSIS VERIFICATION ===");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // ----------------------------------------------------
  // TEST SCENARIO 1: ONE-SPEAKER RECORDING
  // ----------------------------------------------------
  console.log("\n[Test 1] Testing One-Speaker Recording (real_voice.wav)...");
  await page.goto("http://localhost:5173/analyze", { waitUntil: "networkidle2" });
  await delay(800);

  const fileInput = await page.$('#multi-file-input');
  if (!fileInput) throw new Error('File input #multi-file-input not found');
  await fileInput.uploadFile(ONE_SPEAKER_AUDIO);
  await delay(600);

  // Click Analyze
  const runBtn = await page.$('.btn-action-primary, button.btn.primary');
  if (!runBtn) throw new Error('Analyze button (.btn-action-primary) not found');
  await runBtn.click();
  console.log("Analyze clicked, waiting for workspace results...");

  // Wait for results
  await page.waitForSelector('.workspace-results-section', { timeout: 45000 });
  await delay(1200);

  // Check Single-Speaker DOM elements
  const singleSpkState = await page.evaluate(() => {
    const emotionSec = document.querySelector('#emotion-visuals-section');
    const speakerSec = document.querySelector('#speaker-analysis-section');
    const emotionTitle = emotionSec ? emotionSec.querySelector('.conv-panel-title')?.textContent?.trim() : null;
    const emotionBadge = emotionSec ? emotionSec.querySelector('.conv-badge')?.textContent?.trim() : null;
    const speakerBadgesInTranscript = document.querySelectorAll('.transcript-speaker-badge').length;

    return {
      hasEmotionVisuals: !!emotionSec,
      hasSpeakerAnalysisSection: !!speakerSec, // MUST BE FALSE for 1 speaker
      emotionTitle,
      emotionBadge,
      speakerBadgesInTranscript,
    };
  });

  console.log("Scenario 1 Check:", singleSpkState);
  if (singleSpkState.hasSpeakerAnalysisSection) {
    throw new Error("FAILED: Speaker Analysis section should NOT be present in Single-Speaker mode!");
  }
  if (!singleSpkState.emotionBadge?.includes("Single Speaker")) {
    throw new Error(`FAILED: Expected 'Single Speaker Analysis' badge, got: ${singleSpkState.emotionBadge}`);
  }
  if (singleSpkState.speakerBadgesInTranscript > 0) {
    throw new Error("FAILED: Transcript should NOT display multi-speaker badges for a single speaker!");
  }

  // Expand Single-Speaker Emotion Visuals
  await page.evaluate(() => {
    const hdr = document.querySelector('#emotion-visuals-section .conv-accordion-header');
    if (hdr) hdr.click();
  });
  await delay(800);

  const patternCardCheck = await page.evaluate(() => {
    const card = document.querySelector('.single-speaker-pattern-card');
    const title = card ? card.querySelector('.single-speaker-pattern-title')?.textContent?.trim() : null;
    const boxes = card ? Array.from(card.querySelectorAll('.single-speaker-pattern-box')).map(b => ({
      label: b.querySelector('.single-speaker-pattern-label')?.textContent?.trim(),
      val: b.querySelector('.single-speaker-pattern-val')?.textContent?.trim()
    })) : [];
    const interp = card ? card.querySelector('.single-speaker-interpretation-text')?.textContent?.trim() : null;
    return { hasCard: !!card, title, boxes, interp };
  });

  console.log("Single-Speaker Pattern Card Check:", patternCardCheck);
  if (!patternCardCheck.hasCard || patternCardCheck.boxes.length < 2) {
    throw new Error("FAILED: Single-speaker pattern card or boxes missing!");
  }

  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '01_single_speaker_analysis_verified.png'),
    fullPage: false,
  });
  console.log("Saved: 01_single_speaker_analysis_verified.png");

  // ----------------------------------------------------
  // TEST SCENARIO 2: TWO-SPEAKER RECORDING
  // ----------------------------------------------------
  console.log("\n[Test 2] Testing Two-Speaker Recording (two_speakers_test.wav)...");
  await page.goto("http://localhost:5173/analyze", { waitUntil: "networkidle2" });
  await delay(800);

  const fileInput2 = await page.$('#multi-file-input');
  await fileInput2.uploadFile(TWO_SPEAKERS_AUDIO);
  await delay(600);

  const runBtn2 = await page.$('.btn-action-primary, button.btn.primary');
  if (!runBtn2) throw new Error('Analyze button not found for test 2');
  await runBtn2.click();

  await page.waitForSelector('.workspace-results-section', { timeout: 45000 });
  await delay(1200);

  const twoSpkState = await page.evaluate(() => {
    const emotionSec = document.querySelector('#emotion-visuals-section');
    const speakerSec = document.querySelector('#speaker-analysis-section');
    const spkBadge = speakerSec ? speakerSec.querySelector('.conv-badge')?.textContent?.trim() : null;
    const transcriptBadges = document.querySelectorAll('.transcript-speaker-badge').length;

    return {
      hasEmotionVisuals: !!emotionSec,
      hasSpeakerAnalysisSection: !!speakerSec, // MUST BE TRUE for 2 speakers
      spkBadge,
      transcriptBadges,
    };
  });

  console.log("Scenario 2 Check:", twoSpkState);
  if (!twoSpkState.hasSpeakerAnalysisSection) {
    throw new Error("FAILED: Speaker Analysis section MUST be present in Multi-Speaker mode!");
  }
  if (!twoSpkState.spkBadge?.includes("2 Speakers Detected")) {
    throw new Error(`FAILED: Expected '2 Speakers Detected', got: ${twoSpkState.spkBadge}`);
  }

  // Expand Speaker Analysis section
  await page.evaluate(() => {
    const hdr = document.querySelector('#speaker-analysis-section .conv-accordion-header');
    if (hdr) hdr.click();
  });
  await delay(800);

  const speakerProfilesCheck = await page.evaluate(() => {
    const cards = document.querySelectorAll('.speaker-card');
    const timeline = document.querySelector('.conv-timeline-lanes');
    return {
      speakerCardCount: cards.length,
      hasTimelineLanes: !!timeline,
    };
  });

  console.log("Two-Speaker Profiles Check:", speakerProfilesCheck);
  if (speakerProfilesCheck.speakerCardCount !== 2) {
    throw new Error(`FAILED: Expected 2 speaker cards, found: ${speakerProfilesCheck.speakerCardCount}`);
  }

  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '02_two_speakers_analysis_verified.png'),
    fullPage: false,
  });
  console.log("Saved: 02_two_speakers_analysis_verified.png");

  // ----------------------------------------------------
  // TEST SCENARIO 3: THREE-SPEAKER RECORDING
  // ----------------------------------------------------
  console.log("\n[Test 3] Testing Three-Speaker Recording (three_speakers_test.wav)...");
  await page.goto("http://localhost:5173/analyze", { waitUntil: "networkidle2" });
  await delay(800);

  const fileInput3 = await page.$('#multi-file-input');
  await fileInput3.uploadFile(THREE_SPEAKERS_AUDIO);
  await delay(600);

  const runBtn3 = await page.$('.btn-action-primary, button.btn.primary');
  if (!runBtn3) throw new Error('Analyze button not found for test 3');
  await runBtn3.click();

  await page.waitForSelector('.workspace-results-section', { timeout: 45000 });
  await delay(1200);

  const threeSpkState = await page.evaluate(() => {
    const speakerSec = document.querySelector('#speaker-analysis-section');
    const spkBadge = speakerSec ? speakerSec.querySelector('.conv-badge')?.textContent?.trim() : null;
    return {
      hasSpeakerAnalysisSection: !!speakerSec,
      spkBadge,
    };
  });

  console.log("Scenario 3 Check:", threeSpkState);
  if (!threeSpkState.hasSpeakerAnalysisSection || !threeSpkState.spkBadge?.includes("3 Speakers Detected")) {
    throw new Error(`FAILED: Expected '3 Speakers Detected', got: ${threeSpkState.spkBadge}`);
  }

  // Expand Speaker Analysis section
  await page.evaluate(() => {
    const hdr = document.querySelector('#speaker-analysis-section .conv-accordion-header');
    if (hdr) hdr.click();
  });
  await delay(800);

  const threeCards = await page.evaluate(() => document.querySelectorAll('.speaker-card').length);
  console.log("Three-Speaker Card Count:", threeCards);
  if (threeCards !== 3) {
    throw new Error(`FAILED: Expected 3 speaker cards, found: ${threeCards}`);
  }

  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '03_three_speakers_analysis_verified.png'),
    fullPage: false,
  });
  console.log("Saved: 03_three_speakers_analysis_verified.png");

  // ----------------------------------------------------
  // TEST SCENARIO 4: UNCERTAIN SPEAKER COUNT
  // ----------------------------------------------------
  console.log("\n[Test 4] Testing Uncertain Speaker Count Handling...");
  await page.evaluate(() => {
    sessionStorage.setItem("ser_reopened_analysis", JSON.stringify({
      id: "test-uncertain-spk",
      original_filename: "uncertain_sample.wav",
      predicted_emotion: "neutral",
      confidence: 0.65,
      margin: 0.20,
      scores: { neutral: 0.65, happy: 0.15, sad: 0.1, angry: 0.05, fear: 0.03, disgust: 0.02 },
      transcript: "Testing uncertain speaker count audio clip.",
      analyzed_seconds: 4.5,
      speaker_count: 0,
      speakers: [],
      emotion_journey: []
    }));
  });
  await page.goto("http://localhost:5173/analyze", { waitUntil: "networkidle2" });
  await page.waitForSelector('.primary-emotion-hero', { timeout: 10000 });
  await delay(800);

  const uncertainCheck = await page.evaluate(() => {
    const banner = Array.from(document.querySelectorAll('.banner.info')).find(b => b.textContent.includes("Speaker count could not be confidently validated"));
    const speakerSec = document.querySelector('#speaker-analysis-section');
    return {
      hasUncertaintyBanner: !!banner,
      hasSpeakerAnalysisSection: !!speakerSec, // MUST BE FALSE
    };
  });
  console.log("Scenario 4 Uncertain Speaker Check:", uncertainCheck);
  if (!uncertainCheck.hasUncertaintyBanner) {
    throw new Error("FAILED: Uncertainty banner should be displayed when speaker count is uncertain/0!");
  }
  if (uncertainCheck.hasSpeakerAnalysisSection) {
    throw new Error("FAILED: Speaker Analysis section should NOT be displayed when speaker count is uncertain/0!");
  }

  // ----------------------------------------------------
  // TEST SCENARIO 5: REVISITING SAVED SINGLE-SPEAKER ANALYSIS
  // ----------------------------------------------------
  console.log("\n[Test 5] Testing Reopening Saved Single-Speaker Analysis...");
  await page.evaluate(() => {
    sessionStorage.setItem("ser_reopened_analysis", JSON.stringify({
      id: "test-single-saved-1",
      original_filename: "single_speaker_saved.wav",
      predicted_emotion: "happy",
      confidence: 0.88,
      margin: 0.45,
      scores: { happy: 0.88, neutral: 0.08, sad: 0.02, angry: 0.01, fear: 0.005, disgust: 0.005 },
      transcript: "This is a single speaker test recording.",
      analyzed_seconds: 5.0,
      speaker_count: 1,
      speakers: [
        { speaker_id: "SPEAKER_00", label: "Speaker A", total_speech_seconds: 5.0, participation_percentage: 100.0, primary_emotion: "happy" }
      ],
      emotion_journey: [
        { start: 0.0, end: 5.0, emotion: "happy", confidence: 0.88 }
      ]
    }));
  });
  await page.goto("http://localhost:5173/analyze", { waitUntil: "networkidle2" });
  await page.waitForSelector('.primary-emotion-hero', { timeout: 10000 });
  await delay(800);

  const reopenedSingleCheck = await page.evaluate(() => {
    const emotionSec = document.querySelector('#emotion-visuals-section');
    const speakerSec = document.querySelector('#speaker-analysis-section');
    const badge = emotionSec ? emotionSec.querySelector('.conv-badge')?.textContent?.trim() : null;
    return {
      hasEmotionSec: !!emotionSec,
      hasSpeakerSec: !!speakerSec,
      badge,
    };
  });
  console.log("Reopened Single Speaker Check:", reopenedSingleCheck);
  if (reopenedSingleCheck.hasSpeakerSec) {
    throw new Error("FAILED: Reopened single speaker analysis should NOT show Speaker Analysis section!");
  }
  if (!reopenedSingleCheck.badge?.includes("Single Speaker")) {
    throw new Error(`FAILED: Reopened single speaker badge should say Single Speaker, got ${reopenedSingleCheck.badge}`);
  }

  // ----------------------------------------------------
  // TEST SCENARIO 6: REVISITING SAVED MULTI-SPEAKER ANALYSIS
  // ----------------------------------------------------
  console.log("\n[Test 6] Testing Reopening Saved Multi-Speaker Analysis...");
  await page.evaluate(() => {
    sessionStorage.setItem("ser_reopened_analysis", JSON.stringify({
      id: "test-multi-saved-2",
      original_filename: "two_speakers_saved.wav",
      predicted_emotion: "fear",
      confidence: 0.72,
      margin: 0.32,
      scores: { fear: 0.72, neutral: 0.15, sad: 0.08, angry: 0.03, happy: 0.01, disgust: 0.01 },
      transcript: "Speaker one speaks here. Then speaker two speaks.",
      combined_transcript: [
        { start: 0.0, end: 4.0, speaker_id: "SPEAKER_00", speaker_name: "Speaker A", text: "Speaker one speaks here.", emotion: "fear" },
        { start: 4.0, end: 7.2, speaker_id: "SPEAKER_01", speaker_name: "Speaker B", text: "Then speaker two speaks.", emotion: "neutral" }
      ],
      analyzed_seconds: 7.2,
      speaker_count: 2,
      speakers: [
        { speaker_id: "SPEAKER_00", label: "Speaker A", total_speech_seconds: 4.0, participation_percentage: 55.0, primary_emotion: "fear" },
        { speaker_id: "SPEAKER_01", label: "Speaker B", total_speech_seconds: 3.2, participation_percentage: 45.0, primary_emotion: "neutral" }
      ],
      emotion_journey: [
        { start: 0.0, end: 4.0, emotion: "fear", confidence: 0.72 },
        { start: 4.0, end: 7.2, emotion: "neutral", confidence: 0.65 }
      ]
    }));
  });
  await page.goto("http://localhost:5173/analyze", { waitUntil: "networkidle2" });
  await page.waitForSelector('.primary-emotion-hero', { timeout: 10000 });
  await delay(800);

  const reopenedMultiCheck = await page.evaluate(() => {
    const speakerSec = document.querySelector('#speaker-analysis-section');
    const badge = speakerSec ? speakerSec.querySelector('.conv-badge')?.textContent?.trim() : null;
    const transcriptBadges = document.querySelectorAll('.transcript-speaker-badge').length;
    return {
      hasSpeakerSec: !!speakerSec,
      badge,
      transcriptBadges,
    };
  });
  console.log("Reopened Multi Speaker Check:", reopenedMultiCheck);
  if (!reopenedMultiCheck.hasSpeakerSec || !reopenedMultiCheck.badge?.includes("2 Speakers Detected")) {
    throw new Error(`FAILED: Reopened multi-speaker should show 2 Speakers Detected, got ${reopenedMultiCheck.badge}`);
  }
  if (reopenedMultiCheck.transcriptBadges === 0) {
    throw new Error("FAILED: Reopened multi-speaker transcript should display speaker badges!");
  }

  // ----------------------------------------------------
  // TEST THEMES & RESPONSIVENESS
  // ----------------------------------------------------
  console.log("\n[Test 7] Testing Dark Mode & Mobile Responsiveness...");
  // Dark mode toggle
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await delay(600);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '04_reopened_multi_speaker_dark.png'),
    fullPage: false,
  });
  console.log("Saved: 04_reopened_multi_speaker_dark.png");

  // Mobile viewport
  await page.setViewport({ width: 375, height: 812 });
  await delay(600);
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, '05_mobile_conditional_results.png'),
    fullPage: false,
  });
  console.log("Saved: 05_mobile_conditional_results.png");

  console.log("\nConsole Errors detected:", consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log("Console errors detail:", consoleErrors);
  }

  console.log("\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!");
  await browser.close();
}

run().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});

