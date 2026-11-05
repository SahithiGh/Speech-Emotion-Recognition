const fs = require('fs');
const puppeteer = require('puppeteer-core');

const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  const refUrl = 'file:///' + refPath.replace(/\\/g, '/');
  await page.goto(refUrl);

  const result = await page.evaluate(() => {
    const img = document.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = idata.data;

    // For every y from 100 to 216, find the center and edges of each dark stripe
    // A stripe is a local minimum of brightness
    const yRows = {};
    for (let y = 104; y <= 212; y += 4) {
      const row = [];
      for (let x = 96; x <= 220; x++) {
        const i = (y * canvas.width + x) * 4;
        row.push((d[i] + d[i+1] + d[i+2]) / 3);
      }
      
      // Find local minima below 120
      const minima = [];
      for (let i = 1; i < row.length - 1; i++) {
        if (row[i] < 120 && row[i] <= row[i-1] && row[i] <= row[i+1]) {
          // If previous minima was very close, only take lower
          if (minima.length > 0 && (i - minima[minima.length-1].idx) <= 2) {
            if (row[i] < minima[minima.length-1].val) {
              minima[minima.length-1] = { idx: i, x: 96 + i, val: Math.round(row[i]) };
            }
          } else {
            minima.push({ idx: i, x: 96 + i, val: Math.round(row[i]) });
          }
        }
      }
      yRows[y] = { count: minima.length, xs: minima.map(m => m.x) };
    }

    return yRows;
  });

  console.log('Detected stripe center X positions at each Y:');
  for (const [y, row] of Object.entries(result)) {
    console.log(`y=${y} (count=${row.count}):`, row.xs.join(', '));
  }

  await browser.close();
})();

