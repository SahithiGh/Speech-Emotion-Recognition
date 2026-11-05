const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const TEST_FILES = {
  cleanWav: path.resolve('external data/sample_audio/real_voice.wav'),
  noisyWav: path.resolve('external data/sample_audio/Noisy1.wav'),
  mp3Audio: path.resolve('external data/sample_audio/test_voice.mp3'),
  mp4Video: path.resolve('external data/sample_audio/test_video_track.mp4'),
};

async function testScenario(page, scenarioName, testFn) {
  console.log(`\n======================================================`);
  console.log(`SCENARIO: ${scenarioName}`);
  console.log(`======================================================`);

  const consoleErrors = [];
  const networkFailures = [];

  const onConsole = msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  const onRequestFailed = req => {
    // Ignore internal aborts caused by switching audio src or page unmount
    if (req.failure()?.errorText !== 'net::ERR_ABORTED') {
      networkFailures.push({ url: req.url(), failure: req.failure() });
    }
  };

  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);

  try {
    const result = await testFn(page);
    console.log(`✅ [${scenarioName}] Result:`, JSON.stringify(result, null, 2));

    if (consoleErrors.length > 0) {
      console.warn(`⚠️ Console errors during ${scenarioName}:`, consoleErrors);
    }
    if (networkFailures.length > 0) {
      console.error(`❌ Network failures during ${scenarioName}:`, networkFailures);
    }

    const passed = consoleErrors.length === 0 && networkFailures.length === 0;
    return { success: passed, result, consoleErrors, networkFailures };
  } catch (err) {
    console.error(`❌ [${scenarioName}] FAILED:`, err.message);
    return { success: false, error: err.message, consoleErrors, networkFailures };
  } finally {
    page.off('console', onConsole);
    page.off('requestfailed', onRequestFailed);
  }
}

async function verifyAudioPlayback(page) {
  return await page.evaluate(async () => {
    const audio = document.querySelector('audio');
    if (!audio) throw new Error('No audio element found in DOM');

    // 1. Check metadata and duration
    if (!audio.src) throw new Error('Audio element has no src attribute');
    
    // Wait for duration to be ready if needed
    if (isNaN(audio.duration) || audio.duration === 0 || audio.readyState < 1) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => resolve(), 4000);
        audio.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
        audio.onerror = () => { clearTimeout(timeout); reject(new Error(`Audio error loading metadata: ${audio.error ? audio.error.message : 'unknown'}`)); };
      });
    }

    const duration = audio.duration;
    if (isNaN(duration) || duration <= 0) {
      throw new Error(`Invalid audio duration: ${duration} (readyState: ${audio.readyState})`);
    }

    if (audio.error) {
      throw new Error(`Audio has error code ${audio.error.code}: ${audio.error.message}`);
    }

    // 2. Test Play
    const initialPos = audio.currentTime;
    await audio.play();
    await new Promise(r => setTimeout(r, 800)); // Play for 800ms
    const posAfterPlay = audio.currentTime;
    const isPlaying = !audio.paused;

    if (posAfterPlay <= initialPos && !isPlaying) {
      throw new Error(`Audio play did not advance position: was ${initialPos}, now ${posAfterPlay}`);
    }

    // 3. Test Pause
    audio.pause();
    const isPaused = audio.paused;
    if (!isPaused) {
      throw new Error('Audio pause did not pause the player');
    }

    // 4. Test Seek
    const seekTarget = Math.min(duration - 0.5, Math.max(1.0, duration / 2));
    audio.currentTime = seekTarget;
    await new Promise(r => setTimeout(r, 200));
    const posAfterSeek = audio.currentTime;

    if (Math.abs(posAfterSeek - seekTarget) > 0.5) {
      throw new Error(`Audio seek failed: target was ${seekTarget}, got ${posAfterSeek}`);
    }

    // 5. Test Waveform progress synchronization
    const playedBars = document.querySelectorAll('.waveform-bar-played');
    const waveformLine = document.querySelector('.waveform-container line');

    return {
      src: audio.src.slice(0, 50) + (audio.src.length > 50 ? '...' : ''),
      duration: Math.round(duration * 100) / 100,
      readyState: audio.readyState,
      playedSuccessfully: isPlaying,
      pausedSuccessfully: isPaused,
      soughtSuccessfully: Math.abs(posAfterSeek - seekTarget) <= 0.5,
      playedBarsCount: playedBars.length,
      hasWaveformLine: Boolean(waveformLine),
    };
  });
}

