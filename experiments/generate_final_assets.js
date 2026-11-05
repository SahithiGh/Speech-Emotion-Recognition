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

  const generated = await page.evaluate((b64) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Source image (316x316)
        const sCanvas = document.createElement('canvas');
        sCanvas.width = 316;
        sCanvas.height = 316;
        const sCtx = sCanvas.getContext('2d');
        sCtx.drawImage(img, 0, 0);

        const sData = sCtx.getImageData(0, 0, 316, 316).data;

        // Bounding box of symbol:
        // minX = 100, maxX = 215 -> w = 116
        // minY = 100, maxY = 216 -> h = 117
        const minX = 100, maxX = 215;
        const minY = 100, maxY = 216;
        const w = maxX - minX + 1; // 116
        const h = maxY - minY + 1; // 117
        const size = Math.max(w, h); // 117

        // 1. Create tight 117x117 alpha-matted mask directly from original pixels
        // Threshold: 118 with smoothstep falloff between 32 and 118
        // This ensures the gaps are 100% transparent while preserving every stripe's exact contour and tips!
        const mCanvas = document.createElement('canvas');
        mCanvas.width = size;
        mCanvas.height = size;
        const mCtx = mCanvas.getContext('2d');
        const mImgData = mCtx.createImageData(size, size);
        const mD = mImgData.data;

        const th = 118;
        const minL = 32;

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
              if (lum <= minL) {
                alpha = 1.0;
              } else {
                alpha = (th - lum) / (th - minL);
                alpha = alpha * alpha * (3 - 2 * alpha); // Smooth Hermite falloff
              }
            }

            const aByte = Math.round(alpha * 255);
            // Black symbol (#0A1128)
            mD[destIdx] = 10;
            mD[destIdx+1] = 17;
            mD[destIdx+2] = 40;
            mD[destIdx+3] = aByte;
          }
        }
        mCtx.putImageData(mImgData, 0, 0);

        // 2. High-resolution master: 512x512 with minimal tight subpixel padding (6px = 1.1%)
        // This ensures the symbol occupies 98% of the box (zero wasted empty space)
        const target512 = 512;
        const pad = 6;
        const drawSize = target512 - pad * 2; // 500px

        // Black 512
        const bCanvas = document.createElement('canvas');
        bCanvas.width = target512;
        bCanvas.height = target512;
        const bCtx = bCanvas.getContext('2d');
        bCtx.imageSmoothingEnabled = true;
        bCtx.imageSmoothingQuality = 'high';
        bCtx.drawImage(mCanvas, pad, pad, drawSize, drawSize);

        // White 512 (#FAF9F5)
        const wCanvas = document.createElement('canvas');
        wCanvas.width = target512;
        wCanvas.height = target512;
        const wCtx = wCanvas.getContext('2d');
        wCtx.imageSmoothingEnabled = true;
        wCtx.imageSmoothingQuality = 'high';
        wCtx.drawImage(mCanvas, pad, pad, drawSize, drawSize);

        const wImgData = wCtx.getImageData(0, 0, target512, target512);
        const wD = wImgData.data;
        for (let i = 0; i < wD.length; i += 4) {
          wD[i] = 250;     // #FAF9F5
          wD[i+1] = 249;
          wD[i+2] = 245;
          // wD[i+3] is the exact smooth alpha
        }
        wCtx.putImageData(wImgData, 0, 0);

        // 3. Favicon 64x64
        const favCanvas = document.createElement('canvas');
        favCanvas.width = 64;
        favCanvas.height = 64;
        const favCtx = favCanvas.getContext('2d');
        favCtx.imageSmoothingEnabled = true;
        favCtx.imageSmoothingQuality = 'high';
        favCtx.drawImage(bCanvas, 0, 0, 64, 64);

        resolve({
          blackPng: bCanvas.toDataURL('image/png'),
          whitePng: wCanvas.toDataURL('image/png'),
          favPng: favCanvas.toDataURL('image/png')
        });
      };
      img.src = 'data:image/jpeg;base64,' + b64;
    });
  }, refBase64);

  // Write files to frontend/public/
  const blackBuf = Buffer.from(generated.blackPng.replace(/^data:image\/png;base64,/, ''), 'base64');
  const whiteBuf = Buffer.from(generated.whitePng.replace(/^data:image\/png;base64,/, ''), 'base64');
  const favBuf = Buffer.from(generated.favPng.replace(/^data:image\/png;base64,/, ''), 'base64');

  fs.writeFileSync('frontend/public/logo-black.png', blackBuf);
  fs.writeFileSync('frontend/public/logo-white.png', whiteBuf);
  fs.writeFileSync('frontend/public/logo.png', blackBuf);
  fs.writeFileSync('frontend/public/favicon.png', favBuf);

  console.log('Successfully written high-resolution master PNGs to frontend/public/:');
  console.log('  logo-black.png (512x512,', blackBuf.length, 'bytes)');
  console.log('  logo-white.png (512x512,', whiteBuf.length, 'bytes)');
  console.log('  logo.png (512x512,', blackBuf.length, 'bytes)');
  console.log('  favicon.png (64x64,', favBuf.length, 'bytes)');

  await browser.close();
})();

