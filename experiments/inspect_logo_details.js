const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const refPath = 'C:/Users/JAI-SREE-RAM/.gemini/antigravity/brain/cb96c2cc-5be4-4858-b66a-ba5c125cf3fc/original_logo_reference.jpg';
const blackPath = path.join(__dirname, '../frontend/public/logo-black.png');
const whitePath = path.join(__dirname, '../frontend/public/logo-white.png');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();

  // Inspect black logo
  const blackUrl = 'file:///' + blackPath.replace(/\\/g, '/');
  const refUrl = 'file:///' + refPath.replace(/\\/g, '/');

  await page.goto(blackUrl);
  const blackInfo = await page.evaluate(() => {
    const img = document.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = idata.data;

    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
    let nonTrans = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const idx = (y * canvas.width + x) * 4;
        const a = data[idx + 3];
        if (a > 10) {
          nonTrans++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      nonTrans,
      bbox: { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 }
    };
  });

  console.log('Black logo info:\n', JSON.stringify(blackInfo, null, 2));

  // Inspect reference image
  await page.goto(refUrl);
  const refInfo = await page.evaluate(() => {
    const img = document.querySelector('img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = idata.data;

    // Detect circle bounds by finding dark pixels (symbol is dark black, background is beige ~235)
    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
    let darkPixels = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const idx = (y * canvas.width + x) * 4;
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        const lum = 0.299*r + 0.587*g + 0.114*b;
        if (lum < 150) {
          darkPixels++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      darkPixels,
      bbox: { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 }
    };
  });

  console.log('Reference logo info:\n', JSON.stringify(refInfo, null, 2));

  await browser.close();
})();

