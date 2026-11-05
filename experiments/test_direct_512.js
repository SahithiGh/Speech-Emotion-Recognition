const fs = require('fs');
const puppeteer = require('puppeteer-core');

const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';
const refBase64 = fs.readFileSync(refPath).toString('base64');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();

  const { blackPng512, whitePng512 } = await page.evaluate((b64) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Step 1: Draw source image onto a canvas
        const sCanvas = document.createElement('canvas');
        sCanvas.width = img.naturalWidth; // 316
        sCanvas.height = img.naturalHeight; // 316
        const sCtx = sCanvas.getContext('2d');
        sCtx.drawImage(img, 0, 0);

        const sData = sCtx.getImageData(0, 0, 316, 316).data;

        // Bounding box of the symbol in 316x316:
        // x: 100 to 215 (width 116)
        // y: 100 to 216 (height 117)
        const minX = 100, maxX = 215;
        const minY = 100, maxY = 216;
        const symW = maxX - minX + 1; // 116
        const symH = maxY - minY + 1; // 117
        const size = Math.max(symW, symH); // 117

        // Create a tight 117x117 alpha-matted canvas with 0 extra padding
        const mCanvas = document.createElement('canvas');
        mCanvas.width = size;
        mCanvas.height = size;
        const mCtx = mCanvas.getContext('2d');
        const mImgData = mCtx.createImageData(size, size);
        const mD = mImgData.data;

        // Extract alpha with clean gaps:
        // In the original image:
        // Black stripe core has luminance < 30.
        // Edge transition is between 30 and 130.
        // Beige background and gaps have luminance > 130 (up to 230).
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const sIdx = (y * 316 + x) * 4;
            const r = sData[sIdx], g = sData[sIdx+1], b = sData[sIdx+2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;

            const destX = x - minX;
            const destY = y - minY;
            const destIdx = (destY * size + destX) * 4;

            // Optical alpha calculation:
            // Lum > 130 -> 100% transparent gap
            // Lum < 35 -> 100% solid stripe
            // In between -> smooth anti-aliased edge
            let alpha = 0;
            if (lum < 130) {
              if (lum <= 35) {
                alpha = 1.0;
              } else {
                alpha = (130 - lum) / (130 - 35);
                // Hermite smoothstep
                alpha = alpha * alpha * (3 - 2 * alpha);
              }
            }

            const aByte = Math.round(alpha * 255);
            // Black symbol
            mD[destIdx] = 10;
            mD[destIdx+1] = 17;
            mD[destIdx+2] = 40;
            mD[destIdx+3] = aByte;
          }
        }
        mCtx.putImageData(mImgData, 0, 0);

        // Step 2: Now upscale this tight alpha-matted symbol onto a 512x512 high-resolution canvas
        // using high-quality image smoothing
        const targetSize = 512;
        const pad = 12; // 12px subpixel padding in 512x512 = 2.3%
        const drawSize = targetSize - pad * 2;

        const bCanvas = document.createElement('canvas');
        bCanvas.width = targetSize;
        bCanvas.height = targetSize;
        const bCtx = bCanvas.getContext('2d');
        bCtx.imageSmoothingEnabled = true;
        bCtx.imageSmoothingQuality = 'high';
        bCtx.drawImage(mCanvas, pad, pad, drawSize, drawSize);

        // Also create white version on 512x512
        const wCanvas = document.createElement('canvas');
        wCanvas.width = targetSize;
        wCanvas.height = targetSize;
        const wCtx = wCanvas.getContext('2d');
        wCtx.imageSmoothingEnabled = true;
        wCtx.imageSmoothingQuality = 'high';

        // Draw black first to get smoothed alpha, then replace RGB with #FAF9F5
        wCtx.drawImage(mCanvas, pad, pad, drawSize, drawSize);
        const wImgData = wCtx.getImageData(0, 0, targetSize, targetSize);
        const wD = wImgData.data;
        for (let i = 0; i < wD.length; i += 4) {
          wD[i] = 250;     // #FAF9F5
          wD[i+1] = 249;
          wD[i+2] = 245;
          // wD[i+3] remains exact anti-aliased alpha
        }
        wCtx.putImageData(wImgData, 0, 0);

        resolve({
          blackPng512: bCanvas.toDataURL('image/png'),
          whitePng512: wCanvas.toDataURL('image/png')
        });
      };
      img.src = 'data:image/jpeg;base64,' + b64;
    });
  }, refBase64);

  // Now test this 512x512 high-res asset rendered at 28px, 32px, 36px, 38px, 40px in light and dark
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 40px; font-family: -apple-system, sans-serif; background: #F1EFEA; }
        .card { background: #FAF9F5; padding: 28px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #E2E8F0; }
        .card.dark { background: #0A1128; color: #FAF9F5; border-color: #1E293B; }
        .sizes-row { display: flex; align-items: flex-end; gap: 32px; margin-top: 16px; }
        .size-box { display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 13px; font-family: monospace; }
        .nav-sim { display: flex; align-items: center; gap: 14px; height: 68px; padding: 0 24px; border-radius: 8px; font-weight: 600; font-size: 17px; margin-top: 16px; }
        .nav-sim.light { background: #FAF9F5; color: #0A1128; border: 1px solid #E2E8F0; }
        .nav-sim.dark { background: #0A1128; color: #FAF9F5; border: 1px solid #1E293B; }
      </style>
    </head>
    <body>
      <h2>Direct 512x512 Clean-Gap Extraction Test (Exact Original Silhouette & Stripes)</h2>

      <div class="card">
        <h3>Light Theme: 512px High-Res Master Downscaled in Browser</h3>
        <div class="sizes-row">
          <div class="size-box">
            <img src="${blackPng512}" width="28" height="28" />
            <span>28px (Old)</span>
          </div>
          <div class="size-box">
            <img src="${blackPng512}" width="32" height="32" />
            <span>32px</span>
          </div>
          <div class="size-box">
            <img src="${blackPng512}" width="36" height="36" />
            <span>36px</span>
          </div>
          <div class="size-box" style="border: 2px solid #2563EB; padding: 4px; border-radius: 6px;">
            <img src="${blackPng512}" width="38" height="38" />
            <span style="font-weight: bold; color: #2563EB;">38px (Target)</span>
          </div>
          <div class="size-box">
            <img src="${blackPng512}" width="40" height="40" />
            <span>40px</span>
          </div>
          <div class="size-box">
            <img src="${blackPng512}" width="116" height="116" />
            <span>116px (1:1 Native)</span>
          </div>
        </div>

        <h4 style="margin-top: 24px;">Navbar Simulation (Light, 38px)</h4>
        <div class="nav-sim light">
          <img src="${blackPng512}" width="38" height="38" />
          <span>Speech Emotion Recognition</span>
        </div>
      </div>

      <div class="card dark">
        <h3>Dark Theme: 512px High-Res Master Downscaled in Browser</h3>
        <div class="sizes-row">
          <div class="size-box">
            <img src="${whitePng512}" width="28" height="28" />
            <span>28px (Old)</span>
          </div>
          <div class="size-box">
            <img src="${whitePng512}" width="32" height="32" />
            <span>32px</span>
          </div>
          <div class="size-box">
            <img src="${whitePng512}" width="36" height="36" />
            <span>36px</span>
          </div>
          <div class="size-box" style="border: 2px solid #60A5FA; padding: 4px; border-radius: 6px;">
            <img src="${whitePng512}" width="38" height="38" />
            <span style="font-weight: bold; color: #60A5FA;">38px (Target)</span>
          </div>
          <div class="size-box">
            <img src="${whitePng512}" width="40" height="40" />
            <span>40px</span>
          </div>
          <div class="size-box">
            <img src="${whitePng512}" width="116" height="116" />
            <span>116px (1:1 Native)</span>
          </div>
        </div>

        <h4 style="margin-top: 24px;">Navbar Simulation (Dark, 38px)</h4>
        <div class="nav-sim dark">
          <img src="${whitePng512}" width="38" height="38" />
          <span>Speech Emotion Recognition</span>
        </div>
      </div>
    </body>
    </html>
  `;

  await page.setContent(html);
  const outPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/07_direct_512_extraction_test.png';
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('Saved 512 extraction test to:', outPath);

  await browser.close();
})();

