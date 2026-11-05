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

  const comparisons = await page.evaluate((b64) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const sCanvas = document.createElement('canvas');
        sCanvas.width = 316;
        sCanvas.height = 316;
        const sCtx = sCanvas.getContext('2d');
        sCtx.drawImage(img, 0, 0);

        const sData = sCtx.getImageData(0, 0, 316, 316).data;
        const minX = 100, maxX = 215, minY = 100, maxY = 216;
        const size = Math.max(maxX - minX + 1, maxY - minY + 1);

        const thresholds = [110, 118, 128];
        const out = {};

        thresholds.forEach(th => {
          const mCanvas = document.createElement('canvas');
          mCanvas.width = size;
          mCanvas.height = size;
          const mCtx = mCanvas.getContext('2d');
          const mImgData = mCtx.createImageData(size, size);
          const mD = mImgData.data;

          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              const sIdx = (y * 316 + x) * 4;
              const r = sData[sIdx], g = sData[sIdx+1], b = sData[sIdx+2];
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;

              const destX = x - minX;
              const destY = y - minY;
              const destIdx = (destY * size + destX) * 4;

              let alpha = 0;
              if (lum < th) {
                if (lum <= 32) {
                  alpha = 1.0;
                } else {
                  alpha = (th - lum) / (th - 32);
                  alpha = Math.pow(alpha, 1.25); // slightly crisper edge falloff
                }
              }

              const aByte = Math.round(alpha * 255);
              mD[destIdx] = 10;
              mD[destIdx+1] = 17;
              mD[destIdx+2] = 40;
              mD[destIdx+3] = aByte;
            }
          }
          mCtx.putImageData(mImgData, 0, 0);

          // 512x512
          const target = 512;
          const bCanvas = document.createElement('canvas');
          bCanvas.width = target;
          bCanvas.height = target;
          const bCtx = bCanvas.getContext('2d');
          bCtx.imageSmoothingEnabled = true;
          bCtx.imageSmoothingQuality = 'high';
          bCtx.drawImage(mCanvas, 8, 8, target - 16, target - 16);

          out[th] = bCanvas.toDataURL('image/png');
        });

        resolve(out);
      };
      img.src = 'data:image/jpeg;base64,' + b64;
    });
  }, refBase64);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 30px; font-family: -apple-system, sans-serif; background: #FAF9F5; }
        .row { display: flex; align-items: center; gap: 32px; padding: 20px; background: #fff; margin-bottom: 20px; border-radius: 8px; border: 1px solid #E2E8F0; }
        .item { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 13px; font-family: monospace; }
        .nav-sim { display: flex; align-items: center; gap: 12px; font-weight: 600; font-size: 17px; margin-left: 20px; }
      </style>
    </head>
    <body>
      <h2>Fine-Tuned Stripe Distinctness Test (Threshold 110 vs 118 vs 128)</h2>
      ${[110, 118, 128].map(th => `
        <div class="row">
          <div class="item" style="width: 140px; font-weight: bold;">
            <span>Threshold = ${th}</span>
            <img src="${comparisons[th]}" width="64" height="64" style="border: 1px solid #eee;" />
          </div>
          <div class="item">
            <span>34px</span>
            <img src="${comparisons[th]}" width="34" height="34" />
          </div>
          <div class="item">
            <span>36px</span>
            <img src="${comparisons[th]}" width="36" height="36" />
          </div>
          <div class="item">
            <span>38px</span>
            <img src="${comparisons[th]}" width="38" height="38" />
          </div>
          <div class="item">
            <span>40px</span>
            <img src="${comparisons[th]}" width="40" height="40" />
          </div>
          <div class="nav-sim">
            <img src="${comparisons[th]}" width="38" height="38" />
            <span>Speech Emotion Recognition</span>
          </div>
        </div>
      `).join('')}
    </body>
    </html>
  `;

  await page.setContent(html);
  const outPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/08_fine_tuned_distinctness.png';
  await page.screenshot({ path: outPath });
  console.log('Saved fine tuned distinctness to:', outPath);

  await browser.close();
})();

