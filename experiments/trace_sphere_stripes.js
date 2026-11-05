const fs = require('fs');
const puppeteer = require('puppeteer-core');
const path = require('path');

// Let's analyze the exact curves of the 18 stripes in original_logo_reference.jpg
const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  const refUrl = 'file:///' + refPath.replace(/\\/g, '/');
  await page.goto(refUrl);

  // Extract high-resolution paths from original_logo_reference
  const paths = await page.evaluate(() => {
    const img = document.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = idata.data;

    // Center of sphere is (157.5, 158.0), radius ~ 58.5
    const cx = 157.5;
    const cy = 158.0;
    const R = 58.5;

    // For each of the 18 stripes:
    // Let's trace their exact left and right edge points from top to bottom
    // In original image:
    // minX = 100, maxX = 215 (width = 116)
    // minY = 100, maxY = 216 (height = 117)
    
    // Let's create an accurate vector representation normalized to a [0, 100] viewBox
    // For each y from minY to maxY, find segments of dark pixels
    const ySegments = [];
    for (let y = 100; y <= 216; y++) {
      const segs = [];
      let inDark = false;
      let startX = -1;
      for (let x = 98; x <= 217; x++) {
        const idx = (y * canvas.width + x) * 4;
        const r = d[idx], g = d[idx+1], b = d[idx+2];
        const br = (r + g + b) / 3;
        // The beige background is ~225, dark stripe core is < 80
        // Use threshold 135 with edge weighting
        if (br < 135) {
          if (!inDark) {
            inDark = true;
            startX = x;
          }
        } else {
          if (inDark) {
            inDark = false;
            segs.push({ startX, endX: x - 1, y });
          }
        }
      }
      if (inDark) {
        segs.push({ startX, endX: 217, y });
      }
      ySegments.push({ y, segs });
    }

    return {
      cx, cy, R,
      minX: 100, maxX: 215,
      minY: 100, maxY: 216,
      sampleY: ySegments.filter(s => s.y % 10 === 0)
    };
  });

  console.log('Sphere center:', paths.cx, paths.cy, 'Radius:', paths.R);
  console.log('Sample Y segment counts:');
  paths.sampleY.forEach(s => console.log(`  y=${s.y}: ${s.segs.length} stripes`));

  await browser.close();
})();

