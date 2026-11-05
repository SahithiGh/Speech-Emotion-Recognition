const fs = require('fs');
const puppeteer = require('puppeteer-core');
const path = require('path');

const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';
const refBase64 = fs.readFileSync(refPath).toString('base64');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();

  // Test different gap thresholds: 130, 140, 150, 160
  const extractedImages = await page.evaluate((b64) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = img.naturalWidth;
        fullCanvas.height = img.naturalHeight;
        const fCtx = fullCanvas.getContext('2d');
        fCtx.drawImage(img, 0, 0);

        const imgData = fCtx.getImageData(0, 0, fullCanvas.width, fullCanvas.height);
        const data = imgData.data;

        // Bounding box of the symbol:
        // x: 100 to 215, y: 100 to 216
        // symW = 116, symH = 117
        const minX = 100, maxX = 215;
        const minY = 100, maxY = 216;
        const w = maxX - minX + 1; // 116
        const h = maxY - minY + 1; // 117
        const size = Math.max(w, h); // 117

        // Test thresholds
        const thresholds = [120, 135, 150, 165];
        const results = {};

        thresholds.forEach(th => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const outData = ctx.createImageData(size, size);
          const outD = outData.data;

          // Also create high-res 512x512
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              const srcIdx = (y * fullCanvas.width + x) * 4;
              const r = data[srcIdx], g = data[srcIdx+1], b = data[srcIdx+2];
              const lum = (0.299 * r + 0.587 * g + 0.114 * b);

              const destX = x - minX;
              const destY = y - minY;
              const destIdx = (destY * size + destX) * 4;

              // High-contrast clean extraction:
              // If lum >= th: pure background gap -> alpha = 0
              // If lum <= 40: pure black stripe -> alpha = 255
              // Between 40 and th: smooth anti-aliased edge
              let alpha = 0;
              if (lum < th) {
                if (lum <= 40) {
                  alpha = 1.0;
                } else {
                  alpha = (th - lum) / (th - 40);
                  // S-curve for punchy stripe edges
                  alpha = alpha * alpha * (3 - 2 * alpha);
                }
              }

              const aByte = Math.round(alpha * 255);
              // Black version
              outD[destIdx] = 10;
              outD[destIdx+1] = 17;
              outD[destIdx+2] = 40;
              outD[destIdx+3] = aByte;
            }
          }
          ctx.putImageData(outData, 0, 0);
          results[th] = canvas.toDataURL('image/png');
        });

        resolve(results);
      };
      img.src = 'data:image/jpeg;base64,' + b64;
    });
  }, refBase64);

  // Now create comparison test page with these extracted PNGs rendered at 28px, 32px, 36px, 38px, 40px
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 30px; font-family: -apple-system, sans-serif; background: #FAF9F5; color: #0A1128; }
        .row { display: flex; align-items: center; gap: 24px; margin-bottom: 24px; padding: 16px; background: #fff; border: 1px solid #E2E8F0; border-radius: 8px; }
        .item { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; font-family: monospace; }
        .nav-sim { display: flex; align-items: center; gap: 12px; font-weight: 600; font-size: 17px; }
      </style>
    </head>
    <body>
      <h2>Clean-Gap Extraction Threshold Test (at 28px, 32px, 36px, 38px, 40px)</h2>
      ${[120, 135, 150, 165].map(th => `
        <div class="row">
          <div class="item" style="width: 140px; font-weight: bold;">
            <span>Threshold = ${th}</span>
            <img src="${extractedImages[th]}" width="64" height="64" style="border: 1px solid #eee;" />
          </div>
          <div class="item">
            <span>28px</span>
            <img src="${extractedImages[th]}" width="28" height="28" />
          </div>
          <div class="item">
            <span>32px</span>
            <img src="${extractedImages[th]}" width="32" height="32" />
          </div>
          <div class="item">
            <span>36px</span>
            <img src="${extractedImages[th]}" width="36" height="36" />
          </div>
          <div class="item">
            <span>38px</span>
            <img src="${extractedImages[th]}" width="38" height="38" />
          </div>
          <div class="item">
            <span>40px</span>
            <img src="${extractedImages[th]}" width="40" height="40" />
          </div>
          <div class="nav-sim" style="margin-left: 20px;">
            <img src="${extractedImages[th]}" width="38" height="38" />
            <span>Speech Emotion Recognition</span>
          </div>
        </div>
      `).join('')}
    </body>
    </html>
  `;

  await page.setContent(html);
  const outPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/03_threshold_comparison.png';
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('Saved threshold comparison to:', outPath);

  await browser.close();
})();

