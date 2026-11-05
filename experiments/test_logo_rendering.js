const fs = require('fs');
const puppeteer = require('puppeteer-core');
const path = require('path');

// Let's create an extraction script that:
// 1. Analyzes each of the 18 stripes from original_logo_reference.jpg
// 2. Extracts vector polygon/bezier paths for each stripe
// 3. Generates:
//    - High-res crisp SVG with 18 stripes and clean gaps
//    - High-res 512x512 transparent PNG (tight bounds, 0 padding) for logo-black.png
//    - High-res 512x512 transparent PNG (tight bounds, 0 padding) for logo-white.png
// 4. Renders side-by-side comparisons at 28px, 32px, 36px, 40px, and 120px against the original reference image!

const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  const refUrl = 'file:///' + refPath.replace(/\\/g, '/');
  await page.goto(refUrl);

  const extraction = await page.evaluate(() => {
    const img = document.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = idata.data;

    // Bounds of symbol:
    // x: 100 to 215, y: 100 to 216
    const minX = 100, maxX = 215;
    const minY = 100, maxY = 216;
    const symW = maxX - minX + 1; // 116
    const symH = maxY - minY + 1; // 117

    // Let's build a tight 512x512 high-resolution canvas
    // First, sample the reference at subpixel resolution or high-res vector
    // At midY 158, let's identify the 18 stripes' exact centers and widths
    const midY = 158;
    const stripes = [];
    let inStripe = false;
    let sStart = 0;
    for (let x = minX; x <= maxX; x++) {
      const idx = (midY * canvas.width + x) * 4;
      const br = (d[idx] + d[idx+1] + d[idx+2]) / 3;
      if (br < 110) {
        if (!inStripe) {
          inStripe = true;
          sStart = x;
        }
      } else {
        if (inStripe) {
          inStripe = false;
          stripes.push({ start: sStart, end: x - 1, center: (sStart + x - 1) / 2, width: x - sStart });
        }
      }
    }
    if (inStripe) {
      stripes.push({ start: sStart, end: maxX, center: (sStart + maxX) / 2, width: maxX - sStart + 1 });
    }

    return {
      symW, symH,
      stripeCount: stripes.length,
      stripes
    };
  });

  console.log('Stripe extraction summary:', extraction);
  await browser.close();
})();

