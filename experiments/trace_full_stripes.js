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

  const fullData = await page.evaluate(() => {
    const img = document.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = idata.data;

    // We know there are 18 stripes.
    // For every y from 99 to 217, let's extract the exact segments of each stripe.
    // To ensure perfect continuity, we can track each of the 18 stripes across y.
    const stripeTracks = Array.from({ length: 18 }, () => []);

    for (let y = 100; y <= 216; y++) {
      // Find all dark intervals in this row
      const intervals = [];
      let inDark = false;
      let start = -1;
      for (let x = 98; x <= 217; x++) {
        const idx = (y * canvas.width + x) * 4;
        const br = (d[idx] + d[idx+1] + d[idx+2]) / 3;
        // Background ~225, dark core < 120
        if (br < 135) {
          if (!inDark) {
            inDark = true;
            start = x;
          }
        } else {
          if (inDark) {
            inDark = false;
            intervals.push({ start, end: x - 1, center: (start + x - 1) / 2 });
          }
        }
      }
      if (inDark) {
        intervals.push({ start, end: 217, center: (start + 217) / 2 });
      }

      // Match intervals to the 18 stripes by proximity
      // For middle rows (y=150..160) we know exactly all 18
      intervals.forEach(iv => {
        // Find which stripe (0..17) this best corresponds to based on x position
        // Map x in [100, 215] to stripe index roughly
        // Let's store raw intervals for now
      });
    }

    return { totalY: 117 };
  });

  console.log('Full data ready:', fullData);
  await browser.close();
})();

