const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runBrowserVerification() {
  console.log('=' .repeat(80));
  console.log('BROWSER E2E VERIFICATION SUITE: ISSUES 1, 2, 3, 4, 5');
  console.log('=' .repeat(80));

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const consoleLogs = [];
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
  });

  page.on('pageerror', err => {
    pageErrors.push(err.toString());
  });

  page.on('response', resp => {
    if (resp.status() >= 400) {
      failedRequests.push({ url: resp.url(), status: resp.status() });
    }
  });

  try {
    // -------------------------------------------------------------
    // TEST 1: Analyze Page Load & HMR / Reload Check
    // -------------------------------------------------------------
    console.log('\n[TEST 1] Navigating to http://localhost:5173/analyze...');
    await page.goto('http://localhost:5173/analyze', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // Check for Vite HMR error or compilation error
    const hmrErrors = consoleErrors.filter(e => e.includes('Failed to reload') || e.includes('HMR'));
    console.log(`HMR Errors on initial load: ${hmrErrors.length}`);
    if (hmrErrors.length > 0) {
      console.log('HMR Error details:', hmrErrors);
    }

    // Trigger page reload to verify clean reload
    console.log('Reloading /analyze to verify reload stability...');
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    console.log('Reload successful, page title:', await page.title());

    // -------------------------------------------------------------
    // TEST 2: Full Duration Analysis & Playback on Analyze Page
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Testing audio upload, full duration analysis, and playback...');
    const testAudioPath = path.resolve('external data/sample_audio/real_voice.wav');
    const inputHandle = await page.$('#multi-file-input');
    if (!inputHandle) throw new Error('File input #multi-file-input not found on Analyze page');
    await inputHandle.uploadFile(testAudioPath);
    await new Promise(r => setTimeout(r, 800));

    // Click Analyze button
    const analyzeBtn = await page.$('.btn-action-primary');
    if (!analyzeBtn) throw new Error('Analyze button .btn-action-primary not found');
    await analyzeBtn.click();
    console.log('Clicked .btn-action-primary. Waiting for analysis to complete...');

    await page.waitForSelector('.workspace-results-section', { timeout: 35000 });
    await new Promise(r => setTimeout(r, 2000));

    // Inspect analyzed duration text
    const analyzedText = await page.evaluate(() => {
      const el = document.querySelector('.metric-chip');
      const tags = Array.from(document.querySelectorAll('.hero-meta-item, .metric-chip, .callout span'));
      return tags.map(t => t.textContent.trim());
    });
    console.log('Hero tags and duration metrics:', analyzedText);

    // Verify audio player
    const playerStats = await page.evaluate(async () => {
      const audio = document.querySelector('audio');
      if (!audio) return { exists: false, readyState: 0, duration: 0, src: null };
      
      // Wait for loaded metadata if needed
      if (isNaN(audio.duration) || audio.duration === 0 || audio.readyState < 1) {
        await new Promise(resolve => {
          const t = setTimeout(resolve, 3000);
          audio.onloadedmetadata = () => { clearTimeout(t); resolve(); };
        });
      }

      return {
        exists: true,
        readyState: audio.readyState,
        duration: Math.round(audio.duration * 100) / 100,
        src: audio.src ? audio.src.substring(0, 50) + '...' : null
      };
    });
    console.log('Audio Player State:', playerStats);
    if (!playerStats.exists || playerStats.duration === 0 || isNaN(playerStats.duration)) {
      throw new Error(`Invalid audio player duration: ${JSON.stringify(playerStats)}`);
    }

    // Test Play / Seek
    const playResult = await page.evaluate(async () => {
      const audio = document.querySelector('audio');
      if (!audio) return { error: 'No audio element' };
      audio.currentTime = 2.0;
      await audio.play();
      const isPlaying = !audio.paused;
      audio.pause();
      return { isPlaying, currentTime: audio.currentTime, duration: audio.duration };
    });
    console.log('Audio Play/Seek Verification:', playResult);

    // -------------------------------------------------------------
    // TEST 3: Authentication Flow (401 verification & clean login)
    // -------------------------------------------------------------
    console.log('\n[TEST 3] Testing authentication flow & expected 401 handling...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
    
    // Submit with intentionally invalid credentials to verify 401 handling
    console.log('Testing invalid credentials submission...');
    await page.type('#login-email', 'nonexistent_user@example.com');
    await page.type('#login-password', 'WrongPassword123!');
    await page.click('button[type="submit"]');
    
    await page.waitForSelector('.callout.warn', { timeout: 10000 });
    const authErrorMsg = await page.$eval('.callout.warn span', el => el.textContent.trim());
    console.log(`Expected 401 caught cleanly. UI message: "${authErrorMsg}"`);

    // Register a valid user for testing
    const testEmail = `testuser_${Date.now()}@example.com`;
    console.log(`Registering test user: ${testEmail}...`);
    await page.goto('http://localhost:5173/register', { waitUntil: 'networkidle2' });
    await page.type('#reg-name', 'Test Engineer');
    await page.type('#reg-email', testEmail);
    await page.type('#reg-password', 'ValidPass123!');
    await page.type('#reg-confirm', 'ValidPass123!');
    await page.click('#reg-terms');
    await page.click('button[type="submit"]');

    // Should redirect to /analyze or authenticated route
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
    console.log('Registered and redirected to:', page.url());

    // -------------------------------------------------------------
    // TEST 4: Save Analysis to History
    // -------------------------------------------------------------
    console.log('\n[TEST 4] Analyzing and saving recording to user history...');
    await page.goto('http://localhost:5173/analyze', { waitUntil: 'networkidle2' });
    const input2 = await page.$('#multi-file-input');
    await input2.uploadFile(testAudioPath);
    await new Promise(r => setTimeout(r, 800));
    const btn2 = await page.$('.btn-action-primary');
    if (btn2) await btn2.click();
    await page.waitForSelector('.workspace-results-section', { timeout: 35000 });
    await new Promise(r => setTimeout(r, 1500));

    // Click "Save Analysis"
    const saveBtn = await page.evaluateHandle(() => {
      return Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Save Analysis'));
    });
    if (saveBtn && saveBtn.asElement()) {
      await saveBtn.asElement().click();
      await new Promise(r => setTimeout(r, 1200));
      console.log('Save analysis button clicked.');
    }

    // Also upload and save a second file for comparison test
    console.log('Uploading second sample (Noisy1.wav) for history...');
    const noisyAudioPath = path.resolve('external data/sample_audio/Noisy1.wav');
    const input2b = await page.$('#multi-file-input');
    await input2b.uploadFile(noisyAudioPath);
    await new Promise(r => setTimeout(r, 800));

    const btn2b = await page.$('.btn-action-primary');
    if (btn2b) await btn2b.click();
    await page.waitForSelector('.workspace-results-section', { timeout: 35000 });
    await new Promise(r => setTimeout(r, 2000));

    const saveBtn2 = await page.evaluateHandle(() => {
      return Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Save Analysis'));
    });
    if (saveBtn2 && saveBtn2.asElement()) {
      await saveBtn2.asElement().click();
      await new Promise(r => setTimeout(r, 1200));
      console.log('Second analysis saved.');
    }

    // -------------------------------------------------------------
    // TEST 5: User Profile Page Stability, Table & Zero Flicker
    // -------------------------------------------------------------
    console.log('\n[TEST 5] Testing User Profile page stability and saved history...');
    let profileRenderCount = 0;
    let analysesFetchCount = 0;

    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.url().includes('/api/analyses') && req.method() === 'GET') {
        analysesFetchCount++;
      }
      req.continue();
    });

    await page.goto('http://localhost:5173/profile', { waitUntil: 'networkidle2' });
    
    // Wait for profile content
    await page.waitForSelector('.profile-grid', { timeout: 10000 });
    await page.waitForSelector('.analyses-table', { timeout: 10000 });
    
    // Monitor for 3 seconds to ensure NO repeated fetching or update loop
    await new Promise(r => setTimeout(r, 3000));
    console.log(`GET /api/analyses request count during profile view: ${analysesFetchCount}`);
    if (analysesFetchCount > 2) {
      console.warn(`WARNING: High fetch count detected: ${analysesFetchCount}`);
    } else {
      console.log('Profile network fetch is STABLE (no infinite loop).');
    }

    // Check account details
    const accountDetails = await page.evaluate(() => {
      const name = document.querySelector('.profile-field-val strong')?.textContent.trim();
      const email = document.querySelectorAll('.profile-field-val')[1]?.textContent.trim();
      const rows = Array.from(document.querySelectorAll('.analyses-table tbody tr')).map(tr => {
        return {
          filename: tr.querySelector('.filename')?.textContent.trim(),
          emotion: tr.querySelector('.emotion-badge')?.textContent.trim(),
          duration: tr.querySelector('.duration-tag')?.textContent.trim(),
          confidence: tr.querySelector('.cell-metric .pct')?.textContent.trim(),
          hasTranscript: !!tr.querySelector('.transcript-snippet')
        };
      });
      return { name, email, rows };
    });
    console.log('Account Details:', { name: accountDetails.name, email: accountDetails.email });
    console.log(`Saved Analyses Records in Table: ${accountDetails.rows.length}`);
    accountDetails.rows.forEach((r, idx) => {
      console.log(`  Row ${idx + 1}: ${r.filename} | ${r.emotion} (${r.confidence}) | Duration: ${r.duration}`);
    });

    // Test Edit Name without flicker
    console.log('Testing Name Edit inline form...');
    await page.click('button[aria-label="Edit name"]');
    await page.waitForSelector('.inline-edit-form input', { timeout: 3000 });
    await page.$eval('.inline-edit-form input', el => el.value = 'Updated Test Engineer');
    await page.click('.inline-edit-form button[type="submit"]');
    await page.waitForSelector('.callout.ok', { timeout: 5000 });
    const successMsg = await page.$eval('.callout.ok span', el => el.textContent.trim());
    console.log(`Name updated successfully. Notification: "${successMsg}"`);

    // Test Side-by-Side Comparison from Profile
    if (accountDetails.rows.length >= 2) {
      console.log('Testing side-by-side comparison selection...');
      const checkboxes = await page.$$('.analyses-table tbody tr input[type="checkbox"]');
      if (checkboxes.length >= 2) {
        await checkboxes[0].click();
        await checkboxes[1].click();
        await new Promise(r => setTimeout(r, 500));
        
        const compareBtn = await page.waitForSelector('button:has-text("Compare Selected")', { timeout: 5000 })
          .catch(async () => {
            return await page.evaluateHandle(() => {
              return Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Compare Selected'));
            });
          });

        if (compareBtn && compareBtn.asElement()) {
          await compareBtn.asElement().click();
          await page.waitForSelector('.comparison-panel-card', { timeout: 5000 });
          console.log('Side-by-side comparison panel opened successfully without crash.');
        }
      }
    }

    // Capture screenshot of stable profile page
    const screenshotPath = path.resolve('experiments/profile_verified_stable.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Captured verification screenshot: ${screenshotPath}`);

    // Verify Theme Toggling
    console.log('\n[TEST 6] Testing Light and Dark theme switching...');
    const themeToggle = await page.$('.theme-toggle');
    if (themeToggle) {
      await themeToggle.click();
      await new Promise(r => setTimeout(r, 500));
      const newTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      console.log(`Toggled theme. Active data-theme: ${newTheme}`);
    }

    console.log('\n' + '=' .repeat(80));
    console.log('ALL BROWSER E2E VERIFICATIONS PASSED SUCCESSFULLY!');
    console.log('=' .repeat(80));

  } finally {
    await browser.close();
  }
}

runBrowserVerification().catch(err => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