async function uploadAndAnalyze(page, filePath) {
  const fileInput = await page.$('#multi-file-input');
  if (!fileInput) throw new Error('File input #multi-file-input not found');
  await fileInput.uploadFile(filePath);
  await new Promise(r => setTimeout(r, 800));

  const analyzeBtn = await page.$('.btn-action-primary');
  if (!analyzeBtn) throw new Error('Analyze button not found');
  await analyzeBtn.click();

  await page.waitForSelector('.workspace-results-section', { timeout: 35000 });
  await new Promise(r => setTimeout(r, 1500));
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const summary = {};

  // TEST 1: Previously working clean WAV audio
  summary['1_cleanWav'] = await testScenario(page, '1. Clean WAV Audio', async (p) => {
    await p.goto('http://localhost:5173/analyze', { waitUntil: 'networkidle2' });
    await uploadAndAnalyze(p, TEST_FILES.cleanWav);
    return await verifyAudioPlayback(p);
  });

  // TEST 2: Noisy WAV audio after automatic noise reduction
  summary['2_noisyWav'] = await testScenario(page, '2. Noisy WAV Audio with Noise Reduction', async (p) => {
    await p.goto('http://localhost:5173/analyze', { waitUntil: 'networkidle2' });
    await uploadAndAnalyze(p, TEST_FILES.noisyWav);
    
    // Verify original track playback
    const origResult = await verifyAudioPlayback(p);

    // Verify track toggle button exists (Original vs Noise-Reduced)
    const denoisedBtn = await p.$('.audio-mode-selector button:nth-child(3)');
    if (denoisedBtn) {
      console.log('Switching to Noise-Reduced audio track...');
      await denoisedBtn.click();
      await new Promise(r => setTimeout(r, 500));
      const denoisedResult = await verifyAudioPlayback(p);
      return { original: origResult, denoised: denoisedResult };
    }
    return origResult;
  });

  // TEST 3: MP3 audio
  summary['3_mp3Audio'] = await testScenario(page, '3. MP3 Audio', async (p) => {
    await p.goto('http://localhost:5173/analyze', { waitUntil: 'networkidle2' });
    await uploadAndAnalyze(p, TEST_FILES.mp3Audio);
    return await verifyAudioPlayback(p);
  });

  // TEST 4: Audio extracted from MP4 video
  summary['4_mp4Video'] = await testScenario(page, '4. Audio extracted from MP4 video', async (p) => {
    await p.goto('http://localhost:5173/analyze', { waitUntil: 'networkidle2' });
    await uploadAndAnalyze(p, TEST_FILES.mp4Video);
    return await verifyAudioPlayback(p);
  });

  // TEST 5: Second analysis after first analysis (Replace File)
  summary['5_secondAnalysis'] = await testScenario(page, '5. Second analysis after first analysis', async (p) => {
    await p.goto('http://localhost:5173/analyze', { waitUntil: 'networkidle2' });
    await uploadAndAnalyze(p, TEST_FILES.cleanWav);
    const firstPlayback = await verifyAudioPlayback(p);

    // Replace with MP3
    const replaceInput = await p.$('input[type="file"].sr-only');
    if (replaceInput) {
      console.log('Replacing audio with MP3 file...');
      await replaceInput.uploadFile(TEST_FILES.mp3Audio);
      await new Promise(r => setTimeout(r, 800));
      const analyzeBtn = await p.$('.btn-action-primary');
      await analyzeBtn.click();
      await p.waitForSelector('.workspace-results-section', { timeout: 35000 });
      await new Promise(r => setTimeout(r, 1500));
    }
    const secondPlayback = await verifyAudioPlayback(p);
    return { firstAnalysis: firstPlayback, secondAnalysis: secondPlayback };
  });

  // TEST 6: Multiple files in batch analysis
  summary['6_batchAnalysis'] = await testScenario(page, '6. Multiple files in batch analysis', async (p) => {
    await p.goto('http://localhost:5173/analyze', { waitUntil: 'networkidle2' });
    const fileInput = await p.$('#multi-file-input');
    await fileInput.uploadFile(TEST_FILES.cleanWav, TEST_FILES.mp3Audio);
    await new Promise(r => setTimeout(r, 1000));

    const analyzeBtn = await p.$('.btn-action-primary');
    await analyzeBtn.click();
    await p.waitForSelector('.workspace-results-section', { timeout: 45000 });
    await new Promise(r => setTimeout(r, 2000));

    // Test playback of first item
    const item1Playback = await verifyAudioPlayback(p);

    // Click second item in table
    const secondRow = await p.$('.table-container tbody tr:nth-child(2)');
    if (secondRow) {
      console.log('Switching to second item in queue table...');
      await secondRow.click();
      await new Promise(r => setTimeout(r, 800));
    }
    const item2Playback = await verifyAudioPlayback(p);

    return { file1: item1Playback, file2: item2Playback };
  });

  // TEST 7: Playback after navigating away and returning to results
  summary['7_navigateAwayAndReturn'] = await testScenario(page, '7. Playback after navigating away and returning', async (p) => {
    await p.goto('http://localhost:5173/analyze', { waitUntil: 'networkidle2' });
    await uploadAndAnalyze(p, TEST_FILES.cleanWav);
    const beforeNav = await verifyAudioPlayback(p);

    // Navigate to /about
    console.log('Navigating away to /about...');
    await p.goto('http://localhost:5173/about', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // Return to /analyze
    console.log('Returning back to /analyze...');
    await p.goto('http://localhost:5173/analyze', { waitUntil: 'networkidle2' });
    await uploadAndAnalyze(p, TEST_FILES.cleanWav);
    const afterReturn = await verifyAudioPlayback(p);

    return { beforeNav, afterReturn };
  });

  console.log('\n======================================================');
  console.log('FINAL REGRESSION TEST SUMMARY');
  console.log('======================================================');
  let allPassed = true;
  for (const [name, res] of Object.entries(summary)) {
    const passed = res.success;
    if (!passed) allPassed = false;
    console.log(`${name}: ${passed ? 'PASSED ✅' : 'FAILED ❌'}`);
  }

  await browser.close();
  if (!allPassed) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
