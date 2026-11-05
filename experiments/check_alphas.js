const fs = require('fs');
const puppeteer = require('puppeteer-core');
const path = require('path');

const blackPath = path.join(__dirname, '../frontend/public/logo-black.png');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  const blackUrl = 'file:///' + blackPath.replace(/\\/g, '/');
  await page.goto(blackUrl);

  const alphas = await page.evaluate(() => {
    const img = document.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = idata.data;

    // Check row y = 71 (approx center of 142)
    const midY = 71;
    const rowAlphas = [];
    for (let x = 0; x < canvas.width; x++) {
      const idx = (midY * canvas.width + x) * 4;
      rowAlphas.push(d[idx + 3]);
    }
    return {
      width: canvas.width,
      height: canvas.height,
      midY,
      rowAlphas
    };
  });

  console.log('Current logo-black.png center row alphas (0 to 142):');
  // Group into stripes and gaps
  console.log(alphas.rowAlphas.map(a => a === 0 ? '.' : a > 200 ? '#' : ':').join(''));
  console.log('\nExact alpha numbers:');
  console.log(alphas.rowAlphas.slice(10, 132).join(' '));

  await browser.close();
})();

